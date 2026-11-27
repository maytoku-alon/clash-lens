package embedded

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"clash-lens/server/internal/api"
	"clash-lens/server/internal/auth"
	"clash-lens/server/internal/config"
	"clash-lens/server/internal/store"
	"clash-lens/server/internal/ws"
)

// Options configures the embedded standalone local ClashLens server.
type Options struct {
	Addr            string
	DBPath          string
	TZOffsetMinutes int
	DeviceName      string
	DeviceOS        string
}

// Instance represents a running embedded local server and its auto-provisioned local device credentials.
type Instance struct {
	URL         string
	DeviceID    string
	DeviceToken string

	store      *store.Store
	httpServer *http.Server
	cancel     context.CancelFunc
}

// StartLocal starts an in-process loopback-only ClashLens server with SQLite persistence and auto-provisioned device credentials.
func StartLocal(parentCtx context.Context, opts Options) (*Instance, error) {
	addr := strings.TrimSpace(opts.Addr)
	if addr == "" {
		addr = "127.0.0.1:18080"
	}
	if opts.TZOffsetMinutes == 0 {
		_, offSec := time.Now().Zone()
		opts.TZOffsetMinutes = offSec / 60
	}

	st, err := store.Open(opts.DBPath)
	if err != nil {
		return nil, fmt.Errorf("open local db: %w", err)
	}

	ctx, cancel := context.WithCancel(parentCtx)
	dev, rawToken, err := st.EnsureLocalDevice(ctx, opts.DeviceName, opts.DeviceOS)
	if err != nil {
		cancel()
		_ = st.Close()
		return nil, fmt.Errorf("ensure local device: %w", err)
	}

	sessionSecret, err := st.GetOrCreateSessionSecret(ctx, func() (string, error) {
		return auth.GenerateRandomHex(32)
	})
	if err != nil {
		cancel()
		_ = st.Close()
		return nil, fmt.Errorf("init local session secret: %w", err)
	}

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		cancel()
		_ = st.Close()
		return nil, fmt.Errorf("listen %s: %w", addr, err)
	}

	cfg := config.Config{
		Addr:               ln.Addr().String(),
		DBPath:             opts.DBPath,
		TZOffsetMinutes:    opts.TZOffsetMinutes,
		OnlineThresholdSec: 30,
		LocalNoAuth:        true,
	}

	hub := ws.NewHub(st, cfg.TZOffsetMinutes, cfg.OnlineThresholdSec)
	go hub.Run(ctx)
	go st.RunMaintenanceLoop(ctx, cfg.TZOffsetMinutes)

	srv := api.NewServer(cfg, st, hub, sessionSecret)
	httpServer := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		if err := httpServer.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			cancel()
		}
	}()

	return &Instance{
		URL:         "http://" + ln.Addr().String(),
		DeviceID:    dev.ID,
		DeviceToken: rawToken,
		store:       st,
		httpServer:  httpServer,
		cancel:      cancel,
	}, nil
}

// Close gracefully stops background loops, HTTP server, and SQLite database.
func (i *Instance) Close(ctx context.Context) error {
	if i == nil {
		return nil
	}
	i.cancel()
	var errHTTP error
	if i.httpServer != nil {
		errHTTP = i.httpServer.Shutdown(ctx)
	}
	var errStore error
	if i.store != nil {
		errStore = i.store.Close()
	}
	return errors.Join(errHTTP, errStore)
}
