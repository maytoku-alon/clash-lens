import { useMemo } from 'react'
import type * as echarts from 'echarts'
import { Activity, ShieldAlert, Wifi } from 'lucide-react'
import { EChartBox } from '../components/EChartBox'
import type { LiveHubSnapshot } from '../types/api'
import { formatBytes, formatRelativeTime, formatSpeed } from '../utils/format'

interface LiveMonitorPageProps {
  live: LiveHubSnapshot | null
  rateHistory: { time: string; down: number; up: number }[]
  isDark: boolean
  onOpenApp: (processDisplay: string) => void
}

export function LiveMonitorPage({
  live,
  rateHistory,
  isDark,
  onOpenApp,
}: LiveMonitorPageProps) {
  const chartOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = rateHistory.length > 0 ? rateHistory : [{ time: '--:--:--', down: 0, up: 0 }]
    const textColor = isDark ? '#a1a1aa' : '#64748b'
    const gridLine = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)'
    return {
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: isDark ? '#141419' : '#ffffff',
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
        textStyle: { color: isDark ? '#fafafa' : '#0f172a', fontSize: 12 },
        valueFormatter: (v: unknown) => formatSpeed(Number(v)),
      },
      legend: {
        top: 0,
        textStyle: { color: textColor, fontSize: 11 },
      },
      grid: { top: 32, left: 62, right: 18, bottom: 24 },
      xAxis: {
        type: 'category',
        data: pts.map((p) => p.time),
        axisLabel: { color: textColor, fontSize: 10 },
        axisLine: { lineStyle: { color: gridLine } },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: gridLine } },
        axisLabel: { color: textColor, fontSize: 10, formatter: (v: number) => formatSpeed(v) },
      },
      series: [
        {
          name: '下行速率',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2.2, color: '#06b6d4' },
          areaStyle: { color: 'rgba(6, 182, 212, 0.16)' },
          data: pts.map((p) => p.down),
        },
        {
          name: '上行速率',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: '#8b5cf6' },
          areaStyle: { color: 'rgba(139, 92, 246, 0.12)' },
          data: pts.map((p) => p.up),
        },
      ],
    }
  }, [rateHistory, isDark])

  return (
    <div className="space-y-4">
      {/* Summary Strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="cl-card rounded-xl p-4">
          <div className="text-xs text-[var(--cl-muted)]">全网实时下行</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-cyan-400 tabular-nums">
            ↓ {formatSpeed(live?.total_down_bps)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--cl-muted)] tabular-nums">
            代理 {formatSpeed(live?.proxy_down_bps)} · 直连 {formatSpeed(live?.direct_down_bps)}
          </div>
        </div>
        <div className="cl-card rounded-xl p-4">
          <div className="text-xs text-[var(--cl-muted)]">全网实时上行</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-violet-400 tabular-nums">
            ↑ {formatSpeed(live?.total_up_bps)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--cl-muted)] tabular-nums">
            代理 {formatSpeed(live?.proxy_up_bps)} · 直连 {formatSpeed(live?.direct_up_bps)}
          </div>
        </div>
        <div className="cl-card rounded-xl p-4">
          <div className="text-xs text-[var(--cl-muted)]">活跃连接总数</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums">
            {live?.active_conns ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-[var(--cl-muted)]">每 2 秒 WebSocket 自动推送</div>
        </div>
        <div className="cl-card rounded-xl p-4">
          <div className="text-xs text-[var(--cl-muted)]">在线采集设备</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
            {live?.online_devices ?? 0} / {live?.devices?.length ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-[var(--cl-muted)]">支持离线自动缓冲补传</div>
        </div>
      </div>

      {/* Live Chart */}
      <div className="cl-card rounded-xl p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold">实时速率曲线（最近 60 个采样点）</h2>
        </div>
        <EChartBox option={chartOption} className="h-[240px] w-full" />
      </div>

      {/* Device live cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(live?.devices ?? []).map((d) => (
          <div key={d.device_id} className="cl-card rounded-xl p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    d.online ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-zinc-500'
                  }`}
                />
                <span className="text-sm font-semibold">{d.device_name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {d.tun_enabled && (
                  <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] text-cyan-400">
                    TUN
                  </span>
                )}
                {d.tun_enabled && !d.sniffer_enabled && (
                  <span title="TUN 开启但域名嗅探未开启">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                  </span>
                )}
                <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-[var(--cl-muted)]">
                  {d.mihomo_version || d.os}
                </span>
              </div>
            </div>

            <div className="mt-3 flex items-baseline justify-between gap-2 font-mono tabular-nums">
              <div className="flex items-center gap-3">
                <span className="inline-block w-[92px] whitespace-nowrap text-sm font-bold text-cyan-400">
                  ↓ {formatSpeed(d.down_bps)}
                </span>
                <span className="inline-block w-[92px] whitespace-nowrap text-xs text-violet-400">
                  ↑ {formatSpeed(d.up_bps)}
                </span>
              </div>
              <span className="shrink-0 text-xs text-[var(--cl-muted)]">{d.active_conns} 连接</span>
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-[var(--cl-muted)]">
              <span>进程识别: {d.find_process_mode || '未知'}</span>
              <span>心跳: {formatRelativeTime(d.last_seen_at)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Live Top Active Connections */}
      <div className="cl-card overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--cl-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">当前活跃高吞吐连接 Top 25</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--cl-border)] bg-[var(--cl-surface)] text-[var(--cl-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">设备</th>
                <th className="px-4 py-2 font-medium">应用进程</th>
                <th className="px-4 py-2 font-medium">域名 / 主机</th>
                <th className="px-4 py-2 font-medium">出口节点</th>
                <th className="px-4 py-2 font-medium">入口</th>
                <th className="w-[104px] px-4 py-2 font-medium text-right">实时下行</th>
                <th className="w-[104px] px-4 py-2 font-medium text-right">实时上行</th>
                <th className="w-[100px] px-4 py-2 font-medium text-right">连接累计</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cl-border)]">
              {!live || live.top_active.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[var(--cl-muted)]">
                    当前暂无活跃高吞吐连接（等待设备实时推送）
                  </td>
                </tr>
              ) : (
                live.top_active.map((c, idx) => (
                  <tr
                    key={`${c.device_id}-${c.process_display}-${c.host}-${idx}`}
                    className="hover:bg-[var(--cl-hover)]"
                  >
                    <td className="px-4 py-2 text-[var(--cl-muted)]">{c.device_name || c.device_id}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => onOpenApp(c.process_display)}
                        className="font-semibold text-emerald-400 hover:underline"
                      >
                        {c.process_display}
                      </button>
                    </td>
                    <td className="max-w-[260px] truncate px-4 py-2 font-mono">
                      {c.host}
                      {c.service_tag ? (
                        <span className="ml-1.5 rounded bg-white/5 px-1 py-0.5 font-sans text-[10px] text-[var(--cl-muted)]">
                          {c.service_tag}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                          c.route_type === 'PROXY'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-indigo-500/15 text-indigo-400'
                        }`}
                      >
                        {c.route_type === 'DIRECT' ? 'DIRECT' : c.egress_node}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px] text-[var(--cl-muted)]">
                      {c.inbound_mode}
                    </td>
                    <td className="px-4 py-2 text-right font-mono whitespace-nowrap text-cyan-400 tabular-nums">
                      {formatSpeed(c.down_bps)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono whitespace-nowrap text-violet-400 tabular-nums">
                      {formatSpeed(c.up_bps)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono whitespace-nowrap font-semibold tabular-nums">
                      {formatBytes(c.total_bytes)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
