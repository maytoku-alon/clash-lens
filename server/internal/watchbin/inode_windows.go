//go:build windows

package watchbin

import "os"

func fileInode(_ os.FileInfo) uint64 {
	return 0
}
