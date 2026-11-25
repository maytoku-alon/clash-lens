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
	settingAdminHash      = "admin_password_hash"
	settingSessionSecret  = "session_secret"
	settingUserSettings   = "user_settings"
	defaultBurstMB        = 200
	defaultMonthlyQuotaGB = 0
	defaultResetDay       = 1
)

// Store wraps SQLite persistence, ingestion, retention maintenance, and analytics queries.
type Store struct {
	db     *sql.DB
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

	s := &Store{db: db, inMem: inMem}
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

// DefaultSettings returns initial user settings.
func DefaultSettings() protocol.SettingsPayload {
	return protocol.SettingsPayload{
		MonthlyQuotaGB:   defaultMonthlyQuotaGB,
		ResetDay:         defaultResetDay,
		BurstThresholdMB: defaultBurstMB,
		NodeMultipliers:  []protocol.NodeMultiplierRule{},
		DomainAliases:    []protocol.DomainAliasRule{},
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

// RunMaintenanceLoop runs hourly retention pruning and long-tail host folding until ctx cancels.
func (s *Store) RunMaintenanceLoop(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			_ = s.Maintain(ctx, now.Unix())
		}
	}
}

// Maintain prunes old minute/batch rows and folds low-volume hourly subdomains into '*'.
func (s *Store) Maintain(ctx context.Context, now int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	cutoffMinuteFlows := now - 14*86400
	cutoffMinuteTotals := now - 90*86400
	cutoffBatches := now - 30*86400
	cutoffFold := now - 2*3600

	if _, err = tx.ExecContext(ctx, `DELETE FROM traffic_minute_flows WHERE bucket_ts < ?`, cutoffMinuteFlows); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM traffic_minute_totals WHERE bucket_ts < ?`, cutoffMinuteTotals); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM ingest_batches WHERE received_at < ?`, cutoffBatches); err != nil {
		return err
	}

	// Fold long-tail hosts (< 100 KB) older than 2 hours into host = '*' within the same hourly key.
	const foldThreshold int64 = 102400
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO traffic_hourly_flows (
			device_id, hour_ts, process_name, process_display, root_domain, service_tag,
			host, egress_node, proxy_group, route_type, inbound_mode, rule,
			up_bytes, down_bytes, conn_count
		)
		SELECT
			device_id, hour_ts, process_name, MAX(process_display), root_domain, MAX(service_tag),
			'*', egress_node, MAX(proxy_group), route_type, inbound_mode, MAX(rule),
			SUM(up_bytes), SUM(down_bytes), SUM(conn_count)
		FROM traffic_hourly_flows
		WHERE hour_ts < ? AND host != '*' AND (up_bytes + down_bytes) < ?
		GROUP BY device_id, hour_ts, process_name, root_domain, egress_node, route_type, inbound_mode
		ON CONFLICT(device_id, hour_ts, process_name, root_domain, host, egress_node, route_type, inbound_mode)
		DO UPDATE SET
			up_bytes = traffic_hourly_flows.up_bytes + excluded.up_bytes,
			down_bytes = traffic_hourly_flows.down_bytes + excluded.down_bytes,
			conn_count = traffic_hourly_flows.conn_count + excluded.conn_count,
			service_tag = CASE WHEN excluded.service_tag != '' THEN excluded.service_tag ELSE traffic_hourly_flows.service_tag END
	`, cutoffFold, foldThreshold); err != nil {
		return err
	}

	if _, err = tx.ExecContext(ctx, `
		DELETE FROM traffic_hourly_flows
		WHERE hour_ts < ? AND host != '*' AND (up_bytes + down_bytes) < ?
	`, cutoffFold, foldThreshold); err != nil {
		return err
	}

	err = tx.Commit()
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
