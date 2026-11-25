import { useEffect, useMemo, useState } from 'react'
import type * as echarts from 'echarts'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Flame, Globe, Layers, Zap } from 'lucide-react'
import { api, type QueryParams } from '../api/client'
import { EChartBox } from '../components/EChartBox'
import { TrafficHeatmap } from '../components/TrafficHeatmap'
import { TrafficStackChart } from '../components/TrafficStackChart'
import type {
  AppsListResponse,
  BurstsResponse,
  DomainsListResponse,
  GroupByDim,
  HeatmapResponse,
  LiveHubSnapshot,
  OverviewResponse,
  TimeseriesResponse,
} from '../types/api'
import { formatBytes, formatFullTime, formatSpeed } from '../utils/format'

interface OverviewPageProps {
  query: QueryParams
  live: LiveHubSnapshot | null
  rateHistory: { down: number; up: number }[]
  isDark: boolean
  onSelectDay: (dateStr: string) => void
  onOpenApp: (processDisplay: string) => void
  onOpenDomain: (rootDomain: string) => void
}

export function OverviewPage({
  query,
  live,
  rateHistory,
  isDark,
  onSelectDay,
  onOpenApp,
  onOpenDomain,
}: OverviewPageProps) {
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null)
  const [groupBy, setGroupBy] = useState<GroupByDim>('process')
  const [timeseries, setTimeseries] = useState<TimeseriesResponse | null>(null)
  const [bursts, setBursts] = useState<BurstsResponse | null>(null)
  const [apps, setApps] = useState<AppsListResponse | null>(null)
  const [domains, setDomains] = useState<DomainsListResponse | null>(null)
  const [rankTab, setRankTab] = useState<'apps' | 'domains'>('apps')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      api.overview(query),
      api.heatmap({ deviceId: query.deviceId, scope: query.scope }),
      api.timeseries(query, groupBy),
      api.bursts(query, 8),
      api.apps(query, '', 8),
      api.domains(query, '', 8),
    ])
      .then(([ov, hm, ts, bu, ap, dm]) => {
        if (!alive) return
        setOverview(ov)
        setHeatmap(hm)
        setTimeseries(ts)
        setBursts(bu)
        setApps(ap)
        setDomains(dm)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [query.deviceId, query.scope, query.from, query.to, groupBy])

  const sparkOption = useMemo<echarts.EChartsCoreOption>(() => {
    const pts = rateHistory.length > 0 ? rateHistory : [{ down: 0, up: 0 }]
    return {
      grid: { top: 4, bottom: 2, left: 2, right: 2 },
      xAxis: { type: 'category', show: false, data: pts.map((_, i) => i) },
      yAxis: { type: 'value', show: false },
      series: [
        {
          type: 'line',
          data: pts.map((p) => p.down),
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 1.8, color: '#06b6d4' },
          areaStyle: { color: 'rgba(6, 182, 212, 0.18)' },
        },
        {
          type: 'line',
          data: pts.map((p) => p.up),
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 1.5, color: '#8b5cf6' },
        },
      ],
    }
  }, [rateHistory])

  const todayProxyPct =
    overview && overview.today_bytes > 0
      ? Math.round((overview.today_proxy_bytes / overview.today_bytes) * 100)
      : 0

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Diagnostic Warnings (e.g. TUN without Sniffer) */}
      {overview?.warnings?.map((w) => (
        <div
          key={`${w.code}-${w.device_id}`}
          className="flex items-start gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <div className="font-semibold">{w.title}</div>
            <div className="mt-0.5 opacity-90">{w.message}</div>
          </div>
        </div>
      ))}

      {/* Top 4 Bento KPI Cards */}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Today Traffic */}
        <div className="cl-card rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-[var(--cl-muted)]">
            <span>今日流量</span>
            {overview && overview.yesterday_bytes > 0 && (
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium ${
                  overview.today_delta_pct >= 0
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-cyan-500/15 text-cyan-400'
                }`}
              >
                {overview.today_delta_pct >= 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {Math.abs(overview.today_delta_pct).toFixed(1)}% vs 昨日
              </span>
            )}
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums">
            {formatBytes(overview?.today_bytes)}
          </div>
          <div className="mt-3">
            <div className="mb-1 flex justify-between font-mono text-[11px] text-[var(--cl-muted)] tabular-nums">
              <span>代理 {formatBytes(overview?.today_proxy_bytes)}</span>
              <span>直连 {formatBytes(overview?.today_direct_bytes)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-indigo-500/25">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${todayProxyPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Month & Quota */}
        <div className="cl-card rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-[var(--cl-muted)]">
            <span>本月累计 / 配额进度</span>
            <span className="font-mono text-[11px]">
              在线 {overview?.online_devices ?? 0}/{overview?.total_devices ?? 0} 设备
            </span>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums">
            {formatBytes(overview?.month_bytes)}
          </div>
          {overview?.quota?.enabled ? (
            <div className="mt-3">
              <div className="mb-1 flex justify-between font-mono text-[11px] text-[var(--cl-muted)] tabular-nums">
                <span>
                  计费 {formatBytes(overview.quota.billed_bytes)} / {overview.quota.monthly_quota_gb} GB
                </span>
                <span className={overview.quota.used_percent > 85 ? 'text-rose-400' : 'text-emerald-400'}>
                  {overview.quota.used_percent.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all ${
                    overview.quota.used_percent > 85 ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, overview.quota.used_percent)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-[var(--cl-muted)] tabular-nums">
              <span>所选时段 {formatBytes(overview?.range_bytes)}</span>
              <span>历史总计 {formatBytes(overview?.all_time_bytes)}</span>
            </div>
          )}
        </div>

        {/* Card 3: Live Speed + Sparkline */}
        <div className="cl-card rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-[var(--cl-muted)]">
            <span>实时总速率</span>
            <span className="font-mono text-[11px] text-cyan-400 tabular-nums">
              {live?.active_conns ?? 0} 活跃连接
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 font-mono tabular-nums">
            <span className="truncate whitespace-nowrap text-lg font-bold text-cyan-400">
              ↓ {formatSpeed(live?.total_down_bps)}
            </span>
            <span className="truncate whitespace-nowrap text-right text-sm font-semibold self-baseline text-violet-400">
              ↑ {formatSpeed(live?.total_up_bps)}
            </span>
          </div>
          <div className="mt-2 h-10 w-full">
            <EChartBox option={sparkOption} className="h-10 w-full" />
          </div>
        </div>

        {/* Card 4: Top Consumer */}
        <button
          onClick={() => {
            if (overview?.top_consumer?.process_display) {
              onOpenApp(overview.top_consumer.process_display)
            }
          }}
          className="cl-card group flex flex-col justify-between rounded-xl p-4 text-left transition hover:border-emerald-500/45"
        >
          <div className="flex w-full items-center justify-between text-xs text-[var(--cl-muted)]">
            <span>当前时段头号消耗源</span>
            <Flame className="h-3.5 w-3.5 text-amber-400" />
          </div>
          {overview?.top_consumer ? (
            <>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="truncate text-lg font-bold tracking-tight group-hover:text-emerald-400">
                  {overview.top_consumer.process_display}
                </span>
                <span className="shrink-0 font-mono text-base font-bold text-emerald-400 tabular-nums">
                  {formatBytes(overview.top_consumer.total_bytes)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--cl-muted)]">
                <span className="truncate font-mono">
                  {overview.top_consumer.root_domain}
                  {overview.top_consumer.service_tag ? ` · ${overview.top_consumer.service_tag}` : ''}
                </span>
                <span className="shrink-0 text-[11px] text-emerald-400">点击深挖 →</span>
              </div>
            </>
          ) : (
            <div className="mt-4 text-xs text-[var(--cl-muted)]">
              {loading ? '正在统计...' : '该时段暂无消耗数据'}
            </div>
          )}
        </button>
      </div>

      {/* 365-Day Heatmap */}
      <TrafficHeatmap data={heatmap} isDark={isDark} onSelectDay={onSelectDay} />

      {/* Stacked Bar/Area Chart + Brush Spike Inspector */}
      <TrafficStackChart
        data={timeseries}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        deviceId={query.deviceId}
        scope={query.scope}
        isDark={isDark}
        onInspectApp={onOpenApp}
      />

      {/* Bottom 2-column row: Bursts + Top Apps/Domains */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Bursts */}
        <div className="cl-card rounded-xl p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold tracking-tight">突发高耗事件（Top Bursts）</h2>
            </div>
            <span className="text-xs text-[var(--cl-muted)]">快速定位暴涨时段</span>
          </div>

          {!bursts || bursts.items.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--cl-muted)]">该时间范围暂无明显流量明细</div>
          ) : (
            <div className="space-y-2">
              {bursts.items.map((b, idx) => (
                <button
                  key={`${b.bucket_ts}-${b.process_display}-${b.root_domain}-${idx}`}
                  onClick={() => onOpenApp(b.process_display)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--cl-border)] bg-[var(--cl-surface)] px-3 py-2.5 text-left transition hover:border-amber-500/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{b.process_display}</span>
                      <span className="text-[11px] text-[var(--cl-muted)]">→</span>
                      <span className="truncate font-mono text-xs text-emerald-400">
                        {b.root_domain}
                      </span>
                      {b.service_tag && (
                        <span className="hidden rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--cl-muted)] sm:inline">
                          {b.service_tag}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--cl-muted)]">
                      <span>{formatFullTime(b.bucket_ts)}</span>
                      <span>· {b.device_name}</span>
                      <span>· {b.route_type === 'DIRECT' ? 'DIRECT' : b.egress_node}</span>
                      {b.inbound_mode === 'TUN' && (
                        <span className="rounded bg-cyan-500/15 px-1 text-[10px] text-cyan-400">TUN</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono tabular-nums">
                    <div className="text-xs font-bold text-amber-400">{formatBytes(b.total_bytes)}</div>
                    <div className="text-[10px] text-[var(--cl-muted)]">
                      ↓{formatBytes(b.down_bytes, 1)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick Top Apps / Domains */}
        <div className="cl-card rounded-xl p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {rankTab === 'apps' ? (
                <Layers className="h-4 w-4 text-emerald-400" />
              ) : (
                <Globe className="h-4 w-4 text-cyan-400" />
              )}
              <h2 className="text-sm font-semibold tracking-tight">消耗排行榜</h2>
            </div>

            <div className="cl-segment">
              <button
                type="button"
                onClick={() => setRankTab('apps')}
                className={`cl-segment-item ${
                  rankTab === 'apps' ? 'cl-segment-item-active !text-emerald-400' : ''
                }`}
              >
                Top 应用
              </button>
              <button
                type="button"
                onClick={() => setRankTab('domains')}
                className={`cl-segment-item ${
                  rankTab === 'domains' ? 'cl-segment-item-active !text-cyan-400' : ''
                }`}
              >
                Top 网站
              </button>
            </div>
          </div>

          {rankTab === 'apps' ? (
            !apps || apps.items.length === 0 ? (
              <div className="py-10 text-center text-xs text-[var(--cl-muted)]">暂无应用排行数据</div>
            ) : (
              <div className="space-y-2.5">
                {apps.items.map((app) => (
                  <button
                    key={app.process_display}
                    onClick={() => onOpenApp(app.process_display)}
                    className="block w-full rounded-lg border border-[var(--cl-border)] bg-[var(--cl-surface)] p-2.5 text-left transition hover:border-emerald-500/40"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold">{app.process_display}</span>
                        <span className="truncate font-mono text-[11px] text-[var(--cl-muted)]">
                          {app.top_domains.map((d) => d.root_domain).join(' · ')}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono font-bold tabular-nums text-emerald-400">
                        {formatBytes(app.total_bytes)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.max(2, app.share_pct)}%` }}
                        />
                      </div>
                      <span className="w-11 text-right font-mono text-[10px] text-[var(--cl-muted)] tabular-nums">
                        {app.share_pct.toFixed(1)}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : !domains || domains.items.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--cl-muted)]">暂无网站排行数据</div>
          ) : (
            <div className="space-y-2.5">
              {domains.items.map((dom) => (
                <button
                  key={dom.root_domain}
                  onClick={() => onOpenDomain(dom.root_domain)}
                  className="block w-full rounded-lg border border-[var(--cl-border)] bg-[var(--cl-surface)] p-2.5 text-left transition hover:border-cyan-500/40"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-mono font-semibold">{dom.root_domain}</span>
                      {dom.service_tag && (
                        <span className="shrink-0 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-400">
                          {dom.service_tag}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-mono font-bold tabular-nums text-cyan-400">
                      {formatBytes(dom.total_bytes)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-cyan-500"
                        style={{ width: `${Math.max(2, dom.share_pct)}%` }}
                      />
                    </div>
                    <span className="w-11 text-right font-mono text-[10px] text-[var(--cl-muted)] tabular-nums">
                      {dom.share_pct.toFixed(1)}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
