package mihomo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

const (
	kindPipe = "pipe"
	kindUnix = "unix"
	kindHTTP = "http"
)

// Endpoint describes a resolved Mihomo external controller endpoint.
type Endpoint struct {
	Raw    string
	Kind   string
	Target string
	Secret string
}

// Client communicates with a Mihomo core over Windows Named Pipe, Unix Socket, or HTTP/WS.
type Client struct {
	Endpoint   Endpoint
	httpClient *http.Client
	wsURL      string
}

// ResolveEndpoint discovers or parses the Mihomo controller endpoint and returns a live Client.
func ResolveEndpoint(ctx context.Context, rawEndpoint, secret string) (*Client, VersionResp, error) {
	raw := strings.TrimSpace(rawEndpoint)
	if raw != "" && !strings.EqualFold(raw, "auto") {
		ep, err := ParseEndpoint(raw, secret)
		if err != nil {
			return nil, VersionResp{}, err
		}
		c := NewClient(ep)
		ver, err := c.GetVersion(ctx)
		if err != nil {
			return nil, VersionResp{}, fmt.Errorf("connect %s: %w", ep.Raw, err)
		}
		return c, ver, nil
	}

	candidates := discoverCandidates(secret)
	var lastErr error
	for _, ep := range candidates {
		probeCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		c := NewClient(ep)
		ver, err := c.GetVersion(probeCtx)
		cancel()
		if err == nil && ver.Version != "" {
			return c, ver, nil
		}
		if err != nil {
			lastErr = fmt.Errorf("%s: %w", ep.Raw, err)
		}
	}
	if lastErr == nil {
		lastErr = errors.New("no Mihomo controller endpoint found")
	}
	return nil, VersionResp{}, lastErr
}

// ParseEndpoint parses explicit pipe://, unix://, or http(s):// endpoints.
func ParseEndpoint(raw, secret string) (Endpoint, error) {
	trimmed := strings.TrimSpace(raw)
	switch {
	case strings.HasPrefix(trimmed, "pipe://"):
		return Endpoint{Raw: trimmed, Kind: kindPipe, Target: strings.TrimPrefix(trimmed, "pipe://"), Secret: secret}, nil
	case strings.HasPrefix(trimmed, `\\.\pipe\`):
		return Endpoint{Raw: "pipe://" + trimmed, Kind: kindPipe, Target: trimmed, Secret: secret}, nil
	case strings.HasPrefix(trimmed, "unix://"):
		return Endpoint{Raw: trimmed, Kind: kindUnix, Target: strings.TrimPrefix(trimmed, "unix://"), Secret: secret}, nil
	case strings.HasPrefix(trimmed, "/"):
		return Endpoint{Raw: "unix://" + trimmed, Kind: kindUnix, Target: trimmed, Secret: secret}, nil
	case strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://"):
		return Endpoint{Raw: strings.TrimRight(trimmed, "/"), Kind: kindHTTP, Target: strings.TrimRight(trimmed, "/"), Secret: secret}, nil
	default:
		addr := normalizeControllerHTTP(trimmed)
		if addr == "" {
			return Endpoint{}, fmt.Errorf("unsupported clash endpoint: %q", raw)
		}
		return Endpoint{Raw: addr, Kind: kindHTTP, Target: addr, Secret: secret}, nil
	}
}

func normalizeControllerHTTP(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	if !strings.HasPrefix(v, "http://") && !strings.HasPrefix(v, "https://") {
		if strings.HasPrefix(v, ":") {
			v = "127.0.0.1" + v
		} else if strings.HasPrefix(v, "0.0.0.0:") {
			v = "127.0.0.1:" + strings.TrimPrefix(v, "0.0.0.0:")
		}
		v = "http://" + v
	}
	return strings.TrimRight(v, "/")
}

// NewClient constructs a Mihomo Client for an Endpoint.
func NewClient(ep Endpoint) *Client {
	tr := &http.Transport{
		MaxIdleConns:        4,
		IdleConnTimeout:     60 * time.Second,
		DisableKeepAlives:   false,
		DisableCompression:  false,
		TLSHandshakeTimeout: 5 * time.Second,
	}

	var wsURL string
	switch ep.Kind {
	case kindPipe:
		tr.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialPipeContext(ctx, ep.Target)
		}
		wsURL = "ws://localhost/connections"
	case kindUnix:
		tr.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{Timeout: 3 * time.Second}).DialContext(ctx, "unix", ep.Target)
		}
		wsURL = "ws://localhost/connections"
	default:
		u, err := url.Parse(ep.Target)
		if err == nil {
			scheme := "ws"
			if u.Scheme == "https" {
				scheme = "wss"
			}
			wsURL = fmt.Sprintf("%s://%s/connections", scheme, u.Host)
		}
	}

	return &Client{
		Endpoint: ep,
		httpClient: &http.Client{
			Transport: tr,
			Timeout:   8 * time.Second,
		},
		wsURL: wsURL,
	}
}

func (c *Client) baseHTTPURL(path string) string {
	if c.Endpoint.Kind == kindHTTP {
		return c.Endpoint.Target + path
	}
	return "http://localhost" + path
}

func (c *Client) getJSON(ctx context.Context, path string, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseHTTPURL(path), nil)
	if err != nil {
		return err
	}
	if c.Endpoint.Secret != "" {
		req.Header.Set("Authorization", "Bearer "+c.Endpoint.Secret)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("GET %s HTTP %d: %s", path, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return json.NewDecoder(resp.Body).Decode(dst)
}

// GetVersion fetches Mihomo core version info.
func (c *Client) GetVersion(ctx context.Context) (VersionResp, error) {
	var out VersionResp
	err := c.getJSON(ctx, "/version", &out)
	return out, err
}

// GetConfigs fetches current Mihomo runtime config (mode, find-process-mode, sniffing, tun).
func (c *Client) GetConfigs(ctx context.Context) (ConfigsResp, error) {
	var out ConfigsResp
	err := c.getJSON(ctx, "/configs", &out)
	return out, err
}

// GetConnections performs a single HTTP GET /connections snapshot fetch.
func (c *Client) GetConnections(ctx context.Context) (ConnectionsSnapshot, error) {
	var out ConnectionsSnapshot
	err := c.getJSON(ctx, "/connections", &out)
	return out, err
}

// StreamConnections streams /connections snapshots over WebSocket and falls back to 1s persistent HTTP polling only if WS handshake/initial read is unsupported.
func (c *Client) StreamConnections(ctx context.Context, onSnapshot func(ConnectionsSnapshot)) error {
	if c.wsURL != "" {
		receivedAny, err := c.streamWS(ctx, onSnapshot)
		if err == nil || ctx.Err() != nil {
			return ctx.Err()
		}
		if receivedAny {
			return err
		}
	}
	return c.pollConnections(ctx, onSnapshot)
}

func (c *Client) streamWS(ctx context.Context, onSnapshot func(ConnectionsSnapshot)) (bool, error) {
	dialer := websocket.Dialer{
		HandshakeTimeout: 4 * time.Second,
	}
	switch c.Endpoint.Kind {
	case kindPipe:
		dialer.NetDialContext = func(dCtx context.Context, _, _ string) (net.Conn, error) {
			return dialPipeContext(dCtx, c.Endpoint.Target)
		}
	case kindUnix:
		dialer.NetDialContext = func(dCtx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{Timeout: 3 * time.Second}).DialContext(dCtx, "unix", c.Endpoint.Target)
		}
	}

	headers := http.Header{}
	if c.Endpoint.Secret != "" {
		headers.Set("Authorization", "Bearer "+c.Endpoint.Secret)
	}
	conn, _, err := dialer.DialContext(ctx, c.wsURL, headers)
	if err != nil {
		return false, err
	}
	defer conn.Close()

	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			_ = conn.Close()
		case <-done:
		}
	}()

	receivedAny := false
	for {
		_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return receivedAny, err
		}
		var snap ConnectionsSnapshot
		if err := json.Unmarshal(msg, &snap); err != nil {
			continue
		}
		receivedAny = true
		onSnapshot(snap)
	}
}

func (c *Client) pollConnections(ctx context.Context, onSnapshot func(ConnectionsSnapshot)) error {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	// Immediate first sample
	if snap, err := c.GetConnections(ctx); err == nil {
		onSnapshot(snap)
	} else if ctx.Err() != nil {
		return ctx.Err()
	} else {
		return err
	}

	consecutiveErr := 0
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			snap, err := c.GetConnections(ctx)
			if err != nil {
				consecutiveErr++
				if consecutiveErr >= 3 {
					return err
				}
				continue
			}
			consecutiveErr = 0
			onSnapshot(snap)
		}
	}
}
