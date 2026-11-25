package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"clash-lens/server/internal/api"
	"clash-lens/server/internal/auth"
	"clash-lens/server/internal/config"
	"clash-lens/server/internal/store"
	"clash-lens/server/internal/watchbin"
	"clash-lens/server/internal/ws"
)

func main() {
	cfg, err := config.Load(os.Args[1:])
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	st, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Seed admin password from environment/flag if DB is not yet initialized.
	if cfg.AdminPassword != "" {
		existing, err := st.GetAdminPasswordHash(ctx)
		if err != nil {
			log.Fatalf("check admin password: %v", err)
		}
		if existing == "" {
			hash, err := auth.HashPassword(cfg.AdminPassword)
			if err != nil {
				log.Fatalf("hash initial admin password: %v", err)
			}
			if err := st.SetAdminPasswordHash(ctx, hash); err != nil {
				log.Fatalf("store initial admin password: %v", err)
			}
			log.Printf("initialized admin password from environment/flag")
		}
	}

	sessionSecret := cfg.SessionSecret
	if sessionSecret == "" {
		sessionSecret, err = st.GetOrCreateSessionSecret(ctx, func() (string, error) {
			return auth.GenerateRandomHex(32)
		})
		if err != nil {
			log.Fatalf("get/create session secret: %v", err)
		}
	}

	hub := ws.NewHub(st, cfg.TZOffsetMinutes, cfg.OnlineThresholdSec)
	go hub.Run(ctx)
	go st.RunMaintenanceLoop(ctx)

	if cfg.WatchBinary {
		if exePath, err := os.Executable(); err == nil && filepath.IsAbs(exePath) {
			go watchbin.Watch(ctx, exePath, 3*time.Second, 1<<20, func() {
				log.Printf("detected updated binary on disk (%s), shutting down for restart...", exePath)
				stop()
			})
		}
	}

	srv := api.NewServer(cfg, st, hub, sessionSecret)
	httpServer := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("ClashLens server v%s (commit=%s) listening on %s (db=%s watch=%v)",
			config.AppVersion, config.BuildCommit, cfg.Addr, cfg.DBPath, cfg.WatchBinary)
		errCh <- httpServer.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		log.Printf("shutting down ClashLens server...")
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutCtx)
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server: %v", err)
		}
	}
}
