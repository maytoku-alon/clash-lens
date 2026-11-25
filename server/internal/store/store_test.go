package store_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"clash-lens/pkg/protocol"
	"clash-lens/server/internal/store"
	_ "modernc.org/sqlite"
)

func TestIdempotentIngestAndAnalytics(t *testing.T) {
	ctx := context.Background()
	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	dev, _, err := st.CreateDevice(ctx, protocol.CreateDeviceRequest{
		Name: "本机 Windows",
		OS:   "windows",
	})
	if err != nil {
		t.Fatalf("create device: %v", err)
	}

	if _, err := st.SaveSettings(ctx, protocol.SettingsPayload{
		MonthlyQuotaGB:   100,
		ResetDay:         1,
		BurstThresholdMB: 100,
		NodeMultipliers: []protocol.NodeMultiplierRule{
			{Pattern: "HK-2x", Multiplier: 2.0},
		},
		DomainAliases: []protocol.DomainAliasRule{
			{Domain: "googlevideo.com", Label: "YouTube 视频流"},
		},
	}); err != nil {
		t.Fatalf("save settings: %v", err)
	}

	now := time.Now().Unix()
	minTS := now - (now % 60) - 120

	batch := protocol.IngestBatchRequest{
		BatchID: "batch-001",
		DeviceMeta: protocol.DeviceRuntimeMeta{
			MihomoVersion:   "v1.19.33",
			OS:              "windows",
			TunEnabled:      true,
			SnifferEnabled:  false,
			FindProcessMode: "always",
			InboundMode:     "TUN",
		},
		MinuteTotals: []protocol.MinuteTotalRecord{
			{
				BucketTS:         minTS,
				ProxyUp:          1000,
				ProxyDown:        2_000_000,
				DirectUp:         500,
				DirectDown:       500_000,
				UnattributedUp:   100,
				UnattributedDown: 200,
				ConnCount:        15,
				TunBytes:         500_500,
				ProxyPortBytes:   2_001_000,
			},
		},
		MinuteFlows: []protocol.FlowRecord{
			{
				BucketTS:       minTS,
				ProcessName:    "chrome.exe",
				ProcessDisplay: "Chrome",
				RootDomain:     "googlevideo.com",
				ServiceTag:     "YouTube 视频流",
				Host:           "rr3---sn.googlevideo.com",
				EgressNode:     "HK-2x-01",
				ProxyGroup:     "Proxy",
				RouteType:      protocol.RouteProxy,
				InboundMode:    protocol.InboundProxyPort,
				Rule:           "GEOSITE,youtube",
				UpBytes:        1000,
				DownBytes:      1_500_000,
				ConnCount:      5,
			},
			{
				BucketTS:       minTS,
				ProcessName:    "chrome.exe",
				ProcessDisplay: "Chrome",
				RootDomain:     "googlevideo.com",
				ServiceTag:     "YouTube 视频流",
				Host:           "rr4---sn.googlevideo.com",
				EgressNode:     "HK-2x-01",
				ProxyGroup:     "Proxy",
				RouteType:      protocol.RouteProxy,
				InboundMode:    protocol.InboundProxyPort,
				Rule:           "GEOSITE,youtube",
				UpBytes:        0,
				DownBytes:      500_000,
				ConnCount:      3,
			},
			{
				BucketTS:       minTS,
				ProcessName:    "steam.exe",
				ProcessDisplay: "Steam",
				RootDomain:     "steamcontent.com",
				ServiceTag:     "Steam 下载",
				Host:           "cache1.steamcontent.com",
				EgressNode:     "DIRECT",
				ProxyGroup:     "DIRECT",
				RouteType:      protocol.RouteDirect,
				InboundMode:    protocol.InboundTUN,
				Rule:           "GEOSITE,steam@cn",
				UpBytes:        500,
				DownBytes:      500_000,
				ConnCount:      7,
			},
		},
	}

	dup, err := st.IngestBatch(ctx, dev.ID, batch, 480)
	if err != nil {
		t.Fatalf("ingest first: %v", err)
	}
	if dup {
		t.Fatalf("expected first batch not duplicate")
	}

	// Idempotent replay must skip double counting
	dup, err = st.IngestBatch(ctx, dev.ID, batch, 480)
	if err != nil {
		t.Fatalf("ingest duplicate: %v", err)
	}
	if !dup {
		t.Fatalf("expected second batch to be duplicate")
	}

	f := store.AnalyticsFilter{
		DeviceID:    "all",
		Scope:       "all",
		From:        minTS - 3600,
		To:          now + 60,
		TZOffsetMin: 480,
	}

	ov, err := st.GetOverview(ctx, f)
	if err != nil {
		t.Fatalf("GetOverview: %v", err)
	}
	expectedRange := int64(1000 + 2_000_000 + 500 + 500_000 + 100 + 200)
	if ov.RangeBytes != expectedRange {
		t.Fatalf("RangeBytes=%d want %d", ov.RangeBytes, expectedRange)
	}
	if ov.TopConsumer == nil || ov.TopConsumer.ProcessDisplay != "Chrome" || ov.TopConsumer.RootDomain != "googlevideo.com" {
		t.Fatalf("unexpected TopConsumer: %+v", ov.TopConsumer)
	}
	if len(ov.Warnings) != 1 || ov.Warnings[0].Code != "TUN_SNIFFER_OFF" {
		t.Fatalf("expected TUN_SNIFFER_OFF warning, got %+v", ov.Warnings)
	}
	// Quota multiplier: 2_001_000 * 2.0 = 4_002_000
	if ov.Quota.BilledBytes != 4_002_000 {
		t.Fatalf("BilledBytes=%d want 4002000", ov.Quota.BilledBytes)
	}

	hm, err := st.GetHeatmap(ctx, f)
	if err != nil {
		t.Fatalf("GetHeatmap: %v", err)
	}
	if len(hm.Days) != 365 || hm.ActiveDays != 1 || hm.TotalBytes != expectedRange {
		t.Fatalf("unexpected heatmap: len=%d active=%d total=%d", len(hm.Days), hm.ActiveDays, hm.TotalBytes)
	}

	apps, err := st.ListApps(ctx, f)
	if err != nil {
		t.Fatalf("ListApps: %v", err)
	}
	if len(apps.Items) != 2 || apps.Items[0].ProcessDisplay != "Chrome" {
		t.Fatalf("unexpected apps: %+v", apps.Items)
	}

	detail, err := st.GetAppDetail(ctx, f, "Chrome")
	if err != nil {
		t.Fatalf("GetAppDetail: %v", err)
	}
	if len(detail.RootDomains) != 1 || len(detail.RootDomains[0].Subdomains) != 2 {
		t.Fatalf("expected 1 root domain with 2 subdomains, got %+v", detail.RootDomains)
	}
	if len(detail.Sankey.Nodes) < 3 || len(detail.Sankey.Links) < 2 {
		t.Fatalf("expected sankey graph, got %+v", detail.Sankey)
	}

	domDetail, err := st.GetDomainDetail(ctx, f, "googlevideo.com")
	if err != nil {
		t.Fatalf("GetDomainDetail: %v", err)
	}
	if len(domDetail.Apps) != 1 || domDetail.Apps[0].ProcessDisplay != "Chrome" {
		t.Fatalf("unexpected domain detail apps: %+v", domDetail.Apps)
	}

	nodes, err := st.GetNodesAnalytics(ctx, f)
	if err != nil {
		t.Fatalf("GetNodesAnalytics: %v", err)
	}
	if len(nodes.Nodes) != 2 || len(nodes.ProxyAudit) == 0 {
		t.Fatalf("unexpected nodes analytics: %+v", nodes)
	}

	ts, err := st.GetTimeseries(ctx, store.AnalyticsFilter{
		DeviceID:    "all",
		Scope:       "all",
		From:        minTS - 600,
		To:          now,
		TZOffsetMin: 480,
		GroupBy:     "process",
		Interval:    "minute",
	}, "", "")
	if err != nil {
		t.Fatalf("GetTimeseries: %v", err)
	}
	if len(ts.Series) != 2 || ts.TotalBytes != 2_501_500 {
		t.Fatalf("unexpected timeseries: series=%d total=%d", len(ts.Series), ts.TotalBytes)
	}
}

func TestMaintenanceFoldingAndPruning(t *testing.T) {
	ctx := context.Background()
	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	dev, _, err := st.CreateDevice(ctx, protocol.CreateDeviceRequest{Name: "Test", OS: "windows"})
	if err != nil {
		t.Fatalf("create device: %v", err)
	}

	now := time.Now().Unix()
	oldHour := (now - 5*3600) - ((now - 5*3600) % 3600)
	expiredMin := (now - 15*86400) - ((now - 15*86400) % 60)

	_, err = st.IngestBatch(ctx, dev.ID, protocol.IngestBatchRequest{
		BatchID: "b-old-1",
		MinuteTotals: []protocol.MinuteTotalRecord{
			{BucketTS: oldHour, ProxyDown: 30000},
			{BucketTS: expiredMin, ProxyDown: 50000},
		},
		MinuteFlows: []protocol.FlowRecord{
			{
				BucketTS:       expiredMin,
				ProcessName:    "chrome.exe",
				ProcessDisplay: "Chrome",
				RootDomain:     "example.com",
				Host:           "a.example.com",
				EgressNode:     "HK-1",
				ProxyGroup:     "Proxy",
				RouteType:      protocol.RouteProxy,
				InboundMode:    protocol.InboundProxyPort,
				DownBytes:      50000,
				ConnCount:      1,
			},
		},
		HourlyFlows: []protocol.FlowRecord{
			{
				BucketTS:       oldHour,
				ProcessName:    "chrome.exe",
				ProcessDisplay: "Chrome",
				RootDomain:     "tracker.io",
				Host:           "s1.tracker.io",
				EgressNode:     "DIRECT",
				ProxyGroup:     "DIRECT",
				RouteType:      protocol.RouteDirect,
				InboundMode:    protocol.InboundProxyPort,
				DownBytes:      10000,
				ConnCount:      1,
			},
			{
				BucketTS:       oldHour,
				ProcessName:    "chrome.exe",
				ProcessDisplay: "Chrome",
				RootDomain:     "tracker.io",
				Host:           "s2.tracker.io",
				EgressNode:     "DIRECT",
				ProxyGroup:     "DIRECT",
				RouteType:      protocol.RouteDirect,
				InboundMode:    protocol.InboundProxyPort,
				DownBytes:      20000,
				ConnCount:      2,
			},
			{
				BucketTS:       oldHour,
				ProcessName:    "chrome.exe",
				ProcessDisplay: "Chrome",
				RootDomain:     "tracker.io",
				Host:           "big.tracker.io",
				EgressNode:     "DIRECT",
				ProxyGroup:     "DIRECT",
				RouteType:      protocol.RouteDirect,
				InboundMode:    protocol.InboundProxyPort,
				DownBytes:      200000,
				ConnCount:      3,
			},
		},
	}, 480)
	if err != nil {
		t.Fatalf("ingest: %v", err)
	}

	if err := st.Maintain(ctx, now); err != nil {
		t.Fatalf("Maintain: %v", err)
	}

	// Expired minute flow (>14d) should be gone, while oldHour hourly flow should have s1+s2 folded into '*'.
	detail, err := st.GetAppDetail(ctx, store.AnalyticsFilter{
		From:        oldHour - 60,
		To:          now,
		TZOffsetMin: 480,
		Interval:    "hour",
	}, "Chrome")
	if err != nil {
		t.Fatalf("GetAppDetail: %v", err)
	}
	if len(detail.RootDomains) != 1 || detail.RootDomains[0].RootDomain != "tracker.io" {
		t.Fatalf("expected only tracker.io after 14d minute prune, got %+v", detail.RootDomains)
	}
	subs := detail.RootDomains[0].Subdomains
	if len(subs) != 2 {
		t.Fatalf("expected 2 subdomains (big.tracker.io and '*'), got %+v", subs)
	}
	var starBytes int64
	for _, srow := range subs {
		if srow.Host == "*" {
			starBytes = srow.TotalBytes
		}
	}
	if starBytes != 30000 {
		t.Fatalf("expected folded '*' bytes=30000, got %d", starBytes)
	}
}

func TestHistoricalRuleSanitizationOnOpen(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "legacy.db")

	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("initial open: %v", err)
	}
	dev, _, err := st.CreateDevice(ctx, protocol.CreateDeviceRequest{Name: "PC", OS: "windows"})
	if err != nil {
		t.Fatalf("create device: %v", err)
	}
	_ = st.Close()

	rawDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open raw sqlite: %v", err)
	}
	now := time.Now().Unix()
	minTS := now - (now % 60)
	hourTS := now - (now % 3600)
	dirtyRule := `ProcessPathRegex,(?i)^C:\\Users\\zhangsan\\AppData\\Local\\Programs\\antigravity\\`
	if _, err := rawDB.Exec(`
		INSERT INTO traffic_minute_flows (
			device_id, bucket_ts, process_name, process_display, root_domain, service_tag,
			host, egress_node, proxy_group, route_type, inbound_mode, rule,
			up_bytes, down_bytes, conn_count
		) VALUES (?, ?, 'app.exe', 'App', 'googleapis.com', '', 'play.googleapis.com', 'US', 'Proxy', 'PROXY', 'PROXY_PORT', ?, 100, 200, 1)
	`, dev.ID, minTS, dirtyRule); err != nil {
		t.Fatalf("insert dirty minute row: %v", err)
	}
	if _, err := rawDB.Exec(`
		INSERT INTO traffic_hourly_flows (
			device_id, hour_ts, process_name, process_display, root_domain, service_tag,
			host, egress_node, proxy_group, route_type, inbound_mode, rule,
			up_bytes, down_bytes, conn_count
		) VALUES (?, ?, 'app.exe', 'App', 'googleapis.com', '', 'play.googleapis.com', 'US', 'Proxy', 'PROXY', 'PROXY_PORT', ?, 100, 200, 1)
	`, dev.ID, hourTS, dirtyRule); err != nil {
		t.Fatalf("insert dirty hourly row: %v", err)
	}
	_ = rawDB.Close()

	reopened, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	defer reopened.Close()

	nodes, err := reopened.GetNodesAnalytics(ctx, store.AnalyticsFilter{
		From:        hourTS - 60,
		To:          now + 60,
		TZOffsetMin: 480,
	})
	if err != nil {
		t.Fatalf("GetNodesAnalytics: %v", err)
	}
	if len(nodes.Rules) != 1 || nodes.Rules[0].Rule != `ProcessPathRegex,<USER_HOME>/.../antigravity` {
		t.Fatalf("expected sanitized historical rule, got %+v", nodes.Rules)
	}
}

func TestBackupExportAndIdempotentMerge(t *testing.T) {
	ctx := context.Background()
	stA, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open storeA: %v", err)
	}
	defer stA.Close()

	devA, _, err := stA.CreateDevice(ctx, protocol.CreateDeviceRequest{Name: "Laptop A", OS: "windows"})
	if err != nil {
		t.Fatalf("create devA: %v", err)
	}
	if _, err := stA.SaveSettings(ctx, protocol.SettingsPayload{
		MonthlyQuotaGB:   500,
		ResetDay:         5,
		BurstThresholdMB: 250,
	}); err != nil {
		t.Fatalf("save settingsA: %v", err)
	}

	now := time.Now().Unix()
	minTS := now - (now % 60)
	if _, err := stA.IngestBatch(ctx, devA.ID, protocol.IngestBatchRequest{
		BatchID: "b-a-1",
		MinuteTotals: []protocol.MinuteTotalRecord{
			{BucketTS: minTS, ProxyUp: 1000, ProxyDown: 20000, ConnCount: 2, ProxyPortBytes: 21000},
		},
		MinuteFlows: []protocol.FlowRecord{
			{
				BucketTS:       minTS,
				ProcessName:    "app.exe",
				ProcessDisplay: "App",
				RootDomain:     "github.com",
				Host:           "api.github.com",
				EgressNode:     "HK-01",
				ProxyGroup:     "Proxy",
				RouteType:      protocol.RouteProxy,
				InboundMode:    protocol.InboundProxyPort,
				Rule:           `ProcessPathRegex,(?i)^C:\\Users\\user123\\AppData\\Local\\Programs\\antigravity\\`,
				UpBytes:        1000,
				DownBytes:      20000,
				ConnCount:      2,
			},
		},
	}, 480); err != nil {
		t.Fatalf("ingest A: %v", err)
	}

	archive, err := stA.ExportBackup(ctx, "0.2.0")
	if err != nil {
		t.Fatalf("ExportBackup: %v", err)
	}
	if len(archive.Devices) != 1 || len(archive.MinuteTotals) != 1 || len(archive.MinuteFlows) != 1 {
		t.Fatalf("unexpected exported archive sizes: devs=%d totals=%d flows=%d", len(archive.Devices), len(archive.MinuteTotals), len(archive.MinuteFlows))
	}
	if archive.MinuteFlows[0].Rule != `ProcessPathRegex,<USER_HOME>/.../antigravity` {
		t.Fatalf("expected sanitized exported rule, got %q", archive.MinuteFlows[0].Rule)
	}

	stB, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open storeB: %v", err)
	}
	defer stB.Close()

	devB, _, err := stB.CreateDevice(ctx, protocol.CreateDeviceRequest{Name: "Desktop B", OS: "windows"})
	if err != nil {
		t.Fatalf("create devB: %v", err)
	}
	if _, err := stB.IngestBatch(ctx, devB.ID, protocol.IngestBatchRequest{
		BatchID: "b-b-1",
		MinuteTotals: []protocol.MinuteTotalRecord{
			{BucketTS: minTS, ProxyUp: 500, ProxyDown: 5000, ConnCount: 1, ProxyPortBytes: 5500},
		},
	}, 480); err != nil {
		t.Fatalf("ingest B: %v", err)
	}

	imp1, err := stB.ImportBackup(ctx, archive, true)
	if err != nil {
		t.Fatalf("ImportBackup first: %v", err)
	}
	if imp1.DevicesImported != 1 || !imp1.SettingsImported || imp1.MinuteTotalsRows != 1 {
		t.Fatalf("unexpected first import result: %+v", imp1)
	}

	// Re-importing same backup must be idempotent (no double counting).
	imp2, err := stB.ImportBackup(ctx, archive, false)
	if err != nil {
		t.Fatalf("ImportBackup second: %v", err)
	}
	if imp2.DevicesExisting != 1 || imp2.DevicesImported != 0 {
		t.Fatalf("unexpected second import result: %+v", imp2)
	}

	ov, err := stB.GetOverview(ctx, store.AnalyticsFilter{
		DeviceID:    "all",
		Scope:       "all",
		From:        minTS - 60,
		To:          now + 60,
		TZOffsetMin: 480,
	})
	if err != nil {
		t.Fatalf("GetOverview after merge: %v", err)
	}
	if ov.RangeBytes != 26500 {
		t.Fatalf("merged RangeBytes=%d want 26500 (no double counting)", ov.RangeBytes)
	}
	if ov.Quota.MonthlyQuotaGB != 500 {
		t.Fatalf("expected merged MonthlyQuotaGB=500, got %v", ov.Quota.MonthlyQuotaGB)
	}
}
