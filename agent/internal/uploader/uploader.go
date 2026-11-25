package uploader

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	neturl "net/url"
	"strings"
	"sync"
	"time"

	"clash-lens/agent/internal/buffer"
	"clash-lens/pkg/protocol"
)

// Status describes the latest cloud sync status for tray/logs.
type Status struct {
	Configured  bool
	LastSuccess time.Time
	LastError   string
	Pending     int
}

// Client uploads queued gzipped batches and real-time snapshots to the ClashLens central server.
type Client struct {
	serverURL   string
	deviceToken string
	httpClient  *http.Client
	queue       *buffer.Queue

	mu     sync.RWMutex
	status Status
}

// New constructs an uploader Client.
func New(serverURL, deviceToken string, q *buffer.Queue) *Client {
	rawURL := strings.TrimRight(strings.TrimSpace(serverURL), "/")
	tok := strings.TrimSpace(deviceToken)

	httpClient := &http.Client{
		Timeout: 15 * time.Second,
	}
	if parsed, err := neturl.Parse(rawURL); err == nil {
		host := strings.ToLower(parsed.Hostname())
		ip := net.ParseIP(host)
		if host == "localhost" || (ip != nil && ip.IsLoopback()) {
			if base, ok := http.DefaultTransport.(*http.Transport); ok {
				tr := base.Clone()
				tr.Proxy = nil
				httpClient.Transport = tr
			}
		}
	}

	return &Client{
		serverURL:   rawURL,
		deviceToken: tok,
		httpClient:  httpClient,
		queue:       q,
		status: Status{
			Configured: rawURL != "" && tok != "",
		},
	}
}

// Status returns a snapshot of current sync health.
func (c *Client) Status(ctx context.Context) Status {
	c.mu.RLock()
	st := c.status
	c.mu.RUnlock()
	if c.queue != nil {
		if n, err := c.queue.Count(ctx); err == nil {
			st.Pending = n
		}
	}
	return st
}

// UploadPending drains pending batches from SQLite in order, stopping on first error.
func (c *Client) UploadPending(ctx context.Context) error {
	if c.serverURL == "" || c.deviceToken == "" {
		c.setStatus(false, "未配置 server_url 或 device_token")
		return nil
	}

	for {
		items, err := c.queue.Peek(ctx, 10)
		if err != nil {
			c.setStatus(false, err.Error())
			return err
		}
		if len(items) == 0 {
			return nil
		}
		for _, item := range items {
			if err := c.postBatch(ctx, item.PayloadGZ); err != nil {
				c.setStatus(false, err.Error())
				return err
			}
			if err := c.queue.Ack(ctx, item.BatchID); err != nil {
				return err
			}
		}
		c.setStatus(true, "")
		if len(items) < 10 {
			return nil
		}
	}
}

// PushLive sends a best-effort 2s live telemetry frame to the server.
func (c *Client) PushLive(ctx context.Context, live protocol.LivePushRequest) error {
	if c.serverURL == "" || c.deviceToken == "" {
		return nil
	}
	b, err := json.Marshal(live)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.serverURL+"/api/v1/ingest/live", bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.deviceToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	_ = resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("live push HTTP %d", resp.StatusCode)
	}
	return nil
}

func (c *Client) postBatch(ctx context.Context, payloadGZ []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.serverURL+"/api/v1/ingest/batch", bytes.NewReader(payloadGZ))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.deviceToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Content-Encoding", "gzip")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if resp.StatusCode >= 300 {
		return fmt.Errorf("ingest HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

func (c *Client) setStatus(ok bool, errMsg string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if ok {
		c.status.LastSuccess = time.Now()
		c.status.LastError = ""
	} else {
		c.status.LastError = errMsg
	}
}
