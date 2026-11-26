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

// GetStorageStats reports database file sizes, per-table row counts, and earliest/latest bucket timestamps.
func (s *Store) GetStorageStats(ctx context.Context) (protocol.StorageStatsResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	dbBytes, walBytes := s.measureSizes(ctx)
	out := protocol.StorageStatsResponse{
		DBSizeBytes:    dbBytes,
		WALSizeBytes:   walBytes,
		TotalSizeBytes: dbBytes + walBytes,
		InMemory:       s.inMem,
	}

	queries := []struct {
		sql string
		dst *int64
	}{
		{`SELECT COUNT(*) FROM traffic_minute_totals`, &out.MinuteTotalsRows},
		{`SELECT COUNT(*) FROM traffic_minute_flows`, &out.MinuteFlowsRows},
		{`SELECT COUNT(*) FROM traffic_hourly_flows`, &out.HourlyFlowsRows},
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

	// Fallback to hourly flows if minute totals were pruned earlier than hourly rollups.
	var oldestHourly int64
	if err := s.db.QueryRowContext(ctx, `SELECT COALESCE(MIN(hour_ts), 0) FROM traffic_hourly_flows`).Scan(&oldestHourly); err == nil && oldestHourly > 0 {
		if out.OldestTimestamp == 0 || oldestHourly < out.OldestTimestamp {
			out.OldestTimestamp = oldestHourly
		}
	}
	return out, nil
}

// PruneStorage deletes telemetry older than retainDays (>= 7) and optionally compacts SQLite storage.
func (s *Store) PruneStorage(ctx context.Context, retainDays int, vacuum bool, tzOffsetMinutes int) (protocol.StoragePruneResponse, error) {
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
	delDaily, err := execCount(`DELETE FROM traffic_daily_summary WHERE day_date < ?`, cutoffDay)
	if err != nil {
		return protocol.StoragePruneResponse{}, err
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
