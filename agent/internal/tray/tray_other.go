//go:build !windows

package tray

import (
	"context"

	"clash-lens/agent/internal/collector"
	"clash-lens/agent/internal/uploader"
)

// StatusProvider supplies runtime references (headless on non-Windows).
type StatusProvider struct {
	ServerURL     string
	ConfigPath    string
	ConfigDir     string
	LocalMode     bool
	RegName       string
	AutostartArgs string
	Collector     *collector.Collector
	Uploader      *uploader.Client
	GetClashInfo  func() (connected bool, endpoint string, tun bool, sniffer bool)
	SyncNow       func()
}

// Run blocks until ctx is canceled on non-Windows headless hosts.
func Run(ctx context.Context, _ context.CancelFunc, _ StatusProvider) {
	<-ctx.Done()
}
