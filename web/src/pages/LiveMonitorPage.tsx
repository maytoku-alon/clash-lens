import { useEffect, useMemo, useRef, useState } from 'react'
import type * as echarts from 'echarts'
import { Activity, Check, Copy, ExternalLink, Lock, Pause, Play, Search, ShieldAlert, TrendingUp, Wifi, X } from 'lucide-react'
import { EChartBox } from '../components/EChartBox'
import { buildChartTheme, buildSpeedValueAxis } from '../theme/chartAdapter'
import { useTheme } from '../theme/ThemeProvider'
import type { LiveConnectionItem, LiveHubSnapshot } from '../types/api'
import { formatBytes, formatRelativeTime, formatSpeed } from '../utils/format'
import { maskHostOrDomain, maskRuleText } from '../utils/privacy'

interface LiveMonitorPageProps {
  live: LiveHubSnapshot | null
  rateHistory: { time: string; down: number; up: number }[]
  onOpenApp: (processDisplay: string) => void
}

const STICKY_TTL_MS = 8000
const EMA_ALPHA = 0.45
const HYSTERESIS_RATIO = 1.15

type ConnSortMode = 'total' | 'speed'

interface StickyProcRow {
  process: string
  downBps: number
  upBps: number
  totalBps: number
  emaBps: number
  conns: number
  lastSeenAt: number
  idle: boolean
}

interface StickyConnRow extends LiveConnectionItem {
  key: string
  connCount: number
  lastSeenAt: number
  idle: boolean
  emaBps: number
}

function connStableKey(c: LiveConnectionItem): string {
  return `${c.device_id || ''}|${c.process_display}|${c.host}|${c.egress_node}|${c.route_type}|${c.inbound_mode}`
}

function sortWithHysteresis<T extends { idle: boolean; emaBps: number }>(
  prevKeys: string[],
  itemsByKey: Map<string, T>,
  getKey: (item: T) => string,
): T[] {
  const ordered: T[] = []
  const seen = new Set<string>()
  for (const k of prevKeys) {
    const item = itemsByKey.get(k)
    if (item) {
      ordered.push(item)
      seen.add(k)
    }
  }

  // Promote lower entries only if incumbent went idle or challenger exceeds by HYSTERESIS_RATIO
  for (let i = 1; i < ordered.length; i++) {
    let j = i
    while (j > 0) {
      const challenger = ordered[j]
      const incumbent = ordered[j - 1]
      const canPromote =
        !challenger.idle &&
        (incumbent.idle || challenger.emaBps > incumbent.emaBps * HYSTERESIS_RATIO)
      if (!canPromote) break
      ordered[j - 1] = challenger
      ordered[j] = incumbent
      j--
    }
  }

  const fresh: T[] = []
  for (const item of itemsByKey.values()) {
    if (!seen.has(getKey(item))) {
      fresh.push(item)
    }
  }
  fresh.sort((a, b) => Number(a.idle) - Number(b.idle) || b.emaBps - a.emaBps)

  // Splice fresh active rows into ranked list while keeping existing relative slots calm
  const combined = [...ordered, ...fresh]
  for (let i = ordered.length; i < combined.length; i++) {
    let j = i
    while (j > 0) {
      const cur = combined[j]
      const prev = combined[j - 1]
      const shouldMoveUp = !cur.idle && (prev.idle || cur.emaBps > prev.emaBps * HYSTERESIS_RATIO)
      if (!shouldMoveUp) break
      combined[j - 1] = cur
      combined[j] = prev
      j--
    }
  }
  return combined
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fallback below
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.readOnly = true
  ta.style.position = 'fixed'
  ta.style.top = '-9999px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  } finally {
    document.body.removeChild(ta)
  }
  return ok
}

export function LiveMonitorPage({
  live,
  rateHistory,
  onOpenApp,
}: LiveMonitorPageProps) {
  const { theme, tokens, colorMode, privacyMode } = useTheme()
  const chartTheme = useMemo(
    () => buildChartTheme(tokens, colorMode, theme.chartEffects),
    [tokens, colorMode, theme.chartEffects],
  )

  const [paused, setPaused] = useState(false)
  const [sortMode, setSortMode] = useState<ConnSortMode>('total')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedRowKey, setCopiedRowKey] = useState('')

  // Anti-jitter state for Top 5 Active Processes
  const [procRows, setProcRows] = useState<StickyProcRow[]>([])
  const [procHoverLocked, setProcHoverLocked] = useState(false)
  const procLockedOrderRef = useRef<string[]>([])
  const procHoverRef = useRef(false)

  // Anti-jitter state for Top 25 Connections Table
  const [connRows, setConnRows] = useState<StickyConnRow[]>([])
  const [tableHoverLocked, setTableHoverLocked] = useState(false)
  const [pendingNewCount, setPendingNewCount] = useState(0)
  const tableLockedOrderRef = useRef<string[]>([])
  const tableHoverRef = useRef(false)

  // Sync Top 5 Active Processes with EMA smoothing + 8s TTL + 15% rank hysteresis
  useEffect(() => {
    if (paused) return
    const now = Date.now()
    const source = live?.top_active ?? []

    const incoming = new Map<string, { downBps: number; upBps: number; totalBps: number; conns: number }>()
    for (const c of source) {
      const key = c.process_display || '未知进程'
      const cur = incoming.get(key) ?? { downBps: 0, upBps: 0, totalBps: 0, conns: 0 }
      cur.downBps += c.down_bps
      cur.upBps += c.up_bps
      cur.totalBps += c.down_bps + c.up_bps
      cur.conns += 1
      incoming.set(key, cur)
    }

    setProcRows((prev) => {
      const merged = new Map<string, StickyProcRow>()
      const lockedSet = procHoverRef.current ? new Set(procLockedOrderRef.current) : null

      for (const old of prev) {
        const cur = incoming.get(old.process)
        if (cur) {
          const nextEma = old.emaBps * (1 - EMA_ALPHA) + cur.totalBps * EMA_ALPHA
          merged.set(old.process, {
            process: old.process,
            downBps: cur.downBps,
            upBps: cur.upBps,
            totalBps: cur.totalBps,
            emaBps: nextEma < 64 && cur.totalBps === 0 ? 0 : nextEma,
            conns: cur.conns,
            lastSeenAt: now,
            idle: false,
          })
        } else if (lockedSet?.has(old.process) || now - old.lastSeenAt < STICKY_TTL_MS) {
          const decayed = old.emaBps * 0.5
          merged.set(old.process, {
            ...old,
            downBps: 0,
            upBps: 0,
            totalBps: 0,
            emaBps: decayed < 64 ? 0 : decayed,
            conns: 0,
            idle: true,
          })
        }
      }

      if (lockedSet && procLockedOrderRef.current.length > 0) {
        return procLockedOrderRef.current
          .map((key) => merged.get(key))
          .filter((r): r is StickyProcRow => Boolean(r))
      }

      for (const [proc, cur] of incoming.entries()) {
        if (!merged.has(proc)) {
          merged.set(proc, {
            process: proc,
            downBps: cur.downBps,
            upBps: cur.upBps,
            totalBps: cur.totalBps,
            emaBps: cur.totalBps,
            conns: cur.conns,
            lastSeenAt: now,
            idle: false,
          })
        }
      }

      const prevOrder = prev.map((r) => r.process)
      return sortWithHysteresis(prevOrder, merged, (r) => r.process).slice(0, 5)
    })
  }, [live?.top_active, live?.timestamp, paused])

  // Sync Top 25 Connections Table with aggregation + 8s TTL + hover lock + sort mode
  useEffect(() => {
    if (paused) return
    const now = Date.now()
    const source = live?.top_active ?? []

    // Merge duplicate live connections sharing the same (device, process, host, egress, route, inbound)
    const incoming = new Map<string, LiveConnectionItem & { connCount: number }>()
    for (const c of source) {
      const key = connStableKey(c)
      const prevAgg = incoming.get(key)
      if (!prevAgg) {
        incoming.set(key, { ...c, connCount: 1 })
      } else {
        prevAgg.down_bps += c.down_bps
        prevAgg.up_bps += c.up_bps
        prevAgg.total_bytes += c.total_bytes
        prevAgg.connCount += 1
        if (c.service_tag && !prevAgg.service_tag) {
          prevAgg.service_tag = c.service_tag
        }
      }
    }

    const locked = tableHoverRef.current && tableLockedOrderRef.current.length > 0
    if (locked) {
      const lockedSet = new Set(tableLockedOrderRef.current)
      let waiting = 0
      for (const key of incoming.keys()) {
        if (!lockedSet.has(key)) waiting++
      }
      setPendingNewCount(waiting)
    } else {
      setPendingNewCount(0)
    }

    setConnRows((prev) => {
      const merged = new Map<string, StickyConnRow>()
      const lockedSet = locked ? new Set(tableLockedOrderRef.current) : null

      for (const old of prev) {
        const cur = incoming.get(old.key)
        if (cur) {
          const speed = cur.down_bps + cur.up_bps
          merged.set(old.key, {
            ...cur,
            key: old.key,
            connCount: cur.connCount,
            lastSeenAt: now,
            idle: false,
            emaBps: old.emaBps * (1 - EMA_ALPHA) + speed * EMA_ALPHA,
          })
        } else if (lockedSet?.has(old.key) || now - old.lastSeenAt < STICKY_TTL_MS) {
          merged.set(old.key, {
            ...old,
            down_bps: 0,
            up_bps: 0,
            idle: true,
            emaBps: old.emaBps * 0.5,
          })
        }
      }

      if (locked) {
        return tableLockedOrderRef.current
          .map((k) => merged.get(k))
          .filter((r): r is StickyConnRow => Boolean(r))
      }

      for (const [key, cur] of incoming.entries()) {
        if (!merged.has(key)) {
          const speed = cur.down_bps + cur.up_bps
          merged.set(key, {
            ...cur,
            key,
            connCount: cur.connCount,
            lastSeenAt: now,
            idle: false,
            emaBps: speed,
          })
        }
      }

      if (sortMode === 'total') {
        const rows = Array.from(merged.values())
        rows.sort((a, b) => b.total_bytes - a.total_bytes || a.key.localeCompare(b.key))
        return rows.slice(0, 25)
      }

      const prevOrder = prev.map((r) => r.key)
      return sortWithHysteresis(prevOrder, merged, (r) => r.key).slice(0, 25)
    })
  }, [live?.top_active, live?.timestamp, paused, sortMode, tableHoverLocked])

  const handleProcMouseEnter = () => {
    if (procRows.length === 0) return
    procLockedOrderRef.current = procRows.map((r) => r.process)
    procHoverRef.current = true
    setProcHoverLocked(true)
  }

  const handleProcMouseLeave = () => {
    procHoverRef.current = false
    setProcHoverLocked(false)
  }

  const handleTableMouseEnter = () => {
    if (connRows.length === 0) return
    tableLockedOrderRef.current = connRows.map((r) => r.key)
    tableHoverRef.current = true
    setTableHoverLocked(true)
  }

  const handleTableMouseLeave = () => {
    tableHoverRef.current = false
    setPendingNewCount(0)
    setTableHoverLocked(false)
  }

  const handleTogglePause = () => {
    setPaused((prev) => !prev)
  }

  const filteredConnections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return connRows
    return connRows.filter((c) =>
      [c.device_name, c.device_id, c.process_display, c.host, c.root_domain, c.service_tag, c.egress_node, c.rule]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [connRows, searchQuery])

  const handleCopyHost = async (rowKey: string, host: string) => {
    const ok = await copyToClipboard(host)
    if (ok) {
      setCopiedRowKey(rowKey)
      setTimeout(() => setCopiedRowKey((prev) => (prev === rowKey ? '' : prev)), 1600)
    }
  }

  const maxProcLiveBps = useMemo(() => {
    let maxVal = 4096
    for (const r of procRows) {
      if (r.totalBps > maxVal) maxVal = r.totalBps
    }
    return maxVal
  }, [procRows])

  const chartOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = rateHistory.length > 0 ? rateHistory : [{ time: '--:--:--', down: 0, up: 0 }]
    let peakSpeed = 0
    for (const p of pts) {
      if (p.down > peakSpeed) peakSpeed = p.down
      if (p.up > peakSpeed) peakSpeed = p.up
    }

    return {
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: chartTheme.tooltip.backgroundColor,
        borderColor: chartTheme.tooltip.borderColor,
        textStyle: chartTheme.tooltip.textStyle,
        valueFormatter: (v: unknown) => formatSpeed(Number(v)),
      },
      legend: {
        top: 0,
        textStyle: chartTheme.legendTextStyle,
      },
      grid: { top: 32, left: 66, right: 18, bottom: 24 },
      xAxis: {
        type: 'category',
        data: pts.map((p) => p.time),
        axisLabel: { color: chartTheme.axisLabelColor, fontSize: 10 },
        axisLine: chartTheme.axisLine,
      },
      yAxis: buildSpeedValueAxis(peakSpeed, chartTheme, 10),
      series: [
        {
          name: '下行速率',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: chartTheme.liveLineStyle('down', 2.2),
          areaStyle: { color: chartTheme.liveColors.downArea },
          data: pts.map((p) => p.down),
        },
        {
          name: '上行速率',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: chartTheme.liveLineStyle('up', 2),
          areaStyle: { color: chartTheme.liveColors.upArea },
          data: pts.map((p) => p.up),
        },
      ],
    }
  }, [rateHistory, chartTheme])

  return (
    <div className="space-y-4">
      {/* Summary Strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="cl-card rounded-xl p-4">
          <div className="text-xs text-[var(--cl-text-muted)]">全网实时下行</div>
          <div
            className="mt-1.5 font-mono text-2xl font-bold tabular-nums"
            style={{ color: chartTheme.liveColors.down }}
          >
            ↓ {formatSpeed(live?.total_down_bps)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--cl-text-muted)] tabular-nums">
            代理 {formatSpeed(live?.proxy_down_bps)} · 直连 {formatSpeed(live?.direct_down_bps)}
          </div>
        </div>
        <div className="cl-card rounded-xl p-4">
          <div className="text-xs text-[var(--cl-text-muted)]">全网实时上行</div>
          <div
            className="mt-1.5 font-mono text-2xl font-bold tabular-nums"
            style={{ color: chartTheme.liveColors.up }}
          >
            ↑ {formatSpeed(live?.total_up_bps)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--cl-text-muted)] tabular-nums">
            代理 {formatSpeed(live?.proxy_up_bps)} · 直连 {formatSpeed(live?.direct_up_bps)}
          </div>
        </div>
        <div className="cl-card rounded-xl p-4">
          <div className="text-xs text-[var(--cl-text-muted)]">活跃连接总数</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums">
            {live?.active_conns ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-[var(--cl-text-muted)]">每 2 秒 WebSocket 自动推送</div>
        </div>
        <div className="cl-card rounded-xl p-4">
          <div className="text-xs text-[var(--cl-text-muted)]">在线采集设备</div>
          <div
            className="mt-1.5 font-mono text-2xl font-bold tabular-nums"
            style={{ color: 'var(--cl-status-success)' }}
          >
            {live?.online_devices ?? 0} / {live?.devices?.length ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-[var(--cl-text-muted)]">支持离线自动缓冲补传</div>
        </div>
      </div>

      {/* Live Chart */}
      <div className="cl-card rounded-xl p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2">
          <Activity className="h-4 w-4" style={{ color: 'var(--cl-accent-primary)' }} />
          <h2 className="text-sm font-semibold">实时速率曲线（最近 60 个采样点）</h2>
        </div>
        <EChartBox option={chartOption} className="h-[240px] w-full" />
      </div>

      {/* Device live cards + Active Process Top 5 (hover-locked & damped against jitter) */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
          {(live?.devices ?? []).length === 0 ? (
            <div className="cl-card flex items-center justify-center rounded-xl p-6 text-xs text-[var(--cl-text-muted)] sm:col-span-2">
              暂无在线设备推送实时状态
            </div>
          ) : (
            (live?.devices ?? []).map((d) => (
              <div key={d.device_id} className="cl-card flex flex-col justify-between rounded-xl p-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: d.online ? 'var(--cl-status-success)' : 'var(--cl-text-muted)',
                        }}
                      />
                      <span className="text-sm font-semibold">{d.device_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {d.dashboard_url && (
                        <a
                          href={d.dashboard_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition hover:opacity-90"
                          style={{
                            backgroundColor: 'var(--cl-accent-soft)',
                            color: 'var(--cl-accent-primary)',
                          }}
                          title="打开原生 Clash 管理面板"
                        >
                          面板
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                      {d.tun_enabled && (
                        <span
                          className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                          style={{
                            backgroundColor: 'var(--cl-accent-soft)',
                            color: 'var(--cl-accent-primary)',
                          }}
                        >
                          TUN
                        </span>
                      )}
                      {d.tun_enabled && !d.sniffer_enabled && (
                        <span title="TUN 开启但域名嗅探未开启">
                          <ShieldAlert className="h-3.5 w-3.5" style={{ color: 'var(--cl-status-warning)' }} />
                        </span>
                      )}
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[10px] text-[var(--cl-text-muted)]"
                        style={{ backgroundColor: 'var(--cl-bg-surface-hover)' }}
                      >
                        {d.mihomo_version || d.os}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between gap-2 font-mono tabular-nums">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block w-[92px] whitespace-nowrap text-sm font-bold"
                        style={{ color: chartTheme.liveColors.down }}
                      >
                        ↓ {formatSpeed(d.down_bps)}
                      </span>
                      <span
                        className="inline-block w-[92px] whitespace-nowrap text-xs"
                        style={{ color: chartTheme.liveColors.up }}
                      >
                        ↑ {formatSpeed(d.up_bps)}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--cl-text-muted)]">{d.active_conns} 连接</span>
                  </div>
                </div>
                <div className="mt-3 flex justify-between text-[11px] text-[var(--cl-text-muted)]">
                  <span>进程识别: {d.find_process_mode || '未知'}</span>
                  <span>心跳: {formatRelativeTime(d.last_seen_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div
          data-testid="live-top-processes-card"
          className="cl-card flex h-[338px] flex-col overflow-hidden rounded-xl p-4 lg:col-span-5"
          onMouseEnter={handleProcMouseEnter}
          onMouseLeave={handleProcMouseLeave}
        >
          <div className="mb-3 flex h-6 shrink-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <TrendingUp className="h-4 w-4 shrink-0" style={{ color: 'var(--cl-accent-primary)' }} />
              <h3 className="truncate text-sm font-semibold">当前活跃进程实时速率 Top 5</h3>
              <span
                data-testid="proc-hover-lock-badge"
                aria-hidden={!(procHoverLocked && !paused)}
                className={`inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 font-mono text-[10px] leading-none transition-opacity duration-150 ${
                  procHoverLocked && !paused ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
                style={{
                  backgroundColor: 'var(--cl-accent-soft)',
                  color: 'var(--cl-accent-primary)',
                }}
              >
                <Lock className="h-2.5 w-2.5" />
                悬停已锁定
              </span>
            </div>
            <span className="shrink-0 font-mono text-[10px] text-[var(--cl-text-muted)]">阻尼排序 · 防抖驻留</span>
          </div>
          {procRows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-6 text-center text-xs text-[var(--cl-text-muted)]">
              当前暂无活跃吞吐进程
            </div>
          ) : (
            <div className="cl-list-stack space-y-2">
              {procRows.map((p) => {
                const pct =
                  p.idle || p.totalBps <= 0
                    ? 0
                    : Math.max(4, Math.min(100, Math.round((p.totalBps / maxProcLiveBps) * 100)))
                return (
                  <button
                    type="button"
                    key={p.process}
                    data-testid="live-proc-row"
                    onClick={() => onOpenApp(p.process)}
                    className={`cl-list-item flex h-[46px] w-full cursor-pointer flex-col justify-center rounded-lg border px-3 py-1.5 text-left transition-[opacity,background-color] duration-300 hover:bg-[var(--cl-bg-surface-hover)] ${
                      p.idle ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold">{p.process}</span>
                        <span className="shrink-0 font-mono text-[10px] text-[var(--cl-text-muted)]">
                          {p.idle ? '空闲保留' : `${p.conns} 连接`}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums">
                        <span
                          className="inline-block w-[76px] whitespace-nowrap text-right"
                          style={{ color: chartTheme.liveColors.down }}
                        >
                          ↓{formatSpeed(p.downBps)}
                        </span>
                        <span
                          className="inline-block w-[76px] whitespace-nowrap text-right"
                          style={{ color: chartTheme.liveColors.up }}
                        >
                          ↑{formatSpeed(p.upBps)}
                        </span>
                      </div>
                    </div>
                    <div
                      className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: 'var(--cl-border-subtle)' }}
                    >
                      <div
                        className="cl-progress-fill h-full rounded-full transition-[width] duration-300 ease-out"
                        style={{ width: `${pct}%`, backgroundColor: chartTheme.liveColors.down }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Live Top Active Connections (Sticky TTL + Hover-to-Freeze + Fixed Scroll Container) */}
      <div data-testid="live-top-conns-card" className="cl-card overflow-hidden rounded-xl">
        <div
          className="flex min-h-[48px] flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5"
          style={{ borderColor: 'var(--cl-border-subtle)' }}
        >
          <div className="flex h-6 flex-wrap items-center gap-2">
            <Wifi className="h-4 w-4" style={{ color: 'var(--cl-accent-primary)' }} />
            <h3 className="text-sm font-semibold">当前活跃高吞吐连接 Top 25</h3>
            {paused ? (
              <span
                className="inline-flex h-5 items-center rounded px-1.5 font-mono text-[10px] leading-none"
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.14)',
                  color: 'var(--cl-status-warning)',
                }}
              >
                列表已冻结（后台曲线仍持续更新）
              </span>
            ) : tableHoverLocked ? (
              <span
                data-testid="table-hover-lock-badge"
                className="inline-flex h-5 items-center gap-1 rounded px-1.5 font-mono text-[10px] leading-none"
                style={{
                  backgroundColor: 'var(--cl-accent-soft)',
                  color: 'var(--cl-accent-primary)',
                }}
              >
                <Lock className="h-2.5 w-2.5" />
                悬停已锁定顺序{pendingNewCount > 0 ? ` · 待合入 +${pendingNewCount}` : ''}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="cl-segment" title="切换连接排行排序依据">
              <button
                type="button"
                data-testid="conn-sort-total"
                onClick={() => setSortMode('total')}
                className={`cl-segment-item ${sortMode === 'total' ? 'cl-segment-item-active' : ''}`}
              >
                按累计
              </button>
              <button
                type="button"
                data-testid="conn-sort-speed"
                onClick={() => setSortMode('speed')}
                className={`cl-segment-item ${sortMode === 'speed' ? 'cl-segment-item-active' : ''}`}
              >
                按速率
              </button>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--cl-text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="筛选进程 / 域名 / IP / 节点..."
                className="cl-input !h-7 w-56 pl-8 pr-7 text-[11px]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--cl-text-muted)] hover:text-[var(--cl-text-primary)]"
                  title="清除筛选"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleTogglePause}
              className={paused ? 'cl-btn-accent !h-7' : 'cl-btn-secondary !h-7'}
              title={paused ? '恢复每秒实时更新连接列表' : '暂停连接列表刷新以便选中与复制'}
            >
              {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {paused ? '恢复刷新' : '暂停刷新'}
            </button>
          </div>
        </div>
        <div
          data-testid="live-connections-scroll"
          className="cl-thin-scroll h-[460px] overflow-x-auto overflow-y-auto"
          onMouseEnter={handleTableMouseEnter}
          onMouseLeave={handleTableMouseLeave}
        >
          <table className="w-full min-w-[840px] table-fixed text-left text-xs">
            <thead
              className="sticky top-0 z-10 border-b bg-[var(--cl-bg-sidebar)] text-[var(--cl-text-muted)]"
              style={{ borderColor: 'var(--cl-border-subtle)' }}
            >
              <tr>
                <th className="w-[112px] px-4 py-2 font-medium">设备</th>
                <th className="w-[132px] px-4 py-2 font-medium">应用进程</th>
                <th className="px-4 py-2 font-medium">域名 / 主机</th>
                <th className="w-[136px] px-4 py-2 font-medium">出口节点</th>
                <th className="w-[94px] px-4 py-2 font-medium">入口</th>
                <th className="w-[98px] px-4 py-2 text-right font-medium">实时下行</th>
                <th className="w-[98px] px-4 py-2 text-right font-medium">实时上行</th>
                <th className="w-[98px] px-4 py-2 text-right font-medium">连接累计</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cl-border-subtle)]">
              {filteredConnections.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[var(--cl-text-muted)]">
                    {searchQuery.trim()
                      ? '没有匹配当前搜索关键词的活跃连接'
                      : '当前暂无活跃高吞吐连接（等待设备实时推送）'}
                  </td>
                </tr>
              ) : (
                filteredConnections.map((c) => {
                  const rowKey = c.key
                  const displayHost = maskHostOrDomain(c.host, privacyMode)
                  return (
                    <tr
                      key={rowKey}
                      data-testid="live-conn-row"
                      data-row-key={rowKey}
                      className={`h-9 transition-opacity duration-300 hover:bg-[var(--cl-bg-surface-hover)] ${
                        c.idle ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="truncate px-4 py-1.5 text-[var(--cl-text-muted)]">
                        {c.device_name || c.device_id}
                      </td>
                      <td className="truncate px-4 py-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenApp(c.process_display)}
                          className="cursor-pointer truncate font-semibold hover:underline"
                          style={{ color: 'var(--cl-accent-primary)' }}
                        >
                          {c.process_display}
                        </button>
                      </td>
                      <td className="px-4 py-1.5 font-mono">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate" title={maskRuleText(c.rule || '', privacyMode)}>
                            {displayHost}
                          </span>
                          {c.connCount > 1 && (
                            <span
                              className="shrink-0 rounded px-1 py-0.5 font-mono text-[10px] text-[var(--cl-text-muted)]"
                              style={{ backgroundColor: 'var(--cl-bg-surface-hover)' }}
                              title={`当前合并展示 ${c.connCount} 条同目标并发连接`}
                            >
                              ×{c.connCount}
                            </span>
                          )}
                          {c.service_tag ? (
                            <span
                              className="shrink-0 rounded px-1 py-0.5 font-sans text-[10px] text-[var(--cl-text-muted)]"
                              style={{ backgroundColor: 'var(--cl-bg-surface-hover)' }}
                            >
                              {c.service_tag}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void handleCopyHost(rowKey, c.host)}
                            className="shrink-0 rounded p-0.5 text-[var(--cl-text-muted)] transition hover:bg-[var(--cl-bg-surface-hover)] hover:text-[var(--cl-text-primary)]"
                            title="复制目标地址"
                          >
                            {copiedRowKey === rowKey ? (
                              <Check className="h-3 w-3" style={{ color: 'var(--cl-status-success)' }} />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="truncate px-4 py-1.5">
                        <span
                          className="inline-block max-w-full truncate rounded px-1.5 py-0.5 font-mono text-[10px] align-middle"
                          style={{
                            backgroundColor: 'var(--cl-bg-surface-hover)',
                            color:
                              c.route_type === 'PROXY'
                                ? chartTheme.routeColors.PROXY
                                : c.route_type === 'DIRECT'
                                  ? chartTheme.routeColors.DIRECT
                                  : chartTheme.routeColors.REJECT,
                          }}
                        >
                          {c.route_type === 'DIRECT' ? 'DIRECT' : c.egress_node}
                        </span>
                      </td>
                      <td className="truncate px-4 py-1.5 font-mono text-[11px] text-[var(--cl-text-muted)]">
                        {c.inbound_mode}
                      </td>
                      <td
                        className="px-4 py-1.5 text-right font-mono whitespace-nowrap tabular-nums"
                        style={{ color: chartTheme.liveColors.down }}
                      >
                        {formatSpeed(c.down_bps)}
                      </td>
                      <td
                        className="px-4 py-1.5 text-right font-mono whitespace-nowrap tabular-nums"
                        style={{ color: chartTheme.liveColors.up }}
                      >
                        {formatSpeed(c.up_bps)}
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono whitespace-nowrap font-semibold tabular-nums">
                        {formatBytes(c.total_bytes)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
