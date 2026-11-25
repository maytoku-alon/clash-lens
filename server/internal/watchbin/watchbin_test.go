package watchbin_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"clash-lens/server/internal/watchbin"
)

func TestWatchDetectsAtomicReplacement(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "server-bin")
	if err := os.WriteFile(bin, []byte("initial-binary-v1"), 0o755); err != nil {
		t.Fatalf("write initial: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	triggered := make(chan struct{}, 1)
	go watchbin.Watch(ctx, bin, 50*time.Millisecond, 4, func() {
		select {
		case triggered <- struct{}{}:
		default:
		}
	})

	time.Sleep(120 * time.Millisecond)

	tmp := bin + ".new"
	if err := os.WriteFile(tmp, []byte("updated-binary-v2-payload"), 0o755); err != nil {
		t.Fatalf("write tmp: %v", err)
	}
	if err := os.Rename(tmp, bin); err != nil {
		t.Fatalf("rename: %v", err)
	}

	select {
	case <-triggered:
	case <-time.After(3 * time.Second):
		t.Fatalf("expected watchbin to trigger after atomic replacement")
	}
}
