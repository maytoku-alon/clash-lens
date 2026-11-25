package config

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"clash-lens/pkg/privacy"
	"gopkg.in/yaml.v3"
)

const AppVersion = "0.2.0"

// AgentConfig holds local collector configuration loaded from agent.yaml.
type AgentConfig struct {
	ServerURL           string `yaml:"server_url"`
	DeviceToken         string `yaml:"device_token"`
	ClashEndpoint       string `yaml:"clash_endpoint"`
	ClashSecret         string `yaml:"clash_secret"`
	FlushIntervalSec    int    `yaml:"flush_interval_sec"`
	UploadIntervalSec   int    `yaml:"upload_interval_sec"`
	LivePushIntervalSec int    `yaml:"live_push_interval_sec"`
	DataDir             string `yaml:"data_dir"`
	SanitizePaths       *bool  `yaml:"sanitize_paths,omitempty"`
	SanitizeMode        string `yaml:"sanitize_mode,omitempty"`
	LocalMode           bool   `yaml:"local_mode,omitempty"`
	LocalAddr           string `yaml:"local_addr,omitempty"`
}

func boolPtr(v bool) *bool { return &v }

// EffectiveSanitizeMode returns the active rule/path sanitization mode (mask | strict | off).
func (c AgentConfig) EffectiveSanitizeMode() string {
	if c.SanitizePaths != nil && !*c.SanitizePaths {
		return privacy.ModeOff
	}
	return privacy.NormalizeMode(c.SanitizeMode)
}

// DefaultConfigDir returns the platform-standard directory for ClashLens agent config & offline buffer.
func DefaultConfigDir() string {
	if exe, err := os.Executable(); err == nil {
		portable := filepath.Join(filepath.Dir(exe), "agent.yaml")
		if _, statErr := os.Stat(portable); statErr == nil {
			return filepath.Dir(exe)
		}
	}
	if runtime.GOOS == "windows" {
		if appData := strings.TrimSpace(os.Getenv("APPDATA")); appData != "" {
			return filepath.Join(appData, "ClashLens")
		}
	}
	if xdg := strings.TrimSpace(os.Getenv("XDG_CONFIG_HOME")); xdg != "" {
		return filepath.Join(xdg, "clashlens")
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return filepath.Join(home, ".config", "clashlens")
	}
	return "."
}

// DefaultConfigPath returns the default path to agent.yaml.
func DefaultConfigPath() string {
	return filepath.Join(DefaultConfigDir(), "agent.yaml")
}

// DefaultConfig returns sensible default agent settings.
func DefaultConfig(dir string) AgentConfig {
	return AgentConfig{
		ServerURL:           "http://127.0.0.1:8080",
		DeviceToken:         "",
		ClashEndpoint:       "auto",
		ClashSecret:         "",
		FlushIntervalSec:    60,
		UploadIntervalSec:   15,
		LivePushIntervalSec: 2,
		DataDir:             dir,
		SanitizePaths:       boolPtr(true),
		SanitizeMode:        privacy.ModeMask,
		LocalMode:           false,
		LocalAddr:           "127.0.0.1:18080",
	}
}

// LoadOrInit reads agent.yaml from path, creating a starter template if missing.
func LoadOrInit(path string) (AgentConfig, bool, error) {
	if path == "" {
		path = DefaultConfigPath()
	}
	dir := filepath.Dir(path)
	cfg := DefaultConfig(dir)

	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		if mkErr := os.MkdirAll(dir, 0o755); mkErr != nil {
			return cfg, true, mkErr
		}
		if saveErr := Save(path, cfg); saveErr != nil {
			return cfg, true, saveErr
		}
		return cfg, true, nil
	}
	if err != nil {
		return cfg, false, err
	}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return cfg, false, err
	}
	applyDefaults(&cfg, dir)
	return cfg, false, nil
}

// Save writes AgentConfig to path as YAML.
func Save(path string, cfg AgentConfig) error {
	applyDefaults(&cfg, filepath.Dir(path))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	header := "# ClashLens 采集端配置文件\n# clash_endpoint 默认 auto，会自动发现本机 Clash Verge Rev 管道或 Mihomo 接口\n"
	return os.WriteFile(path, append([]byte(header), b...), 0o600)
}

func applyDefaults(cfg *AgentConfig, dir string) {
	cfg.ServerURL = strings.TrimRight(strings.TrimSpace(cfg.ServerURL), "/")
	if cfg.ServerURL == "" {
		cfg.ServerURL = "http://127.0.0.1:8080"
	}
	if strings.TrimSpace(cfg.ClashEndpoint) == "" {
		cfg.ClashEndpoint = "auto"
	}
	if cfg.FlushIntervalSec <= 0 {
		cfg.FlushIntervalSec = 60
	}
	if cfg.UploadIntervalSec <= 0 {
		cfg.UploadIntervalSec = 15
	}
	if cfg.LivePushIntervalSec <= 0 {
		cfg.LivePushIntervalSec = 2
	}
	if strings.TrimSpace(cfg.DataDir) == "" {
		cfg.DataDir = dir
	}
	if cfg.SanitizePaths == nil {
		cfg.SanitizePaths = boolPtr(true)
	}
	if !*cfg.SanitizePaths {
		cfg.SanitizeMode = privacy.ModeOff
	} else {
		cfg.SanitizeMode = privacy.NormalizeMode(cfg.SanitizeMode)
	}
	if strings.TrimSpace(cfg.LocalAddr) == "" {
		cfg.LocalAddr = "127.0.0.1:18080"
	}
}
