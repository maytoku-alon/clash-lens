import { useEffect, useMemo, useState } from 'react'
import type * as echarts from 'echarts'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Flame, Globe, Layers, X, Zap } from 'lucide-react'
import { buildOverviewViewModel } from '../adapters/trafficAdapter'
import type { QueryParams } from '../api/trafficApi'
import { EChartBox } from '../components/EChartBox'
import { TrafficHeatmap } from '../components/TrafficHeatmap'
import { TrafficStackChart } from '../components/TrafficStackChart'
import { useOverviewData } from '../hooks/useDashboardQueries'
import { useI18n } from '../i18n/I18nProvider'
import { buildChartTheme } from '../theme/chartAdapter'
import { useTheme } from '../theme/ThemeProvider'
import type { GroupByDim, LiveHubSnapshot } from '../types/api'
import { formatBytes, formatFullTime, formatSpeed } from '../utils/format'
import { maskHostOrDomain } from '../utils/privacy'

interface OverviewPageProps {
  query: QueryParams
  live: LiveHubSnapshot | null
  rateHistory: { down: number; up: number }[]
  onSelectDay: (dateStr: string) => void
  onOpenApp: (processDisplay: string) => void
  onOpenDomain: (rootDomain: string) => void
}

const DISMISSED_WARNINGS_KEY = 'clashlens_dismissed_warnings'

function warningKey(w: { code: string; device_id: string }): string {
  return `${w.code}:${w.device_id}`
}

function readDismissedWarnings(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_WARNINGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function OverviewPage({
  query,
  live,
  rateHistory,
  onSelectDay,
  onOpenApp,
  onOpenDomain,
}: OverviewPageProps) {
  const { theme, tokens, colorMode, privacyMode } = useTheme()
  const { lang, m, resolveServiceTag, resolveProcessName, translateWarning } = useI18n()
  const chartTheme = useMemo(
    () => buildChartTheme(tokens, colorMode, theme.chartEffects),
    [tokens, colorMode, theme.chartEffects],
  )

  const [groupBy, setGroupBy] = useState<GroupByDim>('process')
  const [rankTab, setRankTab] = useState<'apps' | 'domains'>('apps')
  const [dismissedWarnings, setDismissedWarnings] = useState<string[]>(readDismissedWarnings)

  const { overview, heatmap, timeseries, bursts, apps, domains, loading } = useOverviewData(query, groupBy)
  const { todayProxyPct, quotaPct, hasQuota } = useMemo(() => buildOverviewViewModel(overview), [overview])

  useEffect(() => {
    if (!overview || query.deviceId !== 'all') return
    const activeKeys = new Set((overview.warnings ?? []).map(warningKey))
    setDismissedWarnings((prev) => {
      const next = prev.filter((k) => activeKeys.has(k))
      if (next.length === prev.length) return prev
      try {
        localStorage.setItem(DISMISSED_WARNINGS_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }, [overview, query.deviceId])

  const visibleWarnings = useMemo(
    () => (overview?.warnings ?? []).filter((w) => !dismissedWarnings.includes(warningKey(w))),
    [overview?.warnings, dismissedWarnings],
  )

  const dismissWarning = (key: string) => {
    setDismissedWarnings((prev) => {
      if (prev.includes(key)) return prev
      const next = [...prev, key]
      try {
        localStorage.setItem(DISMISSED_WARNINGS_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

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
          lineStyle: chartTheme.liveLineStyle('down', 1.8),
          areaStyle: { color: chartTheme.liveColors.downArea },
        },
        {
          type: 'line',
          data: pts.map((p) => p.up),
          smooth: true,
          symbol: 'none',
          lineStyle: chartTheme.liveLineStyle('up', 1.5),
        },
      ],
    }
  }, [rateHistory, chartTheme])

  return (
    <div className="space-y-4">
      {/* Diagnostic Warnings (e.g. TUN without Sniffer) */}
      {visibleWarnings.map((w) => {
        const key = warningKey(w)
        const tr = translateWarning(w)
        return (
          <div
            key={key}
            data-testid="overview-warning-banner"
            className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs"
            style={{
              borderColor: 'var(--cl-border-focus)',
              backgroundColor: 'var(--cl-accent-soft)',
              color: 'var(--cl-status-warning)',
            }}
          >
            <div className="flex min-w-0 items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold">{tr.title}</div>
                <div className="mt-0.5 opacity-90">{tr.message}</div>
              </div>
            </div>
            <button
              type="button"
              data-testid="dismiss-warning-btn"
              onClick={() => dismissWarning(key)}
              className="shrink-0 cursor-pointer rounded-md p-1 opacity-70 transition hover:bg-black/10 hover:opacity-100"
              title={m.overview.dismissWarningTitle}
              aria-label={m.overview.dismissWarningAria(w.device_name || tr.title)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}

      {/* Unified CSS Grid layout container: classic/bento reorders via grid-area without unmounting charts */}
      <div className="cl-overview-grid">
        {/* Top 4 Bento KPI Cards */}
        <div className="cl-area-kpi cl-kpi-grid">
          {/* Card 1: Today Traffic */}
          <div className="cl-card rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-[var(--cl-text-muted)]">
              <span>{m.overview.todayTraffic}</span>
              {overview && overview.yesterday_bytes > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums"
                  style={{
                    backgroundColor: 'var(--cl-accent-soft)',
                    color: overview.today_delta_pct >= 0 ? 'var(--cl-accent-primary)' : 'var(--cl-status-success)',
                  }}
                >
                  {overview.today_delta_pct >= 0 ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {m.overview.vsYesterday(Math.abs(overview.today_delta_pct))}
                </span>
              )}
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums">
              {formatBytes(overview?.today_bytes)}
            </div>
            <div className="mt-3">
              <div className="mb-1 flex justify-between font-mono text-[11px] text-[var(--cl-text-muted)] tabular-nums">
                <span>{m.overview.proxyShort(formatBytes(overview?.today_proxy_bytes))}</span>
                <span>{m.overview.directShort(formatBytes(overview?.today_direct_bytes))}</span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: 'var(--cl-border-subtle)' }}
              >
                <div
                  className="cl-progress-fill h-full rounded-full transition-all"
                  style={{ width: `${todayProxyPct}%`, backgroundColor: 'var(--cl-accent-primary)' }}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Month & Quota */}
          <div className="cl-card rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-[var(--cl-text-muted)]">
              <span>{m.overview.monthAndQuota}</span>
              <span className="font-mono text-[11px] tabular-nums">
                {m.overview.onlineDevices(overview?.online_devices ?? 0, overview?.total_devices ?? 0)}
              </span>
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums">
              {formatBytes(overview?.month_bytes)}
            </div>
            {hasQuota && overview ? (
              <div className="mt-3">
                <div className="mb-1 flex justify-between font-mono text-[11px] text-[var(--cl-text-muted)] tabular-nums">
                  <span>
                    {m.overview.billedProgress(formatBytes(overview.quota.billed_bytes), overview.quota.monthly_quota_gb)}
                  </span>
                  <span
                    style={{
                      color:
                        quotaPct > 85 ? 'var(--cl-status-danger)' : 'var(--cl-status-success)',
                    }}
                  >
                    {quotaPct.toFixed(1)}%
                  </span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full"
                  style={{ backgroundColor: 'var(--cl-border-subtle)' }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${quotaPct}%`,
                      backgroundColor:
                        quotaPct > 85 ? 'var(--cl-status-danger)' : 'var(--cl-accent-primary)',
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-[var(--cl-text-muted)] tabular-nums">
                <span>{m.overview.selectedRange(formatBytes(overview?.range_bytes))}</span>
                <span>{m.overview.allTimeTotal(formatBytes(overview?.all_time_bytes))}</span>
              </div>
            )}
          </div>

          {/* Card 3: Live Speed + Sparkline */}
          <div className="cl-card rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-[var(--cl-text-muted)]">
              <span>{m.overview.liveTotalSpeed}</span>
              <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--cl-accent-primary)' }}>
                {m.overview.activeConnsLabel(live?.active_conns ?? 0)}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 font-mono tabular-nums">
              <span
                className="truncate whitespace-nowrap text-lg font-bold"
                style={{ color: chartTheme.liveColors.down }}
              >
                ↓ {formatSpeed(live?.total_down_bps)}
              </span>
              <span
                className="self-baseline truncate whitespace-nowrap text-right text-sm font-semibold"
                style={{ color: chartTheme.liveColors.up }}
              >
                ↑ {formatSpeed(live?.total_up_bps)}
              </span>
            </div>
            <div className="mt-2 h-10 w-full">
              <EChartBox option={sparkOption} className="h-10 w-full" />
            </div>
          </div>

          {/* Card 4: Top Consumer */}
          <button
            type="button"
            onClick={() => {
              if (overview?.top_consumer?.process_display) {
                onOpenApp(overview.top_consumer.process_display)
              }
            }}
            className="cl-card group flex cursor-pointer flex-col justify-between rounded-xl p-4 text-left transition hover:border-[var(--cl-border-focus)]"
          >
            <div className="flex w-full items-center justify-between text-xs text-[var(--cl-text-muted)]">
              <span>{m.overview.topConsumerTitle}</span>
              <Flame className="h-3.5 w-3.5" style={{ color: 'var(--cl-status-warning)' }} />
            </div>
            {overview?.top_consumer ? (
              <>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="truncate text-lg font-bold tracking-tight">
                    {resolveProcessName(overview.top_consumer.process_display)}
                  </span>
                  <span
                    className="shrink-0 font-mono text-base font-bold tabular-nums"
                    style={{ color: 'var(--cl-accent-primary)' }}
                  >
                    {formatBytes(overview.top_consumer.total_bytes)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--cl-text-muted)]">
                  <span className="truncate font-mono">
                    {maskHostOrDomain(overview.top_consumer.root_domain, privacyMode)}
                    {(() => {
                      const tag = resolveServiceTag(
                        overview.top_consumer.service_tag,
                        overview.top_consumer.root_domain,
                      )
                      return tag ? ` · ${tag}` : ''
                    })()}
                  </span>
                  <span className="shrink-0 text-[11px]" style={{ color: 'var(--cl-accent-primary)' }}>
                    {m.overview.drillDown}
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-4 text-xs text-[var(--cl-text-muted)]">
                {loading ? m.overview.calculating : m.overview.noRangeData}
              </div>
            )}
          </button>
        </div>

        {/* 365-Day Heatmap */}
        <div className="cl-area-heatmap">
          <TrafficHeatmap data={heatmap} onSelectDay={onSelectDay} />
        </div>

        {/* Stacked Bar Chart + Brush Spike Inspector */}
        <div className="cl-area-timeseries">
          <TrafficStackChart
            data={timeseries}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            deviceId={query.deviceId}
            scope={query.scope}
            onInspectApp={onOpenApp}
          />
        </div>

        {/* Bursts */}
        <div className="cl-area-bursts cl-card rounded-xl p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" style={{ color: 'var(--cl-status-warning)' }} />
              <h2 className="text-sm font-semibold tracking-tight">{m.overview.burstsTitle}</h2>
            </div>
            <span className="text-xs text-[var(--cl-text-muted)]">{m.overview.burstsSubtitle}</span>
          </div>

          {!bursts || bursts.items.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--cl-text-muted)]">
              {m.overview.burstsEmpty}
            </div>
          ) : (
            <div className="cl-list-stack cl-thin-scroll cl-bursts-scroll min-h-0 flex-1 space-y-2">
              {bursts.items.map((b, idx) => {
                const tag = resolveServiceTag(b.service_tag, b.root_domain)
                return (
                  <button
                    type="button"
                    key={`${b.bucket_ts}-${b.process_display}-${b.root_domain}-${idx}`}
                    onClick={() => onOpenApp(b.process_display)}
                    className="cl-list-item flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition hover:border-[var(--cl-border-focus)]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{resolveProcessName(b.process_display)}</span>
                        <span className="text-[11px] text-[var(--cl-text-muted)]">→</span>
                        <span
                          className="truncate font-mono text-xs"
                          style={{ color: 'var(--cl-accent-primary)' }}
                        >
                          {maskHostOrDomain(b.root_domain, privacyMode)}
                        </span>
                        {tag && (
                          <span
                            className="hidden rounded px-1.5 py-0.5 text-[10px] text-[var(--cl-text-muted)] sm:inline"
                            style={{ backgroundColor: 'var(--cl-bg-surface-hover)' }}
                          >
                            {tag}
                          </span>
                        )}
                      </div>
                      <div className="cl-burst-meta mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--cl-text-muted)] tabular-nums">
                        <span>{formatFullTime(b.bucket_ts, lang)}</span>
                        <span>· {b.device_name}</span>
                        <span>· {b.route_type === 'DIRECT' ? 'DIRECT' : b.egress_node}</span>
                        {b.inbound_mode === 'TUN' && (
                          <span
                            className="rounded px-1 text-[10px]"
                            style={{
                              backgroundColor: 'var(--cl-accent-soft)',
                              color: 'var(--cl-accent-primary)',
                            }}
                          >
                            TUN
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-mono tabular-nums">
                      <div className="text-xs font-bold" style={{ color: 'var(--cl-status-warning)' }}>
                        {formatBytes(b.total_bytes)}
                      </div>
                      <div className="text-[10px] text-[var(--cl-text-muted)]">
                        ↓{formatBytes(b.down_bytes, 1)}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick Top Apps / Domains */}
        <div className="cl-area-ranking cl-card rounded-xl p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {rankTab === 'apps' ? (
                <Layers className="h-4 w-4" style={{ color: 'var(--cl-accent-primary)' }} />
              ) : (
                <Globe className="h-4 w-4" style={{ color: 'var(--cl-status-success)' }} />
              )}
              <h2 className="text-sm font-semibold tracking-tight">{m.overview.rankingTitle}</h2>
            </div>

            <div className="cl-segment">
              <button
                type="button"
                onClick={() => setRankTab('apps')}
                className={`cl-segment-item ${rankTab === 'apps' ? 'cl-segment-item-active' : ''}`}
                style={rankTab === 'apps' ? { color: 'var(--cl-accent-primary)' } : undefined}
              >
                {m.overview.topAppsTab}
              </button>
              <button
                type="button"
                onClick={() => setRankTab('domains')}
                className={`cl-segment-item ${rankTab === 'domains' ? 'cl-segment-item-active' : ''}`}
                style={rankTab === 'domains' ? { color: 'var(--cl-accent-primary)' } : undefined}
              >
                {m.overview.topDomainsTab}
              </button>
            </div>
          </div>

          {rankTab === 'apps' ? (
            !apps || apps.items.length === 0 ? (
              <div className="py-10 text-center text-xs text-[var(--cl-text-muted)]">{m.overview.noAppsRank}</div>
            ) : (
              <div className="cl-list-stack space-y-2.5">
                {apps.items.map((app) => (
                  <button
                    type="button"
                    key={app.process_display}
                    onClick={() => onOpenApp(app.process_display)}
                    className="cl-list-item block w-full cursor-pointer rounded-lg border p-2.5 text-left transition hover:border-[var(--cl-border-focus)]"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold">{resolveProcessName(app.process_display)}</span>
                        <span className="truncate font-mono text-[11px] text-[var(--cl-text-muted)]">
                          {app.top_domains.map((d) => maskHostOrDomain(d.root_domain, privacyMode)).join(' · ')}
                        </span>
                      </div>
                      <span
                        className="shrink-0 font-mono font-bold tabular-nums"
                        style={{ color: 'var(--cl-accent-primary)' }}
                      >
                        {formatBytes(app.total_bytes)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div
                        className="h-1.5 flex-1 overflow-hidden rounded-full"
                        style={{ backgroundColor: 'var(--cl-border-subtle)' }}
                      >
                        <div
                          className="cl-progress-fill h-full rounded-full"
                          style={{
                            width: `${Math.max(2, app.share_pct)}%`,
                            backgroundColor: 'var(--cl-accent-primary)',
                          }}
                        />
                      </div>
                      <span className="w-11 text-right font-mono text-[10px] text-[var(--cl-text-muted)] tabular-nums">
                        {app.share_pct.toFixed(1)}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : !domains || domains.items.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--cl-text-muted)]">{m.overview.noDomainsRank}</div>
          ) : (
            <div className="cl-list-stack space-y-2.5">
              {domains.items.map((dom) => {
                const tag = resolveServiceTag(dom.service_tag, dom.root_domain)
                return (
                  <button
                    type="button"
                    key={dom.root_domain}
                    onClick={() => onOpenDomain(dom.root_domain)}
                    className="cl-list-item block w-full cursor-pointer rounded-lg border p-2.5 text-left transition hover:border-[var(--cl-border-focus)]"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-mono font-semibold">
                          {maskHostOrDomain(dom.root_domain, privacyMode)}
                        </span>
                        {tag && (
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
                            style={{
                              backgroundColor: 'var(--cl-accent-soft)',
                              color: 'var(--cl-accent-primary)',
                            }}
                          >
                            {tag}
                          </span>
                        )}
                      </div>
                      <span
                        className="shrink-0 font-mono font-bold tabular-nums"
                        style={{ color: 'var(--cl-accent-primary)' }}
                      >
                        {formatBytes(dom.total_bytes)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div
                        className="h-1.5 flex-1 overflow-hidden rounded-full"
                        style={{ backgroundColor: 'var(--cl-border-subtle)' }}
                      >
                        <div
                          className="cl-progress-fill h-full rounded-full"
                          style={{
                            width: `${Math.max(2, dom.share_pct)}%`,
                            backgroundColor: 'var(--cl-status-success)',
                          }}
                        />
                      </div>
                      <span className="w-11 text-right font-mono text-[10px] text-[var(--cl-text-muted)] tabular-nums">
                        {dom.share_pct.toFixed(1)}%
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
