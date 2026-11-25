package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"clash-lens/agent/internal/buffer"
	"clash-lens/agent/internal/collector"
	"clash-lens/agent/internal/config"
	"clash-lens/agent/internal/mihomo"
	"clash-lens/agent/internal/normalizer"
	"clash-lens/agent/internal/tray"
	"clash-lens/agent/internal/uploader"
	"clash-lens/server/embedded"
)

// defaultLocalMode can be overridden at link time (-X main.defaultLocalMode=true) to build the standalone local edition.
var defaultLocalMode = "false"

func main() {
	var (
		cfgPath       string
		serverFlag    string
		tokenFlag     string
		clashFlag     string
		headless      bool
		testClash     bool
		localFlag     bool
		localAddrFlag string
		localDBFlag   string
		flushInterval time.Duration
	)

	localDefault := strings.EqualFold(defaultLocalMode, "true")

	flag.StringVar(&cfgPath, "config", config.DefaultConfigPath(), "Path to agent.yaml")
	flag.StringVar(&serverFlag, "server", "", "Override ClashLens server URL")
	flag.StringVar(&tokenFlag, "token", "", "Override device token")
	flag.StringVar(&clashFlag, "clash", "", "Override Clash/Mihomo endpoint (auto, pipe://..., unix://..., http://...)")
	flag.BoolVar(&headless, "headless", false, "Run without Windows system tray")
	flag.BoolVar(&testClash, "test-clash", false, "Diagnose local Clash/Mihomo connection and exit")
	flag.BoolVar(&localFlag, "local", localDefault, "Run standalone embedded local dashboard on 127.0.0.1 without remote server")
	flag.StringVar(&localAddrFlag, "local-addr", "", "Listen address for standalone local mode (default 127.0.0.1:18080)")
	flag.StringVar(&localDBFlag, "local-db", "", "SQLite database path for standalone local mode")
	flag.DurationVar(&flushInterval, "flush-interval", 0, "Override flush/upload interval (e.g. 5s)")
	flag.Parse()

	if testClash {
		endpoint := clashFlag
		if endpoint == "" {
			if cfg, _, err := config.LoadOrInit(cfgPath); err == nil && cfg.ClashEndpoint != "" {
				endpoint = cfg.ClashEndpoint
			} else {
				endpoint = "auto"
			}
		}
		if err := runTestClash(endpoint); err != nil {
			log.Fatalf("Clash diagnostic failed: %v", err)
		}
		return
	}

	cfg, created, err := config.LoadOrInit(cfgPath)
	if err != nil {
		log.Fatalf("load config %s: %v", cfgPath, err)
	}

	localMode := localFlag || cfg.LocalMode
	if created && !localMode {
		log.Printf("Created starter config at %s (edit server_url and device_token to sync to server)", cfgPath)
	}

	if serverFlag != "" {
		cfg.ServerURL = serverFlag
	}
	if tokenFlag != "" {
		cfg.DeviceToken = tokenFlag
	}
	if clashFlag != "" {
		cfg.ClashEndpoint = clashFlag
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	var localInst *embedded.Instance
	bufName := "buffer.db"
	if localMode {
		localAddr := strings.TrimSpace(localAddrFlag)
		if localAddr == "" {
			localAddr = cfg.LocalAddr
		}
		localDB := strings.TrimSpace(localDBFlag)
		if localDB == "" {
			localDB = filepath.Join(cfg.DataDir, "clashlens-local.db")
		}
		hostname, _ := os.Hostname()
		if hostname == "" {
			hostname = "本机电脑"
		}
		localInst, err = embedded.StartLocal(ctx, embedded.Options{
			Addr:       localAddr,
			DBPath:     localDB,
			DeviceName: hostname,
			DeviceOS:   runtime.GOOS,
		})
		if err != nil {
			log.Fatalf("start standalone local server: %v", err)
		}
		cfg.ServerURL = localInst.URL
		cfg.DeviceToken = localInst.DeviceToken
		bufName = "buffer-local.db"
		log.Printf("ClashLens standalone local dashboard ready at %s (db=%s)", localInst.URL, localDB)
	}

	bufPath := filepath.Join(cfg.DataDir, bufName)
	queue, err := buffer.Open(bufPath)
	if err != nil {
		log.Fatalf("open offline buffer %s: %v", bufPath, err)
	}
	defer queue.Close()

	col := collector.New()
	col.SetSanitizeMode(cfg.EffectiveSanitizeMode())
	up := uploader.New(cfg.ServerURL, cfg.DeviceToken, queue)

	var stateMu sync.RWMutex
	var (
		clashConnected bool
		clashEndpoint  string
		tunEnabled     bool
		snifferEnabled bool
	)
	setClashState := func(conn bool, ep string, tun, sniff bool) {
		stateMu.Lock()
		clashConnected = conn
		clashEndpoint = ep
		tunEnabled = tun
		snifferEnabled = sniff
		stateMu.Unlock()
	}
	getClashState := func() (bool, string, bool, bool) {
		stateMu.RLock()
		defer stateMu.RUnlock()
		return clashConnected, clashEndpoint, tunEnabled, snifferEnabled
	}

	// Mihomo discovery & stream loop
	go func() {
		for {
			if ctx.Err() != nil {
				return
			}
			client, ver, err := mihomo.ResolveEndpoint(ctx, cfg.ClashEndpoint, cfg.ClashSecret)
			if err != nil {
				setClashState(false, "", false, false)
				log.Printf("waiting for Clash/Mihomo (%v)...", err)
				select {
				case <-ctx.Done():
					return
				case <-time.After(5 * time.Second):
					continue
				}
			}

			mCfg, cfgErr := client.GetConfigs(ctx)
			if cfgErr == nil {
				col.SetRuntimeMeta(ver, mCfg)
			}
			setClashState(true, client.Endpoint.Raw, mCfg.Tun.Enable, mCfg.Sniffing)
			log.Printf("connected to Mihomo %s at %s (tun=%v sniffing=%v find-process=%s)",
				ver.Version, client.Endpoint.Raw, mCfg.Tun.Enable, mCfg.Sniffing, mCfg.FindProcessMode)

			streamCtx, streamCancel := context.WithCancel(ctx)
			go func() {
				ticker := time.NewTicker(30 * time.Second)
				defer ticker.Stop()
				for {
					select {
					case <-streamCtx.Done():
						return
					case <-ticker.C:
						if nextCfg, err := client.GetConfigs(streamCtx); err == nil {
							col.SetRuntimeMeta(ver, nextCfg)
							setClashState(true, client.Endpoint.Raw, nextCfg.Tun.Enable, nextCfg.Sniffing)
						}
					}
				}
			}()

			err = client.StreamConnections(streamCtx, func(snap mihomo.ConnectionsSnapshot) {
				col.ProcessSnapshot(snap, time.Now())
			})
			streamCancel()
			col.ResetSeed()
			setClashState(false, client.Endpoint.Raw, false, false)
			if ctx.Err() != nil {
				return
			}
			log.Printf("Mihomo stream disconnected (%v), reconnecting...", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(3 * time.Second):
			}
		}
	}()

	flushAndUpload := func(forceCurrent bool) {
		if batch, ok := col.FlushCompleted(forceCurrent); ok {
			if err := queue.Enqueue(context.Background(), batch); err != nil {
				log.Printf("enqueue batch error: %v", err)
			}
		}
		upCtx, upCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer upCancel()
		if err := up.UploadPending(upCtx); err != nil {
			log.Printf("upload pending batches failed (will retry): %v", err)
		}
	}

	// Periodic flush + upload loop
	uploadPeriod := time.Duration(cfg.UploadIntervalSec) * time.Second
	if flushInterval > 0 {
		uploadPeriod = flushInterval
	}
	go func() {
		ticker := time.NewTicker(uploadPeriod)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				flushAndUpload(flushInterval > 0)
			}
		}
	}()

	// Periodic live telemetry loop (every 2s)
	go func() {
		livePeriod := time.Duration(cfg.LivePushIntervalSec) * time.Second
		ticker := time.NewTicker(livePeriod)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				live := col.SnapshotLive()
				if live.Payload.Timestamp > 0 {
					pushCtx, pushCancel := context.WithTimeout(ctx, 2*time.Second)
					_ = up.PushLive(pushCtx, live.Payload)
					pushCancel()
				}
			}
		}
	}()

	if headless {
		log.Printf("ClashLens agent v%s running in headless mode (server=%s local=%v sanitize=%s)",
			config.AppVersion, cfg.ServerURL, localMode, cfg.EffectiveSanitizeMode())
		<-ctx.Done()
	} else {
		regName := "ClashLensAgent"
		autostartArgs := fmt.Sprintf(`--config "%s"`, cfgPath)
		if localMode {
			regName = "ClashLensLocal"
			if !localDefault {
				autostartArgs = fmt.Sprintf(`--local --config "%s"`, cfgPath)
			}
		}
		tray.Run(ctx, cancel, tray.StatusProvider{
			ServerURL:     cfg.ServerURL,
			ConfigPath:    cfgPath,
			ConfigDir:     cfg.DataDir,
			LocalMode:     localMode,
			RegName:       regName,
			AutostartArgs: autostartArgs,
			Collector:     col,
			Uploader:      up,
			GetClashInfo:  getClashState,
			SyncNow: func() {
				flushAndUpload(true)
			},
		})
	}

	log.Printf("flushing final traffic buckets before exit...")
	flushAndUpload(true)
	if localInst != nil {
		shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
		_ = localInst.Close(shutCtx)
		shutCancel()
	}
}

func runTestClash(endpoint string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	client, ver, err := mihomo.ResolveEndpoint(ctx, endpoint, "")
	if err != nil {
		return err
	}
	cfg, err := client.GetConfigs(ctx)
	if err != nil {
		return fmt.Errorf("fetch /configs: %w", err)
	}
	conns, err := client.GetConnections(ctx)
	if err != nil {
		return fmt.Errorf("fetch /connections: %w", err)
	}

	fmt.Printf("ClashLens Diagnostic OK\n")
	fmt.Printf("  Endpoint         : %s\n", client.Endpoint.Raw)
	fmt.Printf("  Mihomo Version   : %s (meta=%v)\n", ver.Version, ver.Meta)
	fmt.Printf("  Mode             : %s\n", cfg.Mode)
	fmt.Printf("  FindProcessMode  : %s\n", cfg.FindProcessMode)
	fmt.Printf("  TUN Enabled      : %v\n", cfg.Tun.Enable)
	fmt.Printf("  Sniffer Enabled  : %v\n", cfg.Sniffing)
	fmt.Printf("  Active Conns     : %d\n", len(conns.Connections))
	fmt.Printf("  Session Totals   : Upload=%d B | Download=%d B\n", conns.UploadTotal, conns.DownloadTotal)

	type agg struct {
		key   string
		bytes int64
	}
	procMap := map[string]int64{}
	domMap := map[string]int64{}
	for _, c := range conns.Connections {
		n := normalizer.NormalizeConnection(c)
		tot := c.Upload + c.Download
		procMap[n.ProcessDisplay] += tot
		domKey := n.RootDomain
		if n.ServiceTag != "" {
			domKey = fmt.Sprintf("%s (%s)", n.RootDomain, n.ServiceTag)
		}
		domMap[domKey] += tot
	}
	sortTop := func(m map[string]int64) []agg {
		out := make([]agg, 0, len(m))
		for k, v := range m {
			out = append(out, agg{key: k, bytes: v})
		}
		sort.Slice(out, func(i, j int) bool { return out[i].bytes > out[j].bytes })
		if len(out) > 5 {
			out = out[:5]
		}
		return out
	}

	fmt.Printf("  Top Active Apps  :\n")
	for _, a := range sortTop(procMap) {
		fmt.Printf("    - %-20s %d B\n", a.key, a.bytes)
	}
	fmt.Printf("  Top Domains      :\n")
	for _, d := range sortTop(domMap) {
		fmt.Printf("    - %-30s %d B\n", d.key, d.bytes)
	}
	return nil
}
