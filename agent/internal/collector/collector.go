package collector

import (
	"runtime"
	"sort"
	"sync"
	"time"

	"clash-lens/agent/internal/mihomo"
	"clash-lens/agent/internal/normalizer"
	"clash-lens/pkg/privacy"
	"clash-lens/pkg/protocol"
	"github.com/google/uuid"
)

type connCounter struct {
	upload   int64
	download int64
}

type flowKey struct {
	processName string
	rootDomain  string
	host        string
	egressNode  string
	routeType   string
	inboundMode string
}

type bucketAccumulator struct {
	totals protocol.MinuteTotalRecord
	flows  map[flowKey]*protocol.FlowRecord
}

// LiveSnapshot summarizes instantaneous rates and active top connections for live push & tray display.
type LiveSnapshot struct {
	Payload         protocol.LivePushRequest
	TodayProxyBytes int64
	TodayTotalBytes int64
}

// Collector consumes 1-second Mihomo snapshots, computes exact deltas, aggregates minute buckets, and tracks live rates.
type Collector struct {
	mu sync.Mutex

	seeded        bool
	prevConns     map[string]connCounter
	prevTotalUp   int64
	prevTotalDown int64
	lastTickAt    time.Time

	currentBucketTS int64
	current         *bucketAccumulator
	pendingTotals   []protocol.MinuteTotalRecord
	pendingFlows    []protocol.FlowRecord

	meta         protocol.DeviceRuntimeMeta
	live         protocol.LivePushRequest
	todayDay     string
	todayProxy   int64
	todayTotal   int64
	sanitizeMode string
}

// New constructs a Collector initialized for the host OS.
func New() *Collector {
	return &Collector{
		prevConns: make(map[string]connCounter),
		meta: protocol.DeviceRuntimeMeta{
			OS: runtime.GOOS,
		},
		todayDay:     time.Now().Format("2006-01-02"),
		sanitizeMode: privacy.ModeMask,
	}
}

// SetSanitizeMode configures rule/path privacy sanitization mode (mask | strict | off).
func (c *Collector) SetSanitizeMode(mode string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sanitizeMode = privacy.NormalizeMode(mode)
}

// ResetSeed clears baseline tracking upon Mihomo disconnect/reconnect so the first tick after reconnect won't spike.
func (c *Collector) ResetSeed() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.seeded = false
	c.prevConns = make(map[string]connCounter)
	c.prevTotalUp = 0
	c.prevTotalDown = 0
	c.live.UpBps = 0
	c.live.DownBps = 0
	c.live.ProxyUpBps = 0
	c.live.ProxyDownBps = 0
	c.live.DirectUpBps = 0
	c.live.DirectDownBps = 0
	c.live.ActiveConns = 0
	c.live.TopActive = nil
}

// SetRuntimeMeta updates Mihomo version and TUN/Sniffer/FindProcess configuration metadata.
func (c *Collector) SetRuntimeMeta(ver mihomo.VersionResp, cfg mihomo.ConfigsResp) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.meta.OS = runtime.GOOS
	if ver.Version != "" {
		c.meta.MihomoVersion = ver.Version
	}
	c.meta.TunEnabled = cfg.Tun.Enable
	c.meta.SnifferEnabled = cfg.Sniffing
	c.meta.FindProcessMode = cfg.FindProcessMode
	c.meta.Mode = cfg.Mode
	if cfg.Tun.Enable {
		c.meta.InboundMode = protocol.InboundTUN
	} else {
		c.meta.InboundMode = protocol.InboundProxyPort
	}
}

// ProcessSnapshot ingests one Mihomo /connections snapshot at timestamp now.
func (c *Collector) ProcessSnapshot(snap mihomo.ConnectionsSnapshot, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()

	dayStr := now.Format("2006-01-02")
	if dayStr != c.todayDay {
		c.todayDay = dayStr
		c.todayProxy = 0
		c.todayTotal = 0
	}

	nextConns := make(map[string]connCounter, len(snap.Connections))
	for _, conn := range snap.Connections {
		nextConns[conn.ID] = connCounter{
			upload:   conn.Upload,
			download: conn.Download,
		}
	}

	// First tick after startup or reconnect: establish baseline without emitting existing session totals.
	if !c.seeded {
		c.seeded = true
		c.prevConns = nextConns
		c.prevTotalUp = snap.UploadTotal
		c.prevTotalDown = snap.DownloadTotal
		c.lastTickAt = now
		c.live.Timestamp = now.Unix()
		c.live.ActiveConns = len(snap.Connections)
		c.live.DeviceMeta = c.meta
		return
	}

	dtSec := now.Sub(c.lastTickAt).Seconds()
	if dtSec < 0.25 {
		dtSec = 1.0
	}
	c.lastTickAt = now

	// Detect Mihomo core restart (global total dropped) -> re-seed cleanly without emitting negative/bogus numbers.
	if snap.UploadTotal < c.prevTotalUp || snap.DownloadTotal < c.prevTotalDown {
		c.prevConns = nextConns
		c.prevTotalUp = snap.UploadTotal
		c.prevTotalDown = snap.DownloadTotal
		return
	}

	unixNow := now.Unix()
	bucketTS := unixNow - (unixNow % 60)
	if c.current != nil && c.currentBucketTS != bucketTS {
		c.moveCurrentToPendingLocked()
	}
	if c.current == nil {
		c.currentBucketTS = bucketTS
		c.current = &bucketAccumulator{
			totals: protocol.MinuteTotalRecord{BucketTS: bucketTS},
			flows:  make(map[flowKey]*protocol.FlowRecord),
		}
	}

	var sumConnUp, sumConnDown int64
	var proxyUpTick, proxyDownTick, directUpTick, directDownTick int64
	topActive := make([]protocol.LiveConnectionItem, 0, len(snap.Connections))

	for _, conn := range snap.Connections {
		prev, existed := c.prevConns[conn.ID]
		var dUp, dDown int64
		if !existed {
			dUp = max0(conn.Upload)
			dDown = max0(conn.Download)
		} else {
			if conn.Upload >= prev.upload {
				dUp = conn.Upload - prev.upload
			}
			if conn.Download >= prev.download {
				dDown = conn.Download - prev.download
			}
		}

		norm := normalizer.NormalizeConnectionWithOptions(conn, normalizer.Options{
			SanitizeMode: c.sanitizeMode,
		})

		if dUp > 0 || dDown > 0 {
			sumConnUp += dUp
			sumConnDown += dDown
			tot := dUp + dDown

			switch norm.RouteType {
			case protocol.RouteProxy:
				c.current.totals.ProxyUp += dUp
				c.current.totals.ProxyDown += dDown
				proxyUpTick += dUp
				proxyDownTick += dDown
				c.todayProxy += tot
			case protocol.RouteReject:
				c.current.totals.RejectBytes += tot
			default:
				c.current.totals.DirectUp += dUp
				c.current.totals.DirectDown += dDown
				directUpTick += dUp
				directDownTick += dDown
			}
			c.todayTotal += tot

			if norm.InboundMode == protocol.InboundTUN {
				c.current.totals.TunBytes += tot
			} else if norm.InboundMode == protocol.InboundProxyPort {
				c.current.totals.ProxyPortBytes += tot
			}

			fk := flowKey{
				processName: norm.ProcessName,
				rootDomain:  norm.RootDomain,
				host:        norm.Host,
				egressNode:  norm.EgressNode,
				routeType:   norm.RouteType,
				inboundMode: norm.InboundMode,
			}
			rec, ok := c.current.flows[fk]
			if !ok {
				rec = &protocol.FlowRecord{
					BucketTS:       bucketTS,
					ProcessName:    norm.ProcessName,
					ProcessPath:    norm.ProcessPath,
					ProcessDisplay: norm.ProcessDisplay,
					RootDomain:     norm.RootDomain,
					ServiceTag:     norm.ServiceTag,
					Host:           norm.Host,
					EgressNode:     norm.EgressNode,
					ProxyGroup:     norm.ProxyGroup,
					RouteType:      norm.RouteType,
					InboundMode:    norm.InboundMode,
					Rule:           norm.Rule,
				}
				c.current.flows[fk] = rec
			}
			rec.UpBytes += dUp
			rec.DownBytes += dDown
			if !existed {
				rec.ConnCount++
				c.current.totals.ConnCount++
			} else if rec.ConnCount == 0 {
				rec.ConnCount = 1
			}
		} else if !existed {
			c.current.totals.ConnCount++
		}

		upBps := int64(float64(dUp) / dtSec)
		downBps := int64(float64(dDown) / dtSec)
		if upBps > 0 || downBps > 0 || (conn.Upload+conn.Download) >= 64*1024 {
			topActive = append(topActive, protocol.LiveConnectionItem{
				ProcessDisplay: norm.ProcessDisplay,
				RootDomain:     norm.RootDomain,
				ServiceTag:     norm.ServiceTag,
				Host:           norm.Host,
				EgressNode:     norm.EgressNode,
				RouteType:      norm.RouteType,
				InboundMode:    norm.InboundMode,
				Rule:           norm.Rule,
				UpBps:          upBps,
				DownBps:        downBps,
				TotalBytes:     conn.Upload + conn.Download,
			})
		}
	}

	// Reconcile short-lived connections closed between 1s ticks via global totals.
	globalUpDelta := snap.UploadTotal - c.prevTotalUp
	globalDownDelta := snap.DownloadTotal - c.prevTotalDown
	if globalUpDelta > sumConnUp {
		gap := globalUpDelta - sumConnUp
		c.current.totals.UnattributedUp += gap
		c.todayTotal += gap
	}
	if globalDownDelta > sumConnDown {
		gap := globalDownDelta - sumConnDown
		c.current.totals.UnattributedDown += gap
		c.todayTotal += gap
	}

	c.prevConns = nextConns
	c.prevTotalUp = snap.UploadTotal
	c.prevTotalDown = snap.DownloadTotal

	// Build live telemetry snapshot
	sort.Slice(topActive, func(i, j int) bool {
		ri := topActive[i].UpBps + topActive[i].DownBps
		rj := topActive[j].UpBps + topActive[j].DownBps
		if ri == rj {
			return topActive[i].TotalBytes > topActive[j].TotalBytes
		}
		return ri > rj
	})
	if len(topActive) > 15 {
		topActive = topActive[:15]
	}

	totalUpBps := int64(float64(max0(globalUpDelta)) / dtSec)
	totalDownBps := int64(float64(max0(globalDownDelta)) / dtSec)
	if totalUpBps == 0 {
		totalUpBps = int64(float64(sumConnUp) / dtSec)
	}
	if totalDownBps == 0 {
		totalDownBps = int64(float64(sumConnDown) / dtSec)
	}

	c.live = protocol.LivePushRequest{
		Timestamp:     unixNow,
		UpBps:         totalUpBps,
		DownBps:       totalDownBps,
		ProxyUpBps:    int64(float64(proxyUpTick) / dtSec),
		ProxyDownBps:  int64(float64(proxyDownTick) / dtSec),
		DirectUpBps:   int64(float64(directUpTick) / dtSec),
		DirectDownBps: int64(float64(directDownTick) / dtSec),
		ActiveConns:   len(snap.Connections),
		DeviceMeta:    c.meta,
		TopActive:     topActive,
	}
}

// FlushCompleted returns finalized buckets (those older than current minute, or including current if force=true) as an IngestBatchRequest.
// Returns ok=false if nothing has traffic to report.
func (c *Collector) FlushCompleted(forceCurrent bool) (protocol.IngestBatchRequest, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if forceCurrent && c.current != nil {
		c.moveCurrentToPendingLocked()
	}

	if len(c.pendingTotals) == 0 && len(c.pendingFlows) == 0 {
		return protocol.IngestBatchRequest{}, false
	}

	batch := protocol.IngestBatchRequest{
		BatchID:      uuid.NewString(),
		DeviceMeta:   c.meta,
		MinuteTotals: c.pendingTotals,
		MinuteFlows:  c.pendingFlows,
	}
	c.pendingTotals = nil
	c.pendingFlows = nil
	return batch, true
}

// SnapshotLive returns the latest 1s-derived live stats and session today totals.
func (c *Collector) SnapshotLive() LiveSnapshot {
	c.mu.Lock()
	defer c.mu.Unlock()
	return LiveSnapshot{
		Payload:         c.live,
		TodayProxyBytes: c.todayProxy,
		TodayTotalBytes: c.todayTotal,
	}
}

func (c *Collector) moveCurrentToPendingLocked() {
	if c.current == nil {
		return
	}
	t := c.current.totals
	hasTraffic := t.ProxyUp > 0 || t.ProxyDown > 0 || t.DirectUp > 0 || t.DirectDown > 0 ||
		t.RejectBytes > 0 || t.UnattributedUp > 0 || t.UnattributedDown > 0 || t.ConnCount > 0
	if hasTraffic {
		c.pendingTotals = append(c.pendingTotals, t)
	}
	for _, fl := range c.current.flows {
		if fl.UpBytes > 0 || fl.DownBytes > 0 {
			c.pendingFlows = append(c.pendingFlows, *fl)
		}
	}
	c.current = nil
}

func max0(v int64) int64 {
	if v < 0 {
		return 0
	}
	return v
}
