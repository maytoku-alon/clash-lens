package tray

import (
	"encoding/binary"
	"math"
)

// BuildIconICO constructs a crisp 32x32 32-bit RGBA Windows ICO containing an emerald/cyan ClashLens ring badge.
func BuildIconICO() []byte {
	const size = 32
	const xorBytes = size * size * 4
	const andRowBytes = ((size + 31) / 32) * 4
	const andBytes = size * andRowBytes
	const dibHeaderSize = 40
	const imageSize = dibHeaderSize + xorBytes + andBytes
	const icoHeaderSize = 6 + 16

	buf := make([]byte, icoHeaderSize+imageSize)

	// ICONDIR
	binary.LittleEndian.PutUint16(buf[0:2], 0) // reserved
	binary.LittleEndian.PutUint16(buf[2:4], 1) // type = ICO
	binary.LittleEndian.PutUint16(buf[4:6], 1) // count = 1

	// ICONDIRENTRY
	buf[6] = size
	buf[7] = size
	buf[8] = 0
	buf[9] = 0
	binary.LittleEndian.PutUint16(buf[10:12], 1)
	binary.LittleEndian.PutUint16(buf[12:14], 32)
	binary.LittleEndian.PutUint32(buf[14:18], imageSize)
	binary.LittleEndian.PutUint32(buf[18:22], icoHeaderSize)

	// BITMAPINFOHEADER
	off := icoHeaderSize
	binary.LittleEndian.PutUint32(buf[off:off+4], dibHeaderSize)
	binary.LittleEndian.PutUint32(buf[off+4:off+8], size)
	binary.LittleEndian.PutUint32(buf[off+8:off+12], size*2) // height includes AND mask
	binary.LittleEndian.PutUint16(buf[off+12:off+14], 1)
	binary.LittleEndian.PutUint16(buf[off+14:off+16], 32)
	binary.LittleEndian.PutUint32(buf[off+16:off+20], 0) // BI_RGB
	binary.LittleEndian.PutUint32(buf[off+20:off+24], xorBytes+andBytes)

	pxOff := off + dibHeaderSize
	cx, cy := 15.5, 15.5
	for y := 0; y < size; y++ {
		// BMP rows are bottom-up
		rowY := size - 1 - y
		for x := 0; x < size; x++ {
			dx := float64(x) - cx
			dy := float64(rowY) - cy
			dist := math.Hypot(dx, dy)

			var r, g, b, a uint8
			switch {
			case dist <= 14.5:
				// Dark zinc background disc (#141419)
				r, g, b, a = 20, 20, 25, 255
				if dist >= 8.2 && dist <= 11.6 {
					// Gradient emerald -> cyan ring
					t := (float64(x) + float64(y)) / 62.0
					r = uint8(16*(1-t) + 6*t)
					g = uint8(185*(1-t) + 182*t)
					b = uint8(129*(1-t) + 212*t)
					a = 255
				} else if dist <= 3.6 {
					// Bright center pulse dot
					r, g, b, a = 16, 185, 129, 255
				}
			case dist <= 15.3:
				// Soft anti-aliased edge
				alpha := math.Max(0, 15.3-dist) / 0.8
				r, g, b, a = 20, 20, 25, uint8(alpha*255)
			}

			i := pxOff + (y*size+x)*4
			buf[i+0] = b // BGRA order
			buf[i+1] = g
			buf[i+2] = r
			buf[i+3] = a
		}
	}
	return buf
}
