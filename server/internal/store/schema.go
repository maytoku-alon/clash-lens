package store

import (
	"database/sql"
	"fmt"
	"strings"
)

func (s *Store) migrate() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS app_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at INTEGER NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS devices (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			os TEXT NOT NULL,
			icon TEXT NOT NULL DEFAULT 'monitor',
			token_hash TEXT NOT NULL UNIQUE,
			token_prefix TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			last_seen_at INTEGER NOT NULL DEFAULT 0,
			mihomo_version TEXT NOT NULL DEFAULT '',
			tun_enabled INTEGER NOT NULL DEFAULT 0,
			sniffer_enabled INTEGER NOT NULL DEFAULT 0,
			find_process_mode TEXT NOT NULL DEFAULT '',
			inbound_mode TEXT NOT NULL DEFAULT '',
			live_up_bps INTEGER NOT NULL DEFAULT 0,
			live_down_bps INTEGER NOT NULL DEFAULT 0,
			live_conns INTEGER NOT NULL DEFAULT 0,
			dashboard_url TEXT NOT NULL DEFAULT ''
		);`,
		`CREATE TABLE IF NOT EXISTS ingest_batches (
			device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
			batch_id TEXT NOT NULL,
			received_at INTEGER NOT NULL,
			PRIMARY KEY (device_id, batch_id)
		);`,
		`CREATE TABLE IF NOT EXISTS traffic_minute_totals (
			device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
			bucket_ts INTEGER NOT NULL,
			proxy_up INTEGER NOT NULL DEFAULT 0,
			proxy_down INTEGER NOT NULL DEFAULT 0,
			direct_up INTEGER NOT NULL DEFAULT 0,
			direct_down INTEGER NOT NULL DEFAULT 0,
			reject_bytes INTEGER NOT NULL DEFAULT 0,
			unattributed_up INTEGER NOT NULL DEFAULT 0,
			unattributed_down INTEGER NOT NULL DEFAULT 0,
			conn_count INTEGER NOT NULL DEFAULT 0,
			tun_bytes INTEGER NOT NULL DEFAULT 0,
			proxy_port_bytes INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (device_id, bucket_ts)
		);`,
		`CREATE TABLE IF NOT EXISTS traffic_minute_flows (
			device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
			bucket_ts INTEGER NOT NULL,
			process_name TEXT NOT NULL,
			process_display TEXT NOT NULL,
			root_domain TEXT NOT NULL,
			service_tag TEXT NOT NULL DEFAULT '',
			host TEXT NOT NULL,
			egress_node TEXT NOT NULL,
			proxy_group TEXT NOT NULL,
			route_type TEXT NOT NULL,
			inbound_mode TEXT NOT NULL,
			rule TEXT NOT NULL DEFAULT '',
			up_bytes INTEGER NOT NULL DEFAULT 0,
			down_bytes INTEGER NOT NULL DEFAULT 0,
			conn_count INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (device_id, bucket_ts, process_name, root_domain, host, egress_node, route_type, inbound_mode)
		);`,
		`CREATE TABLE IF NOT EXISTS traffic_hourly_flows (
			device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
			hour_ts INTEGER NOT NULL,
			process_name TEXT NOT NULL,
			process_display TEXT NOT NULL,
			root_domain TEXT NOT NULL,
			service_tag TEXT NOT NULL DEFAULT '',
			host TEXT NOT NULL,
			egress_node TEXT NOT NULL,
			proxy_group TEXT NOT NULL,
			route_type TEXT NOT NULL,
			inbound_mode TEXT NOT NULL,
			rule TEXT NOT NULL DEFAULT '',
			up_bytes INTEGER NOT NULL DEFAULT 0,
			down_bytes INTEGER NOT NULL DEFAULT 0,
			conn_count INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (device_id, hour_ts, process_name, root_domain, host, egress_node, route_type, inbound_mode)
		);`,
		`CREATE TABLE IF NOT EXISTS traffic_daily_flows (
			device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
			day_date TEXT NOT NULL,
			process_name TEXT NOT NULL,
			process_display TEXT NOT NULL,
			root_domain TEXT NOT NULL,
			service_tag TEXT NOT NULL DEFAULT '',
			egress_node TEXT NOT NULL,
			proxy_group TEXT NOT NULL DEFAULT '',
			route_type TEXT NOT NULL,
			rule TEXT NOT NULL DEFAULT '',
			up_bytes INTEGER NOT NULL DEFAULT 0,
			down_bytes INTEGER NOT NULL DEFAULT 0,
			tun_bytes INTEGER NOT NULL DEFAULT 0,
			conn_count INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (device_id, day_date, process_name, root_domain, egress_node, route_type)
		);`,
		`CREATE TABLE IF NOT EXISTS traffic_daily_summary (
			device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
			day_date TEXT NOT NULL,
			proxy_up INTEGER NOT NULL DEFAULT 0,
			proxy_down INTEGER NOT NULL DEFAULT 0,
			direct_up INTEGER NOT NULL DEFAULT 0,
			direct_down INTEGER NOT NULL DEFAULT 0,
			reject_bytes INTEGER NOT NULL DEFAULT 0,
			conn_count INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (device_id, day_date)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_minute_totals_ts ON traffic_minute_totals(bucket_ts);`,
		`CREATE INDEX IF NOT EXISTS idx_minute_flows_ts_dev ON traffic_minute_flows(bucket_ts, device_id);`,
		`CREATE INDEX IF NOT EXISTS idx_minute_flows_proc ON traffic_minute_flows(process_display, bucket_ts);`,
		`CREATE INDEX IF NOT EXISTS idx_hourly_flows_ts_dev ON traffic_hourly_flows(hour_ts, device_id);`,
		`CREATE INDEX IF NOT EXISTS idx_hourly_flows_proc ON traffic_hourly_flows(process_display, hour_ts);`,
		`CREATE INDEX IF NOT EXISTS idx_hourly_flows_dom ON traffic_hourly_flows(root_domain, hour_ts);`,
		`CREATE INDEX IF NOT EXISTS idx_daily_flows_date_dev ON traffic_daily_flows(day_date, device_id);`,
		`CREATE INDEX IF NOT EXISTS idx_daily_flows_proc ON traffic_daily_flows(process_display, day_date);`,
		`CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON traffic_daily_summary(day_date);`,
	}

	for _, stmt := range stmts {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}
	return s.ensureColumn("devices", "dashboard_url", "TEXT NOT NULL DEFAULT ''")
}

func (s *Store) ensureColumn(table, column, definition string) error {
	rows, err := s.db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return err
	}
	var exists bool
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull int
		var dfltValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			_ = rows.Close()
			return err
		}
		if strings.EqualFold(name, column) {
			exists = true
		}
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	_ = rows.Close()
	if exists {
		return nil
	}
	_, err = s.db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition))
	return err
}
