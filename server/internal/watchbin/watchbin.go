package watchbin

import (
	"context"
	"os"
	"strings"
	"time"
)

type fileSig struct {
	size    int64
	modNano int64
	inode   uint64
}

func readSig(path string) (fileSig, bool) {
	fi, err := os.Stat(path)
	if err != nil {
		return fileSig{}, false
	}
	return fileSig{
		size:    fi.Size(),
		modNano: fi.ModTime().UnixNano(),
		inode:   fileInode(fi),
	}, true
}

// Watch polls binPath and invokes onChange once after an atomic replacement/update is detected and stable.
func Watch(ctx context.Context, binPath string, interval time.Duration, minSize int64, onChange func()) {
	if binPath == "" || strings.Contains(binPath, "go-build") {
		return
	}
	if interval <= 0 {
		interval = 3 * time.Second
	}

	initial, ok := readSig(binPath)
	if !ok {
		return
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cur, ok := readSig(binPath)
			if !ok {
				continue
			}
			if cur == initial {
				continue
			}
			// Debounce slightly in case a non-atomic copy is finishing
			select {
			case <-ctx.Done():
				return
			case <-time.After(1 * time.Second):
			}
			settled, ok := readSig(binPath)
			if !ok || settled.size < minSize {
				continue
			}
			onChange()
			return
		}
	}
}
