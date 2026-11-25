package buffer

import (
	"bytes"
	"compress/gzip"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"clash-lens/pkg/protocol"
	_ "modernc.org/sqlite"
)

// PendingBatch represents one queued gzipped batch ready for upload.
type PendingBatch struct {
	BatchID   string
	PayloadGZ []byte
	CreatedAt int64
}

// Queue stores finalized ingest batches locally in SQLite so network outages or server restarts never lose data.
type Queue struct {
	db *sql.DB
	mu sync.Mutex
}

// Open opens or creates the local offline buffer SQLite database.
func Open(dbPath string) (*Queue, error) {
	inMem := dbPath == ":memory:" || strings.HasPrefix(dbPath, "file::memory:")
	if !inMem {
		dir := filepath.Dir(dbPath)
		if dir != "" && dir != "." {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return nil, fmt.Errorf("create buffer dir: %w", err)
			}
		}
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if !inMem {
		_, _ = db.Exec("PRAGMA journal_mode = WAL;")
	}
	_, _ = db.Exec("PRAGMA synchronous = NORMAL;")
	_, _ = db.Exec("PRAGMA busy_timeout = 5000;")

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS pending_batches (
			batch_id TEXT PRIMARY KEY,
			payload_gz BLOB NOT NULL,
			created_at INTEGER NOT NULL
		);
	`)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Queue{db: db}, nil
}

// Close closes the offline queue DB.
func (q *Queue) Close() error {
	return q.db.Close()
}

// Enqueue gzips and persists an IngestBatchRequest into SQLite.
func (q *Queue) Enqueue(ctx context.Context, batch protocol.IngestBatchRequest) error {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if err := json.NewEncoder(gz).Encode(batch); err != nil {
		_ = gz.Close()
		return err
	}
	if err := gz.Close(); err != nil {
		return err
	}

	q.mu.Lock()
	defer q.mu.Unlock()
	_, err := q.db.ExecContext(ctx, `
		INSERT OR IGNORE INTO pending_batches (batch_id, payload_gz, created_at)
		VALUES (?, ?, ?)
	`, batch.BatchID, buf.Bytes(), time.Now().Unix())
	return err
}

// Peek returns up to limit oldest pending batches.
func (q *Queue) Peek(ctx context.Context, limit int) ([]PendingBatch, error) {
	if limit <= 0 {
		limit = 10
	}
	q.mu.Lock()
	defer q.mu.Unlock()

	rows, err := q.db.QueryContext(ctx, `
		SELECT batch_id, payload_gz, created_at
		FROM pending_batches
		ORDER BY created_at ASC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PendingBatch
	for rows.Next() {
		var pb PendingBatch
		if err := rows.Scan(&pb.BatchID, &pb.PayloadGZ, &pb.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, pb)
	}
	return out, rows.Err()
}

// Ack deletes a successfully uploaded batch from the queue.
func (q *Queue) Ack(ctx context.Context, batchID string) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	_, err := q.db.ExecContext(ctx, `DELETE FROM pending_batches WHERE batch_id = ?`, batchID)
	return err
}

// Count returns the number of batches currently waiting for upload.
func (q *Queue) Count(ctx context.Context) (int, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	var n int
	err := q.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pending_batches`).Scan(&n)
	return n, err
}
