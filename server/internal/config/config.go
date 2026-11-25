package config

import (
	"flag"
	"os"
	"runtime"
	"strconv"
	"strings"
)

var (
	AppVersion  = "0.2.0"
	BuildCommit = "dev"
	BuildTime   = ""
)

// Config holds runtime configuration for the ClashLens central server.
type Config struct {
	Addr               string
	DBPath             string
	AdminPassword      string
	SessionSecret      string
	TZOffsetMinutes    int
	OnlineThresholdSec int64
	WatchBinary        bool
	LocalNoAuth        bool
}

// Load parses configuration from defaults, environment variables, and CLI flags.
func Load(args []string) (Config, error) {
	cfg := Config{
		Addr:               envOrDefault("CLASHLENS_ADDR", ":8080"),
		DBPath:             envOrDefault("CLASHLENS_DB", "./data/clashlens.db"),
		AdminPassword:      os.Getenv("CLASHLENS_ADMIN_PASSWORD"),
		SessionSecret:      os.Getenv("CLASHLENS_SESSION_SECRET"),
		TZOffsetMinutes:    envIntOrDefault("CLASHLENS_TZ_OFFSET", 480),
		OnlineThresholdSec: int64(envIntOrDefault("CLASHLENS_ONLINE_THRESHOLD_SEC", 30)),
		WatchBinary:        envBoolOrDefault("CLASHLENS_WATCH_BINARY", runtime.GOOS == "linux"),
		LocalNoAuth:        envBoolOrDefault("CLASHLENS_LOCAL_NO_AUTH", false),
	}

	fs := flag.NewFlagSet("clashlens-server", flag.ContinueOnError)
	fs.StringVar(&cfg.Addr, "addr", cfg.Addr, "HTTP listen address (e.g. :8080)")
	fs.StringVar(&cfg.DBPath, "db", cfg.DBPath, "Path to SQLite database file")
	fs.StringVar(&cfg.AdminPassword, "admin-password", cfg.AdminPassword, "Initial admin password")
	fs.IntVar(&cfg.TZOffsetMinutes, "tz-offset", cfg.TZOffsetMinutes, "Timezone offset in minutes (default 480 for UTC+8)")
	fs.BoolVar(&cfg.WatchBinary, "watch-binary", cfg.WatchBinary, "Exit gracefully when executable file changes on disk (for container auto-restart)")
	fs.BoolVar(&cfg.LocalNoAuth, "local-no-auth", cfg.LocalNoAuth, "Allow unauthenticated dashboard access from loopback 127.0.0.1/::1 only")
	if err := fs.Parse(args); err != nil {
		return cfg, err
	}

	cfg.Addr = strings.TrimSpace(cfg.Addr)
	if cfg.Addr == "" {
		cfg.Addr = ":8080"
	}
	return cfg, nil
}

func envOrDefault(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func envIntOrDefault(key string, def int) int {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envBoolOrDefault(key string, def bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	switch v {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return def
	}
}
