package buffer_test

import (
	"context"
	"testing"

	"clash-lens/agent/internal/buffer"
	"clash-lens/pkg/protocol"
)

func TestOfflineBufferLifecycle(t *testing.T) {
	ctx := context.Background()
	q, err := buffer.Open(":memory:")
	if err != nil {
		t.Fatalf("open buffer: %v", err)
	}
	defer q.Close()

	b1 := protocol.IngestBatchRequest{
		BatchID: "batch-1",
		MinuteTotals: []protocol.MinuteTotalRecord{
			{BucketTS: 1700000040, ProxyDown: 12345},
		},
	}
	if err := q.Enqueue(ctx, b1); err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	cnt, err := q.Count(ctx)
	if err != nil || cnt != 1 {
		t.Fatalf("count=%d err=%v", cnt, err)
	}

	items, err := q.Peek(ctx, 5)
	if err != nil || len(items) != 1 || items[0].BatchID != "batch-1" {
		t.Fatalf("peek: %+v err=%v", items, err)
	}

	if err := q.Ack(ctx, "batch-1"); err != nil {
		t.Fatalf("ack: %v", err)
	}
	cnt, _ = q.Count(ctx)
	if cnt != 0 {
		t.Fatalf("expected 0 remaining after ack, got %d", cnt)
	}
}
