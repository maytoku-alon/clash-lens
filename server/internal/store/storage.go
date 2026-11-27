package store

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"time"

	"clash-lens/pkg/protocol"
)

// ErrInvalidRetainDays is returned when storage prune retention days are out of the safe range [7, 3650].
var ErrInvalidRetainDays = errors.New("保留天数必须在 7 到 3650 天之间")

func fileSizeBytes(path string) int64 {
	if path == "" {
		return 0
	}
	fi, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return fi.Size()
}

func (s *Store) measureSizes(ctx context.Context) (dbBytes, walBytes int64) {
	if s.inMem || s.dbPath == "" {
		var pageCount, pageSize int64
		_ = s.db.QueryRowContext(ctx, `PRAGMA page_count;`).Scan(&pageCount)
		_ = s.db.QueryRowContext(ctx, `PRAGMA page_size;`).Scan(&pageSize)
		return pageCount * pageSize, 0
	}
	return fileSizeBytes(s.dbPath), fileSizeBytes(s.dbPath + "-wal")
}

// GetStorageStats reports database file sizes, per-table row counts, retention config, and earliest/latest timestamps.
func (s *Store) GetStorageStats(ctx context.Context) (protocol.StorageStatsResponse, error) {
	cfg, _ := s.GetSettings(ctx)

	s.mu.Lock()
	defer s.mu.Unlock()

	dbBytes, walBytes := s.measureSizes(ctx)
	out := protocol.StorageStatsResponse{
		DBSizeBytes:         dbBytes,
		WALSizeBytes:        walBytes,
		TotalSizeBytes:      dbBytes + walBytes,
		MinuteRetentionDays: cfg.MinuteRetentionDays,
		HourlyRetentionDays: cfg.HourlyRetentionDays,
		InMemory:            s.inMem,
	}

	queries := []struct {
		sql string
		dst *int64
	}{
		{`SELECT COUNT(*) FROM traffic_minute_totals`, &out.MinuteTotalsRows},
		{`SELECT COUNT(*) FROM traffic_minute_flows`, &out.MinuteFlowsRows},
		{`SELECT COUNT(*) FROM traffic_hourly_flows`, &out.HourlyFlowsRows},
		{`SELECT COUNT(*) FROM traffic_daily_flows`, &out.DailyFlowsRows},
		{`SELECT COUNT(*) FROM traffic_daily_summary`, &out.DailySummaryRows},
		{`SELECT COUNT(*) FROM ingest_batches`, &out.IngestBatchesRows},
		{`SELECT COALESCE(MIN(bucket_ts), 0) FROM traffic_minute_totals`, &out.OldestTimestamp},
		{`SELECT COALESCE(MAX(bucket_ts), 0) FROM traffic_minute_totals`, &out.NewestTimestamp},
	}
	for _, q := range queries {
		if err := s.db.QueryRowContext(ctx, q.sql).Scan(q.dst); err != nil {
			return out, err
		}
	}

	var oldestHourly int64
	if err := s.db.QueryRowContext(ctx, `SELECT COALESCE(MIN(hour_ts), 0) FROM traffic_hourly_flows`).Scan(&oldestHourly); err == nil && oldestHourly > 0 {
		if out.OldestTimestamp == 0 || oldestHourly < out.OldestTimestamp {
			out.OldestTimestamp = oldestHourly
		}
	}

	for _, daySQL := range []string{
		`SELECT COALESCE(MIN(day_date), '') FROM traffic_daily_flows`,
		`SELECT COALESCE(MIN(day_date), '') FROM traffic_daily_summary`,
	} {
		var dStr string
		if err := s.db.QueryRowContext(ctx, daySQL).Scan(&dStr); err == nil && dStr != "" {
			if t, pErr := time.Parse("2006-01-02", dStr); pErr == nil {
				ts := t.Unix()
				if out.OldestTimestamp == 0 || ts < out.OldestTimestamp {
					out.OldestTimestamp = ts
				}
			}
		}
	}
	return out, nil
}

// CompactStorage runs lossless tiered archival: prunes minute detail older than minuteRetainDays,
// rolls up hourly flows older than hourlyRetainDays into traffic_daily_flows, folds long-tail hosts, and compacts SQLite.
func (s *Store) CompactStorage(ctx context.Context, minuteRetainDays, hourlyRetainDays int, vacuum bool, tzOffsetMinutes int) (protocol.StorageCompactResponse, error) {
	cfg, _ := s.GetSettings(ctx)
	if minuteRetainDays <= 0 {
		minuteRetainDays = cfg.MinuteRetentionDays
	}
	if hourlyRetainDays <= 0 {
		hourlyRetainDays = cfg.HourlyRetentionDays
	}
	return s.compactInternal(ctx, minuteRetainDays, hourlyRetainDays, vacuum, tzOffsetMinutes, time.Now().Unix(), false)
}

func (s *Store) compactInternal(
	ctx context.Context,
	minuteRetainDays, hourlyRetainDays int,
	vacuum bool,
	tzOffsetMinutes int,
	now int64,
	pruneBatchesAndTotals bool,
) (protocol.StorageCompactResponse, error) {
	minuteRetainDays, hourlyRetainDays = normalizeRetentionDays(minuteRetainDays, hourlyRetainDays)

	s.mu.Lock()
	defer s.mu.Unlock()

	beforeDB, beforeWAL := s.measureSizes(ctx)
	beforeBytes := beforeDB + beforeWAL

	cutoffMinuteFlows := now - int64(minuteRetainDays)*86400
	cutoffMinuteTotals := now - 90*86400
	cutoffBatches := now - 30*86400
	cutoffFold := now - 2*3600

	// Align hourly->daily archival boundary to local midnight so whole calendar days roll up atomically.
	loc := fixedLoc(tzOffsetMinutes)
	cutT := time.Unix(now-int64(hourlyRetainDays)*86400, 0).In(loc)
	hourlyCutoffTS := time.Date(cutT.Year(), cutT.Month(), cutT.Day(), 0, 0, 0, 0, loc).Unix()
	tzSec := int64(tzOffsetMinutes * 60)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return protocol.StorageCompactResponse{}, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	execCount := func(query string, args ...any) (int64, error) {
		var res sql.Result
		res, err = tx.ExecContext(ctx, query, args...)
		if err != nil {
			return 0, err
		}
		n, rErr := res.RowsAffected()
		if rErr != nil {
			return 0, nil
		}
		return n, nil
	}

	prunedMin, err := execCount(`DELETE FROM traffic_minute_flows WHERE bucket_ts < ?`, cutoffMinuteFlows)
	if err != nil {
		return protocol.StorageCompactResponse{}, err
	}

	if pruneBatchesAndTotals {
		if _, err = tx.ExecContext(ctx, `DELETE FROM traffic_minute_totals WHERE bucket_ts < ?`, cutoffMinuteTotals); err != nil {
			return protocol.StorageCompactResponse{}, err
		}
		if _, err = tx.ExecContext(ctx, `DELETE FROM ingest_batches WHERE received_at < ?`, cutoffBatches); err != nil {
			return protocol.StorageCompactResponse{}, err
		}
	}

	// Archive whole calendar days older than hourlyCutoffTS from hourly -> 6D daily_flows.
	dailyUpserted, err := execCount(`
		INSERT INTO traffic_daily_flows (
			device_id, day_date, process_name, process_display, root_domain, service_tag,
			egress_node, proxy_group, route_type, rule,
			up_bytes, down_bytes, tun_bytes, conn_count
		)
		SELECT
			device_id,
			date(hour_ts + ?, 'unixepoch') AS d_date,
			process_name,
			MAX(process_display),
			root_domain,
			MAX(service_tag),
			egress_node,
			MAX(proxy_group),
			route_type,
			MAX(rule),
			SUM(up_bytes),
			SUM(down_bytes),
			SUM(CASE WHEN inbound_mode = 'TUN' THEN up_bytes + down_bytes ELSE 0 END),
			SUM(conn_count)
		FROM traffic_hourly_flows
		WHERE hour_ts < ?
		GROUP BY device_id, d_date, process_name, root_domain, egress_node, route_type
		ON CONFLICT(device_id, day_date, process_name, root_domain, egress_node, route_type)
		DO UPDATE SET
			up_bytes = traffic_daily_flows.up_bytes + excluded.up_bytes,
			down_bytes = traffic_daily_flows.down_bytes + excluded.down_bytes,
			tun_bytes = traffic_daily_flows.tun_bytes + excluded.tun_bytes,
			conn_count = traffic_daily_flows.conn_count + excluded.conn_count,
			process_display = CASE WHEN excluded.process_display != '' THEN excluded.process_display ELSE traffic_daily_flows.process_display END,
			service_tag = CASE WHEN excluded.service_tag != '' THEN excluded.service_tag ELSE traffic_daily_flows.service_tag END,
			proxy_group = CASE WHEN excluded.proxy_group != '' THEN excluded.proxy_group ELSE traffic_daily_flows.proxy_group END,
			rule = CASE WHEN excluded.rule != '' THEN excluded.rule ELSE traffic_daily_flows.rule END
	`, tzSec, hourlyCutoffTS)
	if err != nil {
		return protocol.StorageCompactResponse{}, err
	}

	archivedHourly, err := execCount(`DELETE FROM traffic_hourly_flows WHERE hour_ts < ?`, hourlyCutoffTS)
	if err != nil {
		return protocol.StorageCompactResponse{}, err
	}

	// Fold long-tail hosts (< 100 KB) older than 2 hours into host = '*' in remaining hourly flows.
	const foldThreshold int64 = 102400
	foldedUpsert, err := execCount(`
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
	`, cutoffFold, foldThreshold)
	if err != nil {
		return protocol.StorageCompactResponse{}, err
	}
	_ = foldedUpsert

	foldedDel, err := execCount(`
		DELETE FROM traffic_hourly_flows
		WHERE hour_ts < ? AND host != '*' AND (up_bytes + down_bytes) < ?
	`, cutoffFold, foldThreshold)
	if err != nil {
		return protocol.StorageCompactResponse{}, err
	}

	if err = tx.Commit(); err != nil {
		return protocol.StorageCompactResponse{}, err
	}

	if !s.inMem {
		_, _ = s.db.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE);`)
		if vacuum {
			if _, vErr := s.db.ExecContext(ctx, `VACUUM;`); vErr == nil {
				_, _ = s.db.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE);`)
			}
		}
	}

	afterDB, afterWAL := s.measureSizes(ctx)
	return protocol.StorageCompactResponse{
		OK:                 true,
		MinuteRetainDays:   minuteRetainDays,
		HourlyRetainDays:   hourlyRetainDays,
		PrunedMinuteRows:   prunedMin,
		ArchivedHourlyRows: archivedHourly,
		DailyFlowsUpserted: dailyUpserted,
		FoldedTailHourly:   foldedDel,
		BeforeBytes:        beforeBytes,
		AfterBytes:         afterDB + afterWAL,
		Vacuumed:           vacuum && !s.inMem,
	}, nil
}

// PruneStorage deletes telemetry older than retainDays (>= 7) and optionally preserves daily summaries.
func (s *Store) PruneStorage(ctx context.Context, retainDays int, vacuum bool, preserveSummary bool, tzOffsetMinutes int) (protocol.StoragePruneResponse, error) {
	if retainDays < 7 || retainDays > 3650 {
		return protocol.StoragePruneResponse{}, ErrInvalidRetainDays
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	beforeDB, beforeWAL := s.measureSizes(ctx)
	beforeBytes := beforeDB + beforeWAL

	now := time.Now().Unix()
	cutoffTS := now - int64(retainDays)*86400
	cutoffDay := time.Unix(cutoffTS, 0).UTC().Add(time.Duration(tzOffsetMinutes) * time.Minute).Format("2006-01-02")

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return protocol.StoragePruneResponse{}, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	execCount := func(query string, arg any) (int64, error) {
		var res sql.Result
		res, err = tx.ExecContext(ctx, query, arg)
		if err != nil {
			return 0, err
		}
		n, rErr := res.RowsAffected()
		if rErr != nil {
			return 0, nil
		}
		return n, nil
	}

	delMinFlows, err := execCount(`DELETE FROM traffic_minute_flows WHERE bucket_ts < ?`, cutoffTS)
	if err != nil {
		return protocol.StoragePruneResponse{}, err
	}
	delMinTotals, err := execCount(`DELETE FROM traffic_minute_totals WHERE bucket_ts < ?`, cutoffTS)
	if err != nil {
		return protocol.StoragePruneResponse{}, err
	}
	delHourly, err := execCount(`DELETE FROM traffic_hourly_flows WHERE hour_ts < ?`, cutoffTS)
	if err != nil {
		return protocol.StoragePruneResponse{}, err
	}
	var delDaily int64
	if !preserveSummary {
		delDailyFlows, dErr := execCount(`DELETE FROM traffic_daily_flows WHERE day_date < ?`, cutoffDay)
		if dErr != nil {
			return protocol.StoragePruneResponse{}, dErr
		}
		delDailySummary, sErr := execCount(`DELETE FROM traffic_daily_summary WHERE day_date < ?`, cutoffDay)
		if sErr != nil {
			return protocol.StoragePruneResponse{}, sErr
		}
		delDaily = delDailyFlows + delDailySummary
	}
	delBatch, err := execCount(`DELETE FROM ingest_batches WHERE received_at < ?`, cutoffTS)
	if err != nil {
		return protocol.StoragePruneResponse{}, err
	}

	if err = tx.Commit(); err != nil {
		return protocol.StoragePruneResponse{}, err
	}

	if !s.inMem {
		_, _ = s.db.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE);`)
		if vacuum {
			if _, vErr := s.db.ExecContext(ctx, `VACUUM;`); vErr == nil {
				_, _ = s.db.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE);`)
			}
		}
	}

	afterDB, afterWAL := s.measureSizes(ctx)
	delMinute := delMinFlows + delMinTotals
	return protocol.StoragePruneResponse{
		OK:                true,
		RetainDays:        retainDays,
		CutoffTimestamp:   cutoffTS,
		DeletedMinuteRows: delMinute,
		DeletedHourlyRows: delHourly,
		DeletedDailyRows:  delDaily,
		DeletedBatchRows:  delBatch,
		TotalDeletedRows:  delMinute + delHourly + delDaily + delBatch,
		BeforeBytes:       beforeBytes,
		AfterBytes:        afterDB + afterWAL,
		Vacuumed:          vacuum && !s.inMem,
	}, nil
}
