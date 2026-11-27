package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"clash-lens/pkg/privacy"
	"clash-lens/pkg/protocol"
	_ "modernc.org/sqlite"
)

const (
	settingAdminHash           = "admin_password_hash"
	settingSessionSecret       = "session_secret"
	settingUserSettings        = "user_settings"
	defaultBurstMB             = 200
	defaultMonthlyQuotaGB      = 0
	defaultResetDay            = 1
	defaultMinuteRetentionDays = 7
	defaultHourlyRetentionDays = 30
)

// Store wraps SQLite persistence, ingestion, retention maintenance, and analytics queries.
type Store struct {
	db     *sql.DB
	dbPath string
	mu     sync.Mutex
	inMem  bool
}

// Open initializes the SQLite database in WAL mode and runs schema migrations.
func Open(dbPath string) (*Store, error) {
	inMem := dbPath == ":memory:" || strings.HasPrefix(dbPath, "file::memory:")
	if !inMem {
		dir := filepath.Dir(dbPath)
		if dir != "" && dir != "." {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return nil, fmt.Errorf("create db dir: %w", err)
			}
		}
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	pragmas := []string{
		"PRAGMA busy_timeout = 5000;",
		"PRAGMA foreign_keys = ON;",
		"PRAGMA synchronous = NORMAL;",
	}
	if !inMem {
		pragmas = append([]string{"PRAGMA journal_mode = WAL;"}, pragmas...)
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			_ = db.Close()
			return nil, fmt.Errorf("exec %s: %w", p, err)
		}
	}

	s := &Store{db: db, dbPath: dbPath, inMem: inMem}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	if _, err := s.SanitizeHistoricalRules(context.Background()); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("sanitize historical rules: %w", err)
	}
	return s, nil
}

// Close closes the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

// GetSetting fetches a raw string setting by key; returns "", false if missing.
func (s *Store) GetSetting(ctx context.Context, key string) (string, bool, error) {
	var val string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM app_settings WHERE key = ?`, key).Scan(&val)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return val, true, nil
}

// SetSetting upserts a raw string setting by key.
func (s *Store) SetSetting(ctx context.Context, key, value string) error {
	now := time.Now().Unix()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO app_settings (key, value, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`, key, value, now)
	return err
}

// GetAdminPasswordHash returns the stored bcrypt hash or empty string if uninitialized.
func (s *Store) GetAdminPasswordHash(ctx context.Context) (string, error) {
	v, ok, err := s.GetSetting(ctx, settingAdminHash)
	if err != nil || !ok {
		return "", err
	}
	return v, nil
}

// SetAdminPasswordHash saves the bcrypt password hash.
func (s *Store) SetAdminPasswordHash(ctx context.Context, hash string) error {
	return s.SetSetting(ctx, settingAdminHash, hash)
}

// GetOrCreateSessionSecret returns the persisted HMAC session signing secret.
func (s *Store) GetOrCreateSessionSecret(ctx context.Context, fallbackGenerator func() (string, error)) (string, error) {
	if v, ok, err := s.GetSetting(ctx, settingSessionSecret); err != nil {
		return "", err
	} else if ok && v != "" {
		return v, nil
	}
	secret, err := fallbackGenerator()
	if err != nil {
		return "", err
	}
	if err := s.SetSetting(ctx, settingSessionSecret, secret); err != nil {
		return "", err
	}
	return secret, nil
}

// normalizeRetentionDays clamps minute [1..30] and hourly [max(7, minute)..365] retention windows.
func normalizeRetentionDays(minDays, hourDays int) (int, int) {
	if minDays <= 0 {
		minDays = defaultMinuteRetentionDays
	} else if minDays < 1 {
		minDays = 1
	} else if minDays > 30 {
		minDays = 30
	}
	minAllowedHourly := 7
	if minDays > minAllowedHourly {
		minAllowedHourly = minDays
	}
	if hourDays <= 0 {
		hourDays = defaultHourlyRetentionDays
	}
	if hourDays < minAllowedHourly {
		hourDays = minAllowedHourly
	} else if hourDays > 365 {
		hourDays = 365
	}
	return minDays, hourDays
}

// DefaultSettings returns initial user settings.
func DefaultSettings() protocol.SettingsPayload {
	return protocol.SettingsPayload{
		MonthlyQuotaGB:      defaultMonthlyQuotaGB,
		ResetDay:            defaultResetDay,
		BurstThresholdMB:    defaultBurstMB,
		MinuteRetentionDays: defaultMinuteRetentionDays,
		HourlyRetentionDays: defaultHourlyRetentionDays,
		NodeMultipliers:     []protocol.NodeMultiplierRule{},
		DomainAliases:       []protocol.DomainAliasRule{},
	}
}

// GetSettings loads user settings or returns defaults.
func (s *Store) GetSettings(ctx context.Context) (protocol.SettingsPayload, error) {
	def := DefaultSettings()
	raw, ok, err := s.GetSetting(ctx, settingUserSettings)
	if err != nil || !ok || raw == "" {
		return def, err
	}
	var cfg protocol.SettingsPayload
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return def, nil
	}
	if cfg.ResetDay < 1 || cfg.ResetDay > 28 {
		cfg.ResetDay = 1
	}
	if cfg.BurstThresholdMB <= 0 {
		cfg.BurstThresholdMB = defaultBurstMB
	}
	cfg.MinuteRetentionDays, cfg.HourlyRetentionDays = normalizeRetentionDays(cfg.MinuteRetentionDays, cfg.HourlyRetentionDays)
	if cfg.NodeMultipliers == nil {
		cfg.NodeMultipliers = []protocol.NodeMultiplierRule{}
	}
	if cfg.DomainAliases == nil {
		cfg.DomainAliases = []protocol.DomainAliasRule{}
	}
	return cfg, nil
}

// SaveSettings validates and persists user settings.
func (s *Store) SaveSettings(ctx context.Context, cfg protocol.SettingsPayload) (protocol.SettingsPayload, error) {
	if cfg.MonthlyQuotaGB < 0 {
		cfg.MonthlyQuotaGB = 0
	}
	if cfg.ResetDay < 1 || cfg.ResetDay > 28 {
		cfg.ResetDay = 1
	}
	if cfg.BurstThresholdMB <= 0 {
		cfg.BurstThresholdMB = defaultBurstMB
	}
	cfg.MinuteRetentionDays, cfg.HourlyRetentionDays = normalizeRetentionDays(cfg.MinuteRetentionDays, cfg.HourlyRetentionDays)
	cleanMult := make([]protocol.NodeMultiplierRule, 0, len(cfg.NodeMultipliers))
	for _, r := range cfg.NodeMultipliers {
		p := strings.TrimSpace(r.Pattern)
		if p == "" || r.Multiplier < 0 {
			continue
		}
		cleanMult = append(cleanMult, protocol.NodeMultiplierRule{
			Pattern:    p,
			Multiplier: r.Multiplier,
		})
	}
	cleanAliases := make([]protocol.DomainAliasRule, 0, len(cfg.DomainAliases))
	for _, a := range cfg.DomainAliases {
		d := strings.ToLower(strings.TrimSpace(a.Domain))
		l := strings.TrimSpace(a.Label)
		if d == "" || l == "" {
			continue
		}
		cleanAliases = append(cleanAliases, protocol.DomainAliasRule{
			Domain: d,
			Label:  l,
		})
	}
	cfg.NodeMultipliers = cleanMult
	cfg.DomainAliases = cleanAliases

	encoded, err := json.Marshal(cfg)
	if err != nil {
		return cfg, err
	}
	if err := s.SetSetting(ctx, settingUserSettings, string(encoded)); err != nil {
		return cfg, err
	}
	return cfg, nil
}

// RunMaintenanceLoop runs startup compaction + hourly tiered archival and long-tail host folding until ctx cancels.
func (s *Store) RunMaintenanceLoop(ctx context.Context, tzOffsetMinutes int) {
	select {
	case <-ctx.Done():
		return
	case <-time.After(15 * time.Second):
		_ = s.MaintainWithTZ(ctx, time.Now().Unix(), tzOffsetMinutes)
	}

	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			_ = s.MaintainWithTZ(ctx, now.Unix(), tzOffsetMinutes)
		}
	}
}

// Maintain prunes old minute/batch rows and runs tiered archival in UTC.
func (s *Store) Maintain(ctx context.Context, now int64) error {
	return s.MaintainWithTZ(ctx, now, 0)
}

// MaintainWithTZ runs configured tiered retention pruning, hourly->daily archival, and long-tail host folding.
func (s *Store) MaintainWithTZ(ctx context.Context, now int64, tzOffsetMinutes int) error {
	cfg, _ := s.GetSettings(ctx)
	_, err := s.compactInternal(ctx, cfg.MinuteRetentionDays, cfg.HourlyRetentionDays, false, tzOffsetMinutes, now, true)
	return err
}

// SanitizeHistoricalRules scrubs previously ingested local paths in stored rule columns.
func (s *Store) SanitizeHistoricalRules(ctx context.Context) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	type rulePair struct {
		orig  string
		clean string
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT rule FROM traffic_minute_flows
		WHERE rule != '' AND (rule LIKE '%\\%' OR rule LIKE '%/%' OR lower(rule) LIKE 'process%path%')
		UNION
		SELECT DISTINCT rule FROM traffic_hourly_flows
		WHERE rule != '' AND (rule LIKE '%\\%' OR rule LIKE '%/%' OR lower(rule) LIKE 'process%path%')
	`)
	if err != nil {
		return 0, err
	}

	var updates []rulePair
	for rows.Next() {
		var orig string
		if err := rows.Scan(&orig); err != nil {
			_ = rows.Close()
			return 0, err
		}
		clean := privacy.SanitizeRule(orig, privacy.ModeMask)
		if clean != orig {
			updates = append(updates, rulePair{orig: orig, clean: clean})
		}
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return 0, err
	}
	_ = rows.Close()

	if len(updates) == 0 {
		return 0, nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	var totalUpdated int64
	for _, u := range updates {
		var res1, res2 sql.Result
		res1, err = tx.ExecContext(ctx, `UPDATE traffic_minute_flows SET rule = ? WHERE rule = ?`, u.clean, u.orig)
		if err != nil {
			return 0, err
		}
		if n, rErr := res1.RowsAffected(); rErr == nil {
			totalUpdated += n
		}
		res2, err = tx.ExecContext(ctx, `UPDATE traffic_hourly_flows SET rule = ? WHERE rule = ?`, u.clean, u.orig)
		if err != nil {
			return 0, err
		}
		if n, rErr := res2.RowsAffected(); rErr == nil {
			totalUpdated += n
		}
	}

	if err = tx.Commit(); err != nil {
		return 0, err
	}
	return totalUpdated, nil
}
