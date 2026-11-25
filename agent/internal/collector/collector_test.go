package collector_test

import (
	"testing"
	"time"

	"clash-lens/agent/internal/collector"
	"clash-lens/agent/internal/mihomo"
	"clash-lens/pkg/protocol"
)

func TestCollectorDeltaReconcileAndSeed(t *testing.T) {
	col := collector.New()
	col.SetRuntimeMeta(mihomo.VersionResp{Version: "v1.19.33"}, mihomo.ConfigsResp{
		Mode:            "rule",
		FindProcessMode: "always",
		Sniffing:        true,
	})

	baseTime := time.Unix(1700000040, 0) // inside a minute bucket

	// Tick 1: pre-existing connection with 50MB must be seeded with 0 bytes emitted.
	col.ProcessSnapshot(mihomo.ConnectionsSnapshot{
		UploadTotal:   10_000_000,
		DownloadTotal: 50_000_000,
		Connections: []mihomo.ConnectionItem{
			{
				ID:       "existing-1",
				Chains:   []string{"HK-01", "Proxy"},
				Upload:   10_000_000,
				Download: 50_000_000,
				Metadata: mihomo.ConnectionMetadata{Process: "chrome.exe", Host: "github.com"},
			},
		},
	}, baseTime)

	if _, ok := col.FlushCompleted(true); ok {
		t.Fatalf("first seeded tick must emit zero bytes")
	}

	// Tick 2: +1KB up, +100KB down on existing-1, +2KB down on new short-lived gap in global total
	col.ProcessSnapshot(mihomo.ConnectionsSnapshot{
		UploadTotal:   10_001_024,
		DownloadTotal: 50_102_048,
		Connections: []mihomo.ConnectionItem{
			{
				ID:       "existing-1",
				Chains:   []string{"HK-01", "Proxy"},
				Upload:   10_001_024,
				Download: 50_100_000,
				Metadata: mihomo.ConnectionMetadata{Process: "chrome.exe", Host: "github.com"},
			},
		},
	}, baseTime.Add(1*time.Second))

	// Tick 3: next minute rolls over automatically (+65s from baseTime)!
	col.ProcessSnapshot(mihomo.ConnectionsSnapshot{
		UploadTotal:   10_001_024,
		DownloadTotal: 50_102_048,
		Connections:   []mihomo.ConnectionItem{},
	}, baseTime.Add(65*time.Second))

	batch, ok := col.FlushCompleted(false)
	if !ok {
		t.Fatalf("expected completed minute bucket after rollover")
	}
	if len(batch.MinuteTotals) != 1 {
		t.Fatalf("expected 1 minute total, got %d", len(batch.MinuteTotals))
	}
	mt := batch.MinuteTotals[0]
	if mt.ProxyUp != 1024 || mt.ProxyDown != 100_000 {
		t.Fatalf("unexpected proxy bytes: %+v", mt)
	}
	if mt.UnattributedDown != 2048 {
		t.Fatalf("expected UnattributedDown=2048, got %d", mt.UnattributedDown)
	}
	if len(batch.MinuteFlows) != 1 || batch.MinuteFlows[0].ProcessDisplay != "Chrome" {
		t.Fatalf("unexpected flows: %+v", batch.MinuteFlows)
	}

	// Tick 4: simulate Mihomo restart (totals drop to 0) -> must not emit negative/huge spike
	col.ProcessSnapshot(mihomo.ConnectionsSnapshot{
		UploadTotal:   100,
		DownloadTotal: 500,
		Connections: []mihomo.ConnectionItem{
			{
				ID:       "new-after-restart",
				Chains:   []string{"DIRECT"},
				Upload:   100,
				Download: 500,
				Metadata: mihomo.ConnectionMetadata{Type: "TUN", Process: "curl.exe", Host: "example.com"},
			},
		},
	}, baseTime.Add(70*time.Second))

	if _, ok := col.FlushCompleted(true); ok {
		t.Fatalf("expected zero flush immediately on counter reset")
	}

	// Normal follow-up delta after restart
	col.ProcessSnapshot(mihomo.ConnectionsSnapshot{
		UploadTotal:   200,
		DownloadTotal: 1500,
		Connections: []mihomo.ConnectionItem{
			{
				ID:       "new-after-restart",
				Chains:   []string{"DIRECT"},
				Upload:   200,
				Download: 1500,
				Metadata: mihomo.ConnectionMetadata{Type: "TUN", Process: "curl.exe", Host: "example.com"},
			},
		},
	}, baseTime.Add(71*time.Second))

	b2, ok := col.FlushCompleted(true)
	if !ok || len(b2.MinuteFlows) != 1 {
		t.Fatalf("expected post-restart flow, ok=%v flows=%+v", ok, b2.MinuteFlows)
	}
	if b2.MinuteFlows[0].InboundMode != protocol.InboundTUN || b2.MinuteFlows[0].DownBytes != 1000 {
		t.Fatalf("unexpected post-restart flow: %+v", b2.MinuteFlows[0])
	}
}
