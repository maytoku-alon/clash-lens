package embedded_test

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"clash-lens/pkg/protocol"
	"clash-lens/server/embedded"
)

func TestStartLocalAndIngest(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	dbPath := filepath.Join(t.TempDir(), "local.db")
	inst, err := embedded.StartLocal(ctx, embedded.Options{
		Addr:            "127.0.0.1:0",
		DBPath:          dbPath,
		TZOffsetMinutes: 480,
		DeviceName:      "LocalTestPC",
		DeviceOS:        "windows",
	})
	if err != nil {
		t.Fatalf("StartLocal: %v", err)
	}
	defer func() {
		shutCtx, shutCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer shutCancel()
		_ = inst.Close(shutCtx)
	}()

	// 1. Auth status must report authenticated local_mode without password setup
	resp, err := http.Get(inst.URL + "/api/v1/auth/status")
	if err != nil {
		t.Fatalf("auth status: %v", err)
	}
	var st protocol.AuthStatusResponse
	_ = json.NewDecoder(resp.Body).Decode(&st)
	_ = resp.Body.Close()
	if !st.Authenticated || !st.LocalMode {
		t.Fatalf("unexpected local auth status: %+v", st)
	}

	// 2. Auto-provisioned device token can ingest immediately
	now := time.Now().Unix()
	minTS := now - (now % 60)
	batch := protocol.IngestBatchRequest{
		BatchID: "local-b1",
		MinuteTotals: []protocol.MinuteTotalRecord{
			{BucketTS: minTS, ProxyUp: 1024, ProxyDown: 4096, ConnCount: 1, ProxyPortBytes: 5120},
		},
	}
	var gzBuf bytes.Buffer
	gz := gzip.NewWriter(&gzBuf)
	_ = json.NewEncoder(gz).Encode(batch)
	_ = gz.Close()

	req, _ := http.NewRequest(http.MethodPost, inst.URL+"/api/v1/ingest/batch", bytes.NewReader(gzBuf.Bytes()))
	req.Header.Set("Authorization", "Bearer "+inst.DeviceToken)
	req.Header.Set("Content-Encoding", "gzip")
	inResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("ingest local batch: %v", err)
	}
	_ = inResp.Body.Close()
	if inResp.StatusCode != http.StatusOK {
		t.Fatalf("local ingest status=%d", inResp.StatusCode)
	}

	// 3. Overview query returns ingested traffic directly on loopback without login cookie
	ovResp, err := http.Get(inst.URL + "/api/v1/analytics/overview?device_id=all&scope=all")
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	var ov protocol.OverviewResponse
	_ = json.NewDecoder(ovResp.Body).Decode(&ov)
	_ = ovResp.Body.Close()
	if ov.RangeBytes != 5120 {
		t.Fatalf("local RangeBytes=%d want 5120", ov.RangeBytes)
	}
}
