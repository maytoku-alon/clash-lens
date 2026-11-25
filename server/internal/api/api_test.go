package api_test

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"clash-lens/pkg/protocol"
	"clash-lens/server/internal/api"
	"clash-lens/server/internal/config"
	"clash-lens/server/internal/store"
	"clash-lens/server/internal/ws"
	"github.com/gorilla/websocket"
)

func TestFullAPIWorkflow(t *testing.T) {
	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	cfg := config.Config{
		Addr:               ":0",
		TZOffsetMinutes:    480,
		OnlineThresholdSec: 30,
	}
	hub := ws.NewHub(st, cfg.TZOffsetMinutes, cfg.OnlineThresholdSec)
	srv := api.NewServer(cfg, st, hub, "test-secret-0123456789abcdef")
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	// 1. Auth status uninitialized
	resp, err := http.Get(ts.URL + "/api/v1/auth/status")
	if err != nil {
		t.Fatalf("auth status: %v", err)
	}
	var status protocol.AuthStatusResponse
	_ = json.NewDecoder(resp.Body).Decode(&status)
	_ = resp.Body.Close()
	if status.Initialized || status.Authenticated {
		t.Fatalf("expected uninitialized status, got %+v", status)
	}

	// 2. Unauthorized check on protected route
	unauthResp, _ := http.Get(ts.URL + "/api/v1/devices")
	_ = unauthResp.Body.Close()
	if unauthResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", unauthResp.StatusCode)
	}

	// 3. Setup password
	setupResp, err := http.Post(ts.URL+"/api/v1/auth/setup", "application/json", strings.NewReader(`{"password":"secret123"}`))
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	var loginRes struct {
		OK    bool   `json:"ok"`
		Token string `json:"token"`
	}
	_ = json.NewDecoder(setupResp.Body).Decode(&loginRes)
	_ = setupResp.Body.Close()
	if !loginRes.OK || loginRes.Token == "" {
		t.Fatalf("unexpected setup result: %+v", loginRes)
	}
	adminTok := loginRes.Token

	// 4. Create device
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/devices", strings.NewReader(`{"name":"主桌面PC","os":"windows"}`))
	req.Header.Set("Authorization", "Bearer "+adminTok)
	req.Header.Set("Content-Type", "application/json")
	devResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("create device: %v", err)
	}
	if devResp.StatusCode != http.StatusCreated {
		t.Fatalf("create device status=%d", devResp.StatusCode)
	}
	var created protocol.CreateDeviceResponse
	_ = json.NewDecoder(devResp.Body).Decode(&created)
	_ = devResp.Body.Close()
	if created.Token == "" || !strings.HasPrefix(created.Token, "cl_dev_") {
		t.Fatalf("unexpected device token: %s", created.Token)
	}

	// 5. Gzip batch ingest with device token
	now := time.Now().Unix()
	minTS := now - (now % 60)
	batchPayload := protocol.IngestBatchRequest{
		BatchID: "e2e-batch-1",
		DeviceMeta: protocol.DeviceRuntimeMeta{
			MihomoVersion:   "v1.19.33",
			OS:              "windows",
			TunEnabled:      false,
			SnifferEnabled:  false,
			FindProcessMode: "always",
			InboundMode:     "PROXY_PORT",
		},
		MinuteTotals: []protocol.MinuteTotalRecord{
			{BucketTS: minTS, ProxyUp: 2048, ProxyDown: 1_048_576, ConnCount: 4, ProxyPortBytes: 1_050_624},
		},
		MinuteFlows: []protocol.FlowRecord{
			{
				BucketTS:       minTS,
				ProcessName:    "chrome.exe",
				ProcessDisplay: "Chrome",
				RootDomain:     "github.com",
				ServiceTag:     "GitHub",
				Host:           "api.github.com",
				EgressNode:     "JP-01",
				ProxyGroup:     "Proxy",
				RouteType:      protocol.RouteProxy,
				InboundMode:    protocol.InboundProxyPort,
				Rule:           "GEOSITE,github",
				UpBytes:        2048,
				DownBytes:      1_048_576,
				ConnCount:      4,
			},
		},
	}
	var gzBuf bytes.Buffer
	gz := gzip.NewWriter(&gzBuf)
	_ = json.NewEncoder(gz).Encode(batchPayload)
	_ = gz.Close()

	inReq, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/ingest/batch", bytes.NewReader(gzBuf.Bytes()))
	inReq.Header.Set("Authorization", "Bearer "+created.Token)
	inReq.Header.Set("Content-Encoding", "gzip")
	inResp, err := http.DefaultClient.Do(inReq)
	if err != nil {
		t.Fatalf("ingest batch: %v", err)
	}
	var ingRes protocol.IngestBatchResponse
	_ = json.NewDecoder(inResp.Body).Decode(&ingRes)
	_ = inResp.Body.Close()
	if !ingRes.OK || ingRes.Duplicate {
		t.Fatalf("unexpected ingest response: %+v", ingRes)
	}

	// 6. Push live telemetry and check WebSocket broadcast
	livePayload, _ := json.Marshal(protocol.LivePushRequest{
		Timestamp:    now,
		UpBps:        12000,
		DownBps:      450000,
		ProxyUpBps:   12000,
		ProxyDownBps: 450000,
		ActiveConns:  7,
		DeviceMeta:   batchPayload.DeviceMeta,
		TopActive: []protocol.LiveConnectionItem{
			{
				ProcessDisplay: "Chrome",
				RootDomain:     "github.com",
				Host:           "api.github.com",
				EgressNode:     "JP-01",
				RouteType:      protocol.RouteProxy,
				InboundMode:    protocol.InboundProxyPort,
				UpBps:          12000,
				DownBps:        450000,
				TotalBytes:     1_050_624,
			},
		},
	})
	liveReq, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/ingest/live", bytes.NewReader(livePayload))
	liveReq.Header.Set("Authorization", "Bearer "+created.Token)
	liveResp, err := http.DefaultClient.Do(liveReq)
	if err != nil {
		t.Fatalf("live ingest: %v", err)
	}
	_ = liveResp.Body.Close()
	if liveResp.StatusCode != http.StatusOK {
		t.Fatalf("live ingest status=%d", liveResp.StatusCode)
	}

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/api/v1/ws/live"
	wsHeaders := http.Header{"Authorization": []string{"Bearer " + adminTok}}
	wsConn, _, err := websocket.DefaultDialer.Dial(wsURL, wsHeaders)
	if err != nil {
		t.Fatalf("ws dial: %v", err)
	}
	defer wsConn.Close()
	_, rawSnap, err := wsConn.ReadMessage()
	if err != nil {
		t.Fatalf("ws read: %v", err)
	}
	var snap protocol.LiveHubSnapshot
	if err := json.Unmarshal(rawSnap, &snap); err != nil {
		t.Fatalf("unmarshal snapshot: %v", err)
	}
	if snap.TotalDownBps != 450000 || len(snap.TopActive) != 1 {
		t.Fatalf("unexpected live snapshot: %+v", snap)
	}

	// 7. Query app detail over HTTP
	detReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/analytics/apps/Chrome/detail", nil)
	detReq.Header.Set("Authorization", "Bearer "+adminTok)
	detResp, err := http.DefaultClient.Do(detReq)
	if err != nil {
		t.Fatalf("app detail: %v", err)
	}
	var detail protocol.AppDetailResponse
	_ = json.NewDecoder(detResp.Body).Decode(&detail)
	_ = detResp.Body.Close()
	if detail.Summary.TotalBytes != 1_050_624 || len(detail.RootDomains) != 1 || detail.RootDomains[0].RootDomain != "github.com" {
		t.Fatalf("unexpected app detail: %+v", detail)
	}

	// 8. Export & re-import backup over HTTP
	expReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/backup/export", nil)
	expReq.Header.Set("Authorization", "Bearer "+adminTok)
	expResp, err := http.DefaultClient.Do(expReq)
	if err != nil {
		t.Fatalf("backup export: %v", err)
	}
	if expResp.StatusCode != http.StatusOK {
		t.Fatalf("backup export status=%d", expResp.StatusCode)
	}
	gzBytes, err := io.ReadAll(expResp.Body)
	_ = expResp.Body.Close()
	if err != nil || len(gzBytes) == 0 {
		t.Fatalf("read backup export failed: %v", err)
	}

	impReq, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/backup/import?merge_settings=true", bytes.NewReader(gzBytes))
	impReq.Header.Set("Authorization", "Bearer "+adminTok)
	impReq.Header.Set("Content-Type", "application/octet-stream")
	impResp, err := http.DefaultClient.Do(impReq)
	if err != nil {
		t.Fatalf("backup import: %v", err)
	}
	var impRes protocol.BackupImportResult
	_ = json.NewDecoder(impResp.Body).Decode(&impRes)
	_ = impResp.Body.Close()
	if impResp.StatusCode != http.StatusOK || !impRes.OK || impRes.MinuteTotalsRows != 1 {
		t.Fatalf("unexpected backup import response: status=%d res=%+v", impResp.StatusCode, impRes)
	}
}

func TestLocalNoAuthLoopbackOnly(t *testing.T) {
	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	cfg := config.Config{
		Addr:               "127.0.0.1:0",
		TZOffsetMinutes:    480,
		OnlineThresholdSec: 30,
		LocalNoAuth:        true,
	}
	hub := ws.NewHub(st, cfg.TZOffsetMinutes, cfg.OnlineThresholdSec)
	srv := api.NewServer(cfg, st, hub, "local-secret-0123456789abcdef")
	handler := srv.Handler()

	// Loopback request should bypass auth and advertise local_mode=true
	reqLoop := httptest.NewRequest(http.MethodGet, "/api/v1/auth/status", nil)
	reqLoop.RemoteAddr = "127.0.0.1:54321"
	recLoop := httptest.NewRecorder()
	handler.ServeHTTP(recLoop, reqLoop)
	if recLoop.Code != http.StatusOK {
		t.Fatalf("loopback auth status code=%d", recLoop.Code)
	}
	var stLoop protocol.AuthStatusResponse
	_ = json.NewDecoder(recLoop.Body).Decode(&stLoop)
	if !stLoop.Authenticated || !stLoop.LocalMode {
		t.Fatalf("expected authenticated local mode on loopback, got %+v", stLoop)
	}

	reqLoopDev := httptest.NewRequest(http.MethodGet, "/api/v1/devices", nil)
	reqLoopDev.RemoteAddr = "[::1]:54321"
	recLoopDev := httptest.NewRecorder()
	handler.ServeHTTP(recLoopDev, reqLoopDev)
	if recLoopDev.Code != http.StatusOK {
		t.Fatalf("IPv6 loopback devices code=%d", recLoopDev.Code)
	}

	// Non-loopback remote address must still be rejected even with X-Forwarded-For spoofed
	reqExt := httptest.NewRequest(http.MethodGet, "/api/v1/devices", nil)
	reqExt.RemoteAddr = "203.0.113.10:4444"
	reqExt.Header.Set("X-Forwarded-For", "127.0.0.1")
	recExt := httptest.NewRecorder()
	handler.ServeHTTP(recExt, reqExt)
	if recExt.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for non-loopback peer, got %d", recExt.Code)
	}
}
