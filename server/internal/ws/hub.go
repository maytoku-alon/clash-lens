package ws

import (
	"context"
	"encoding/json"
	"sort"
	"sync"
	"time"

	"clash-lens/pkg/protocol"
	"clash-lens/server/internal/store"
	"github.com/gorilla/websocket"
)

type deviceLiveEntry struct {
	updatedAt int64
	payload   protocol.LivePushRequest
}

// Hub maintains per-device live rate state and broadcasts merged snapshots to dashboard WebSocket clients.
type Hub struct {
	store           *store.Store
	tzOffsetMin     int
	onlineThreshold int64

	mu      sync.RWMutex
	devices map[string]deviceLiveEntry
	clients map[*clientConn]struct{}
}

type clientConn struct {
	conn *websocket.Conn
	send chan []byte
}

// NewHub constructs a live WebSocket broadcast hub.
func NewHub(st *store.Store, tzOffsetMin int, onlineThresholdSec int64) *Hub {
	if onlineThresholdSec <= 0 {
		onlineThresholdSec = 30
	}
	return &Hub{
		store:           st,
		tzOffsetMin:     tzOffsetMin,
		onlineThreshold: onlineThresholdSec,
		devices:         make(map[string]deviceLiveEntry),
		clients:         make(map[*clientConn]struct{}),
	}
}

// UpdateDevice records the latest live push from a device.
func (h *Hub) UpdateDevice(deviceID string, req protocol.LivePushRequest) {
	h.mu.Lock()
	h.devices[deviceID] = deviceLiveEntry{
		updatedAt: time.Now().Unix(),
		payload:   req,
	}
	h.mu.Unlock()
}

// RemoveDevice removes cached live telemetry when a device is deleted.
func (h *Hub) RemoveDevice(deviceID string) {
	h.mu.Lock()
	delete(h.devices, deviceID)
	h.mu.Unlock()
}

// Run broadcasts merged live snapshots every 2 seconds until ctx cancels.
func (h *Hub) Run(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			h.closeAll()
			return
		case <-ticker.C:
			h.broadcastOnce(ctx)
		}
	}
}

// ServeClient registers a WebSocket client, immediately sends a snapshot, and pumps messages until closed.
func (h *Hub) ServeClient(ctx context.Context, conn *websocket.Conn) {
	c := &clientConn{
		conn: conn,
		send: make(chan []byte, 8),
	}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()

	if snap, err := h.BuildSnapshot(ctx); err == nil {
		if b, err := json.Marshal(snap); err == nil {
			select {
			case c.send <- b:
			default:
			}
		}
	}

	defer func() {
		h.mu.Lock()
		if _, exists := h.clients[c]; exists {
			delete(h.clients, c)
			close(c.send)
		}
		h.mu.Unlock()
		_ = conn.Close()
	}()

	go func() {
		for msg := range c.send {
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	// Drain client frames until disconnect
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

// BuildSnapshot combines registered devices from SQLite with recent live telemetry frames.
func (h *Hub) BuildSnapshot(ctx context.Context) (protocol.LiveHubSnapshot, error) {
	now := time.Now().Unix()
	devs, err := h.store.ListDevices(ctx, h.tzOffsetMin, h.onlineThreshold)
	if err != nil {
		return protocol.LiveHubSnapshot{}, err
	}

	h.mu.RLock()
	liveCopy := make(map[string]deviceLiveEntry, len(h.devices))
	for k, v := range h.devices {
		liveCopy[k] = v
	}
	h.mu.RUnlock()

	snap := protocol.LiveHubSnapshot{
		Timestamp: now,
		Devices:   make([]protocol.LiveDeviceSnapshot, 0, len(devs)),
		TopActive: make([]protocol.LiveConnectionItem, 0, 20),
	}

	for _, d := range devs {
		item := protocol.LiveDeviceSnapshot{
			DeviceID:        d.ID,
			DeviceName:      d.Name,
			OS:              d.OS,
			Icon:            d.Icon,
			Online:          d.Online,
			LastSeenAt:      d.LastSeenAt,
			TunEnabled:      d.TunEnabled,
			SnifferEnabled:  d.SnifferEnabled,
			FindProcessMode: d.FindProcessMode,
			InboundMode:     d.InboundMode,
			MihomoVersion:   d.MihomoVersion,
			DashboardURL:    d.DashboardURL,
		}
		if entry, ok := liveCopy[d.ID]; ok && (now-entry.updatedAt) <= h.onlineThreshold {
			item.Online = true
			item.UpBps = entry.payload.UpBps
			item.DownBps = entry.payload.DownBps
			item.ProxyUpBps = entry.payload.ProxyUpBps
			item.ProxyDownBps = entry.payload.ProxyDownBps
			item.DirectUpBps = entry.payload.DirectUpBps
			item.DirectDownBps = entry.payload.DirectDownBps
			item.ActiveConns = entry.payload.ActiveConns

			snap.TotalUpBps += item.UpBps
			snap.TotalDownBps += item.DownBps
			snap.ProxyUpBps += item.ProxyUpBps
			snap.ProxyDownBps += item.ProxyDownBps
			snap.DirectUpBps += item.DirectUpBps
			snap.DirectDownBps += item.DirectDownBps
			snap.ActiveConns += item.ActiveConns

			for _, ac := range entry.payload.TopActive {
				ac.DeviceID = d.ID
				ac.DeviceName = d.Name
				snap.TopActive = append(snap.TopActive, ac)
			}
		}
		if item.Online {
			snap.OnlineDevices++
		}
		snap.Devices = append(snap.Devices, item)
	}

	sort.Slice(snap.TopActive, func(i, j int) bool {
		ri := snap.TopActive[i].UpBps + snap.TopActive[i].DownBps
		rj := snap.TopActive[j].UpBps + snap.TopActive[j].DownBps
		if ri == rj {
			return snap.TopActive[i].TotalBytes > snap.TopActive[j].TotalBytes
		}
		return ri > rj
	})
	if len(snap.TopActive) > 25 {
		snap.TopActive = snap.TopActive[:25]
	}

	return snap, nil
}

func (h *Hub) broadcastOnce(ctx context.Context) {
	h.mu.RLock()
	hasClients := len(h.clients) > 0
	h.mu.RUnlock()
	if !hasClients {
		return
	}

	snap, err := h.BuildSnapshot(ctx)
	if err != nil {
		return
	}
	payload, err := json.Marshal(snap)
	if err != nil {
		return
	}

	h.mu.RLock()
	for c := range h.clients {
		select {
		case c.send <- payload:
		default:
			// Slow consumer drops frame cleanly
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) closeAll() {
	h.mu.Lock()
	for c := range h.clients {
		delete(h.clients, c)
		close(c.send)
		_ = c.conn.Close()
	}
	h.mu.Unlock()
}
