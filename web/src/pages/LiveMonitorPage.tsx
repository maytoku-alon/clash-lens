import { useMemo, useState } from 'react'
import type * as echarts from 'echarts'
import { Activity, Check, Copy, ExternalLink, Pause, Play, Search, ShieldAlert, TrendingUp, Wifi, X } from 'lucide-react'
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
  const [frozenRows, setFrozenRows] = useState<LiveConnectionItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedRowKey, setCopiedRowKey] = useState('')

  const handleTogglePause = () => {
    if (!paused) {
      setFrozenRows(live?.top_active ?? [])
      setPaused(true)
    } else {
      setPaused(false)
    }
  }

  const topActiveProcesses = useMemo(() => {
    const source = live?.top_active ?? []
    const byProc = new Map<string, { process: string; downBps: number; upBps: number; totalBps: number; conns: number }>()
    for (const c of source) {
      const key = c.process_display || '未知进程'
      const cur = byProc.get(key) ?? { process: key, downBps: 0, upBps: 0, totalBps: 0, conns: 0 }
      cur.downBps += c.down_bps
      cur.upBps += c.up_bps
      cur.totalBps += c.down_bps + c.up_bps
      cur.conns += 1
      byProc.set(key, cur)
    }
    return Array.from(byProc.values())
      .sort((a, b) => b.totalBps - a.totalBps)
      .slice(0, 5)
  }, [live?.top_active])

  const filteredConnections = useMemo(() => {
    const rows = paused ? frozenRows : (live?.top_active ?? [])
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((c) =>
      [c.device_name, c.device_id, c.process_display, c.host, c.root_domain, c.service_tag, c.egress_node, c.rule]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [paused, frozenRows, live?.top_active, searchQuery])

  const handleCopyHost = async (rowKey: string, host: string) => {
    const ok = await copyToClipboard(host)
    if (ok) {
      setCopiedRowKey(rowKey)
      setTimeout(() => setCopiedRowKey((prev) => (prev === rowKey ? '' : prev)), 1600)
    }
  }

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

      {/* Device live cards + Active Process Top 5 (no dead space on single device) */}
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

        <div className="cl-card rounded-xl p-4 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" style={{ color: 'var(--cl-accent-primary)' }} />
              <h3 className="text-sm font-semibold">当前活跃进程实时速率 Top 5</h3>
            </div>
            <span className="font-mono text-[10px] text-[var(--cl-text-muted)]">基于活跃连接聚合</span>
          </div>
          {topActiveProcesses.length === 0 ? (
            <div className="py-6 text-center text-xs text-[var(--cl-text-muted)]">当前暂无活跃吞吐进程</div>
          ) : (
            <div className="cl-list-stack space-y-2">
              {topActiveProcesses.map((p) => {
                const maxBps = topActiveProcesses[0]?.totalBps || 1
                const pct = Math.max(4, Math.round((p.totalBps / maxBps) * 100))
                return (
                  <button
                    type="button"
                    key={p.process}
                    onClick={() => onOpenApp(p.process)}
                    className="cl-list-item block w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition hover:border-[var(--cl-border-focus)]"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold">{p.process}</span>
                        <span className="shrink-0 font-mono text-[10px] text-[var(--cl-text-muted)]">
                          {p.conns} 连接
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums">
                        <span style={{ color: chartTheme.liveColors.down }}>↓{formatSpeed(p.downBps)}</span>
                        <span style={{ color: chartTheme.liveColors.up }}>↑{formatSpeed(p.upBps)}</span>
                      </div>
                    </div>
                    <div
                      className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: 'var(--cl-border-subtle)' }}
                    >
                      <div
                        className="cl-progress-fill h-full rounded-full"
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

      {/* Live Top Active Connections */}
      <div className="cl-card overflow-hidden rounded-xl">
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
          style={{ borderColor: 'var(--cl-border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4" style={{ color: 'var(--cl-accent-primary)' }} />
            <h3 className="text-sm font-semibold">当前活跃高吞吐连接 Top 25</h3>
            {paused && (
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.14)',
                  color: 'var(--cl-status-warning)',
                }}
              >
                列表已冻结（后台曲线仍持续更新）
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead
              className="border-b bg-[var(--cl-bg-sidebar)] text-[var(--cl-text-muted)]"
              style={{ borderColor: 'var(--cl-border-subtle)' }}
            >
              <tr>
                <th className="px-4 py-2 font-medium">设备</th>
                <th className="px-4 py-2 font-medium">应用进程</th>
                <th className="px-4 py-2 font-medium">域名 / 主机</th>
                <th className="px-4 py-2 font-medium">出口节点</th>
                <th className="px-4 py-2 font-medium">入口</th>
                <th className="w-[104px] px-4 py-2 text-right font-medium">实时下行</th>
                <th className="w-[104px] px-4 py-2 text-right font-medium">实时上行</th>
                <th className="w-[100px] px-4 py-2 text-right font-medium">连接累计</th>
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
                filteredConnections.map((c, idx) => {
                  const rowKey = `${c.device_id}-${c.process_display}-${c.host}-${idx}`
                  const displayHost = maskHostOrDomain(c.host, privacyMode)
                  return (
                    <tr
                      key={rowKey}
                      className="hover:bg-[var(--cl-bg-surface-hover)]"
                    >
                      <td className="px-4 py-2 text-[var(--cl-text-muted)]">{c.device_name || c.device_id}</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => onOpenApp(c.process_display)}
                          className="cursor-pointer font-semibold hover:underline"
                          style={{ color: 'var(--cl-accent-primary)' }}
                        >
                          {c.process_display}
                        </button>
                      </td>
                      <td className="max-w-[290px] px-4 py-2 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate" title={maskRuleText(c.rule || '', privacyMode)}>
                            {displayHost}
                          </span>
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
                      <td className="px-4 py-2">
                        <span
                          className="rounded px-1.5 py-0.5 font-mono text-[10px]"
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
                      <td className="px-4 py-2 font-mono text-[11px] text-[var(--cl-text-muted)]">
                        {c.inbound_mode}
                      </td>
                      <td
                        className="px-4 py-2 text-right font-mono whitespace-nowrap tabular-nums"
                        style={{ color: chartTheme.liveColors.down }}
                      >
                        {formatSpeed(c.down_bps)}
                      </td>
                      <td
                        className="px-4 py-2 text-right font-mono whitespace-nowrap tabular-nums"
                        style={{ color: chartTheme.liveColors.up }}
                      >
                        {formatSpeed(c.up_bps)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono whitespace-nowrap font-semibold tabular-nums">
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
