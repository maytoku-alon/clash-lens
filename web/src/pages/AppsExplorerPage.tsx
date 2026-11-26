import { Fragment, useEffect, useMemo, useState } from 'react'
import type * as echarts from 'echarts'
import { ChevronDown, ChevronRight, Globe, Layers, Search } from 'lucide-react'
import { maxStackedSeriesValue } from '../adapters/trafficAdapter'
import type { QueryParams } from '../api/trafficApi'
import { EChartBox } from '../components/EChartBox'
import { useAppsExplorerData } from '../hooks/useDashboardQueries'
import { buildByteValueAxis, buildChartTheme } from '../theme/chartAdapter'
import { useTheme } from '../theme/ThemeProvider'
import { formatBytes, formatNumber, formatTimeBucket } from '../utils/format'

interface AppsExplorerPageProps {
  query: QueryParams
  initialMode: 'app' | 'domain'
  initialTarget: string
}

export function AppsExplorerPage({
  query,
  initialMode,
  initialTarget,
}: AppsExplorerPageProps) {
  const { theme, tokens, colorMode } = useTheme()
  const chartTheme = useMemo(
    () => buildChartTheme(tokens, colorMode, theme.chartEffects),
    [tokens, colorMode, theme.chartEffects],
  )

  const {
    mode,
    setMode,
    search,
    setSearch,
    appsList,
    domainsList,
    selectedApp,
    setSelectedApp,
    selectedDomain,
    setSelectedDomain,
    appDetail,
    domainDetail,
  } = useAppsExplorerData(query, initialMode, initialTarget)

  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({})

  // Bug #3 fix: only reset expanded rows when switching active app/domain target, NEVER on 30s rolling refresh
  useEffect(() => {
    setExpandedKeys({})
  }, [mode, selectedApp, selectedDomain])

  const timelineOption = useMemo<echarts.EChartsCoreOption>(() => {
    const tl = mode === 'app' ? appDetail?.timeline : domainDetail?.timeline
    const timestamps = tl?.timestamps ?? []
    const interval = tl?.interval ?? 'hour'
    const seriesList = tl?.series ?? []
    const peakStacked = maxStackedSeriesValue(seriesList)

    return {
      color: chartTheme.palette,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        backgroundColor: chartTheme.tooltip.backgroundColor,
        borderColor: chartTheme.tooltip.borderColor,
        textStyle: chartTheme.tooltip.textStyle,
        valueFormatter: (val: unknown) => formatBytes(Number(val)),
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        textStyle: chartTheme.legendTextStyle,
        itemWidth: 10,
        itemHeight: 10,
      },
      grid: { top: 12, left: 54, right: 12, bottom: 38 },
      xAxis: {
        type: 'category',
        data: timestamps.map((ts) => formatTimeBucket(ts, interval)),
        axisLabel: { color: chartTheme.axisLabelColor, fontSize: 10 },
        axisLine: chartTheme.axisLine,
      },
      yAxis: buildByteValueAxis(peakStacked, chartTheme, 10),
      series: seriesList.map((s, idx) => ({
        name: s.label || s.name,
        type: 'bar',
        stack: 'total',
        barMaxWidth: 22,
        itemStyle: {
          color: chartTheme.barItemColor(chartTheme.palette[idx % chartTheme.palette.length]),
          borderRadius: [2, 2, 0, 0],
        },
        data: s.values,
      })),
    }
  }, [mode, appDetail, domainDetail, chartTheme])

  const sankeyOption = useMemo<echarts.EChartsCoreOption>(() => {
    const nodes = appDetail?.sankey?.nodes ?? []
    const links = appDetail?.sankey?.links ?? []
    const stripPrefix = (name: string) => name.replace(/^(app|dom|eg):/, '')

    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: chartTheme.tooltip.backgroundColor,
        borderColor: chartTheme.tooltip.borderColor,
        textStyle: chartTheme.tooltip.textStyle,
        formatter: (params: unknown) => {
          const p = params as { dataType?: string; name?: string; value?: number; data?: { source?: string; target?: string } }
          if (p.dataType === 'edge' && p.data) {
            return `${stripPrefix(p.data.source || '')} → ${stripPrefix(p.data.target || '')}<br/><b>${formatBytes(p.value)}</b>`
          }
          return `${stripPrefix(p.name || '')}<br/><b>${formatBytes(p.value)}</b>`
        },
      },
      series: [
        {
          type: 'sankey',
          left: 10,
          right: 110,
          top: 10,
          bottom: 10,
          nodeWidth: 12,
          nodeGap: 10,
          emphasis: { focus: 'adjacency' },
          lineStyle: { color: 'gradient', curveness: 0.45, opacity: 0.35 },
          label: {
            color: chartTheme.textPrimary,
            fontSize: 11,
            formatter: (p: { name: string }) => stripPrefix(p.name),
          },
          data: nodes.map((n) => ({
            name: n.name,
            itemStyle: {
              color:
                n.stage === 'app'
                  ? chartTheme.sankeyColors.app
                  : n.stage === 'domain'
                    ? chartTheme.sankeyColors.domain
                    : n.name.includes('DIRECT')
                      ? chartTheme.sankeyColors.direct
                      : chartTheme.sankeyColors.proxy,
            },
          })),
          links,
        },
      ],
    }
  }, [appDetail, chartTheme])

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const setAllExpanded = (keys: string[], expanded: boolean) => {
    if (!expanded) {
      setExpandedKeys({})
      return
    }
    const next: Record<string, boolean> = {}
    for (const k of keys) next[k] = true
    setExpandedKeys(next)
  }

  return (
    <div className="space-y-4">
      {/* Header Mode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold tracking-tight">应用 × 网站 流量透视</h1>
          <p className="text-xs text-[var(--cl-text-muted)]">
            彻底看清某个程序（如 Chrome）到底访问了哪些网站与子域名、走了哪条节点或 TUN 出口
          </p>
        </div>

        <div className="cl-segment">
          <button
            type="button"
            onClick={() => setMode('app')}
            className={`cl-segment-item ${mode === 'app' ? 'cl-segment-item-active' : ''}`}
            style={mode === 'app' ? { color: 'var(--cl-accent-primary)' } : undefined}
          >
            <Layers className="h-3 w-3" />
            按应用查网站
          </button>
          <button
            type="button"
            onClick={() => setMode('domain')}
            className={`cl-segment-item ${mode === 'domain' ? 'cl-segment-item-active' : ''}`}
            style={mode === 'domain' ? { color: 'var(--cl-accent-primary)' } : undefined}
          >
            <Globe className="h-3 w-3" />
            按网站查应用
          </button>
        </div>
      </div>

      {/* Master-Detail Split Layout */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Left List */}
        <div className="cl-card flex w-full shrink-0 flex-col rounded-xl p-3 lg:w-[330px]">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--cl-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={mode === 'app' ? '搜索应用进程名...' : '搜索主域名或服务标签...'}
              className="cl-input w-full pl-8 pr-3"
            />
          </div>

          <div className="cl-list-stack max-h-[680px] space-y-1.5 overflow-y-auto pr-1">
            {mode === 'app' ? (
              !appsList || appsList.items.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--cl-text-muted)]">暂无应用数据</div>
              ) : (
                appsList.items.map((item) => {
                  const active = item.process_display === selectedApp
                  return (
                    <button
                      type="button"
                      key={item.process_display}
                      onClick={() => setSelectedApp(item.process_display)}
                      className="w-full cursor-pointer rounded-lg border p-2.5 text-left transition hover:border-[var(--cl-border-focus)]"
                      style={{
                        borderColor: active ? 'var(--cl-border-focus)' : 'var(--cl-border-subtle)',
                        backgroundColor: active ? 'var(--cl-accent-soft)' : 'var(--cl-bg-sidebar)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-xs font-semibold">{item.process_display}</span>
                          {item.tun_bytes > 0 && (
                            <span
                              className="rounded px-1 py-0.5 font-mono text-[9px]"
                              style={{
                                backgroundColor: 'var(--cl-accent-soft)',
                                color: 'var(--cl-accent-primary)',
                              }}
                            >
                              TUN
                            </span>
                          )}
                        </div>
                        <span
                          className="shrink-0 font-mono text-xs font-bold tabular-nums"
                          style={{ color: 'var(--cl-accent-primary)' }}
                        >
                          {formatBytes(item.total_bytes)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--cl-text-muted)]">
                        <span className="truncate font-mono">
                          {item.top_domains.slice(0, 2).map((d) => d.root_domain).join(', ') || '-'}
                        </span>
                        <span className="shrink-0 font-mono">{item.domain_count} 域名</span>
                      </div>
                      <div
                        className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
                        style={{ backgroundColor: 'var(--cl-border-subtle)' }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(2, item.share_pct)}%`,
                            backgroundColor: 'var(--cl-accent-primary)',
                          }}
                        />
                      </div>
                    </button>
                  )
                })
              )
            ) : !domainsList || domainsList.items.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--cl-text-muted)]">暂无域名数据</div>
            ) : (
              domainsList.items.map((item) => {
                const active = item.root_domain === selectedDomain
                return (
                  <button
                    type="button"
                    key={item.root_domain}
                    onClick={() => setSelectedDomain(item.root_domain)}
                    className="w-full cursor-pointer rounded-lg border p-2.5 text-left transition hover:border-[var(--cl-border-focus)]"
                    style={{
                      borderColor: active ? 'var(--cl-border-focus)' : 'var(--cl-border-subtle)',
                      backgroundColor: active ? 'var(--cl-accent-soft)' : 'var(--cl-bg-sidebar)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs font-semibold">{item.root_domain}</span>
                      <span
                        className="shrink-0 font-mono text-xs font-bold tabular-nums"
                        style={{ color: 'var(--cl-accent-primary)' }}
                      >
                        {formatBytes(item.total_bytes)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--cl-text-muted)]">
                      <span className="truncate">
                        {item.service_tag || item.top_apps.map((a) => a.process_display).join(', ')}
                      </span>
                      <span className="shrink-0 font-mono">{item.app_count} 应用</span>
                    </div>
                    <div
                      className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: 'var(--cl-border-subtle)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(2, item.share_pct)}%`,
                          backgroundColor: 'var(--cl-accent-primary)',
                        }}
                      />
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Right Detail Panel */}
        <div className="min-w-0 flex-1 space-y-4">
          {mode === 'app' && appDetail ? (
            <>
              {/* App Summary Header */}
              <div className="cl-card grid gap-3 rounded-xl p-4 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-[var(--cl-text-muted)]">应用总流量</div>
                  <div className="mt-1 font-mono text-xl font-bold tabular-nums">
                    {formatBytes(appDetail.summary.total_bytes)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--cl-text-muted)]">{appDetail.process_display}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--cl-text-muted)]">代理 / 直连</div>
                  <div className="mt-1 font-mono text-sm font-semibold tabular-nums">
                    <span style={{ color: 'var(--cl-accent-primary)' }}>
                      {formatBytes(appDetail.summary.proxy_bytes)}
                    </span>
                    <span className="mx-1 text-[var(--cl-text-muted)]">/</span>
                    <span style={{ color: 'var(--cl-status-success)' }}>
                      {formatBytes(appDetail.summary.direct_bytes)}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[var(--cl-text-muted)]">
                    TUN {formatBytes(appDetail.summary.tun_bytes)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--cl-text-muted)]">下行 / 上行</div>
                  <div
                    className="mt-1 font-mono text-sm font-semibold tabular-nums"
                    style={{ color: chartTheme.liveColors.down }}
                  >
                    ↓ {formatBytes(appDetail.summary.down_bytes)}
                  </div>
                  <div
                    className="mt-0.5 font-mono text-[11px] tabular-nums"
                    style={{ color: chartTheme.liveColors.up }}
                  >
                    ↑ {formatBytes(appDetail.summary.up_bytes)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--cl-text-muted)]">关联主域名 / 连接数</div>
                  <div className="mt-1 font-mono text-xl font-bold tabular-nums">
                    {appDetail.summary.domain_count}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[var(--cl-text-muted)]">
                    {formatNumber(appDetail.summary.conn_count)} 次连接
                  </div>
                </div>
              </div>

              {/* Timeline & Sankey */}
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="cl-card rounded-xl p-4">
                  <div className="mb-2 text-xs font-semibold">分时网站消耗趋势</div>
                  <EChartBox option={timelineOption} className="h-[240px] w-full" />
                </div>
                <div className="cl-card rounded-xl p-4">
                  <div className="mb-2 text-xs font-semibold">流量去向桑基图（应用 → 主域名 → 出口）</div>
                  {appDetail.sankey.nodes.length > 0 ? (
                    <EChartBox option={sankeyOption} className="h-[240px] w-full" />
                  ) : (
                    <div className="flex h-[240px] items-center justify-center text-xs text-[var(--cl-text-muted)]">
                      暂无足够流向数据
                    </div>
                  )}
                </div>
              </div>

              {/* Expandable Root Domains -> Subdomains Table */}
              <div className="cl-card overflow-hidden rounded-xl">
                <div
                  className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
                  style={{ borderColor: 'var(--cl-border-subtle)' }}
                >
                  <h3 className="text-sm font-semibold">访问网站明细（点击任意主域名展开精确子域名与节点）</h3>
                  {appDetail.root_domains.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setAllExpanded(
                            appDetail.root_domains.map((g) => g.root_domain),
                            true,
                          )
                        }
                        className="cl-btn-secondary !h-6 !px-2 !text-[11px]"
                      >
                        全部展开
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllExpanded([], false)}
                        className="cl-btn-secondary !h-6 !px-2 !text-[11px]"
                      >
                        全部收起
                      </button>
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead
                      className="border-b bg-[var(--cl-bg-sidebar)] text-[var(--cl-text-muted)]"
                      style={{ borderColor: 'var(--cl-border-subtle)' }}
                    >
                      <tr>
                        <th className="px-4 py-2.5 font-medium">主域名 / 服务</th>
                        <th className="px-4 py-2.5 text-right font-medium">总流量</th>
                        <th className="px-4 py-2.5 text-right font-medium">占比</th>
                        <th className="px-4 py-2.5 text-right font-medium">代理</th>
                        <th className="px-4 py-2.5 text-right font-medium">直连</th>
                        <th className="px-4 py-2.5 text-right font-medium">下行 / 上行</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cl-border-subtle)]">
                      {appDetail.root_domains.map((grp) => {
                        const open = !!expandedKeys[grp.root_domain]
                        return (
                          <Fragment key={grp.root_domain}>
                            <tr
                              onClick={() => toggleExpand(grp.root_domain)}
                              className="cursor-pointer transition hover:bg-[var(--cl-bg-surface-hover)]"
                            >
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  {open ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-[var(--cl-text-muted)]" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-[var(--cl-text-muted)]" />
                                  )}
                                  <span className="font-mono font-semibold">{grp.root_domain}</span>
                                  {grp.service_tag && (
                                    <span
                                      className="rounded px-1.5 py-0.5 text-[10px]"
                                      style={{
                                        backgroundColor: 'var(--cl-accent-soft)',
                                        color: 'var(--cl-accent-primary)',
                                      }}
                                    >
                                      {grp.service_tag}
                                    </span>
                                  )}
                                  <span className="font-mono text-[10px] text-[var(--cl-text-muted)]">
                                    ({grp.subdomains.length} 项)
                                  </span>
                                </div>
                              </td>
                              <td
                                className="px-4 py-2.5 text-right font-mono font-bold tabular-nums"
                                style={{ color: 'var(--cl-accent-primary)' }}
                              >
                                {formatBytes(grp.total_bytes)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                                {grp.share_pct.toFixed(1)}%
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-[var(--cl-text-muted)] tabular-nums">
                                {formatBytes(grp.proxy_bytes)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-[var(--cl-text-muted)] tabular-nums">
                                {formatBytes(grp.direct_bytes)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-[11px] tabular-nums">
                                <span style={{ color: chartTheme.liveColors.down }}>
                                  ↓{formatBytes(grp.down_bytes, 1)}
                                </span>{' '}
                                <span style={{ color: chartTheme.liveColors.up }}>
                                  ↑{formatBytes(grp.up_bytes, 1)}
                                </span>
                              </td>
                            </tr>
                            {open &&
                              grp.subdomains.map((sub, sIdx) => (
                                <tr
                                  key={`${grp.root_domain}-${sub.host}-${sub.egress_node}-${sIdx}`}
                                  className="text-[11px]"
                                  style={{ backgroundColor: 'var(--cl-bg-sidebar)' }}
                                >
                                  <td className="py-2 pl-10 pr-4" colSpan={2}>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-mono text-[var(--cl-text-primary)]">
                                        {sub.host === '*' ? '* (低频零散子域名合并)' : sub.host}
                                      </span>
                                      <span
                                        className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                                        style={
                                          sub.route_type === 'PROXY'
                                            ? {
                                                backgroundColor: 'var(--cl-accent-soft)',
                                                color: 'var(--cl-accent-primary)',
                                              }
                                            : sub.route_type === 'DIRECT'
                                              ? {
                                                  backgroundColor: 'var(--cl-bg-surface-hover)',
                                                  color: 'var(--cl-status-success)',
                                                }
                                              : {
                                                  backgroundColor: 'var(--cl-bg-surface-hover)',
                                                  color: 'var(--cl-status-danger)',
                                                }
                                        }
                                      >
                                        {sub.route_type === 'DIRECT' ? 'DIRECT' : sub.egress_node}
                                      </span>
                                      {sub.inbound_mode === 'TUN' && (
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
                                      {sub.rule && (
                                        <span className="font-mono text-[10px] text-[var(--cl-text-muted)]">
                                          规则: {sub.rule}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums">
                                    {formatBytes(sub.total_bytes)}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-[var(--cl-text-muted)] tabular-nums" colSpan={2}>
                                    {formatNumber(sub.conn_count)} 连接
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                                    ↓{formatBytes(sub.down_bytes, 1)} ↑{formatBytes(sub.up_bytes, 1)}
                                  </td>
                                </tr>
                              ))}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : mode === 'domain' && domainDetail ? (
            <>
              <div className="cl-card grid gap-3 rounded-xl p-4 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-[var(--cl-text-muted)]">网站主域名</div>
                  <div className="mt-1 truncate font-mono text-lg font-bold">{domainDetail.root_domain}</div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--cl-accent-primary)' }}>
                    {domainDetail.service_tag || '域名明细'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--cl-text-muted)]">总消耗流量</div>
                  <div
                    className="mt-1 font-mono text-xl font-bold tabular-nums"
                    style={{ color: 'var(--cl-accent-primary)' }}
                  >
                    {formatBytes(domainDetail.summary.total_bytes)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[var(--cl-text-muted)]">
                    代理 {formatBytes(domainDetail.summary.proxy_bytes)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--cl-text-muted)]">下行 / 上行</div>
                  <div
                    className="mt-1 font-mono text-sm font-semibold tabular-nums"
                    style={{ color: chartTheme.liveColors.down }}
                  >
                    ↓ {formatBytes(domainDetail.summary.down_bytes)}
                  </div>
                  <div
                    className="mt-0.5 font-mono text-[11px] tabular-nums"
                    style={{ color: chartTheme.liveColors.up }}
                  >
                    ↑ {formatBytes(domainDetail.summary.up_bytes)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--cl-text-muted)]">访问应用数</div>
                  <div className="mt-1 font-mono text-xl font-bold tabular-nums">
                    {domainDetail.summary.app_count}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[var(--cl-text-muted)]">
                    {formatNumber(domainDetail.summary.conn_count)} 次连接
                  </div>
                </div>
              </div>

              <div className="cl-card rounded-xl p-4">
                <div className="mb-2 text-xs font-semibold">各应用访问趋势</div>
                <EChartBox option={timelineOption} className="h-[240px] w-full" />
              </div>

              <div className="cl-card overflow-hidden rounded-xl">
                <div
                  className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
                  style={{ borderColor: 'var(--cl-border-subtle)' }}
                >
                  <h3 className="text-sm font-semibold">访问该网站的应用列表（点击展开子域名）</h3>
                  {domainDetail.apps.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setAllExpanded(
                            domainDetail.apps.map((a) => a.process_display),
                            true,
                          )
                        }
                        className="cl-btn-secondary !h-6 !px-2 !text-[11px]"
                      >
                        全部展开
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllExpanded([], false)}
                        className="cl-btn-secondary !h-6 !px-2 !text-[11px]"
                      >
                        全部收起
                      </button>
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead
                      className="border-b bg-[var(--cl-bg-sidebar)] text-[var(--cl-text-muted)]"
                      style={{ borderColor: 'var(--cl-border-subtle)' }}
                    >
                      <tr>
                        <th className="px-4 py-2.5 font-medium">应用进程</th>
                        <th className="px-4 py-2.5 text-right font-medium">总流量</th>
                        <th className="px-4 py-2.5 text-right font-medium">占比</th>
                        <th className="px-4 py-2.5 text-right font-medium">代理</th>
                        <th className="px-4 py-2.5 text-right font-medium">下行 / 上行</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cl-border-subtle)]">
                      {domainDetail.apps.map((appRow) => {
                        const open = !!expandedKeys[appRow.process_display]
                        return (
                          <Fragment key={appRow.process_display}>
                            <tr
                              onClick={() => toggleExpand(appRow.process_display)}
                              className="cursor-pointer transition hover:bg-[var(--cl-bg-surface-hover)]"
                            >
                              <td className="px-4 py-2.5 font-semibold">
                                <div className="flex items-center gap-2">
                                  {open ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-[var(--cl-text-muted)]" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-[var(--cl-text-muted)]" />
                                  )}
                                  <span>{appRow.process_display}</span>
                                </div>
                              </td>
                              <td
                                className="px-4 py-2.5 text-right font-mono font-bold tabular-nums"
                                style={{ color: 'var(--cl-accent-primary)' }}
                              >
                                {formatBytes(appRow.total_bytes)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                                {appRow.share_pct.toFixed(1)}%
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-[var(--cl-text-muted)] tabular-nums">
                                {formatBytes(appRow.proxy_bytes)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-[11px] tabular-nums">
                                ↓{formatBytes(appRow.down_bytes, 1)} ↑{formatBytes(appRow.up_bytes, 1)}
                              </td>
                            </tr>
                            {open &&
                              appRow.subdomains.map((sub, sIdx) => (
                                <tr
                                  key={`${appRow.process_display}-${sub.host}-${sIdx}`}
                                  className="text-[11px]"
                                  style={{ backgroundColor: 'var(--cl-bg-sidebar)' }}
                                >
                                  <td className="py-2 pl-10 pr-4" colSpan={2}>
                                    <span className="font-mono">{sub.host}</span>
                                    <span
                                      className="ml-2 rounded px-1.5 py-0.5 font-mono text-[10px]"
                                      style={{ backgroundColor: 'var(--cl-bg-surface-hover)' }}
                                    >
                                      {sub.route_type === 'DIRECT' ? 'DIRECT' : sub.egress_node}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                                    {formatBytes(sub.total_bytes)}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-[var(--cl-text-muted)]" colSpan={2}>
                                    {sub.inbound_mode} · {sub.rule || '-'}
                                  </td>
                                </tr>
                              ))}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="cl-card flex h-64 items-center justify-center rounded-xl text-xs text-[var(--cl-text-muted)]">
              请在左侧选择应用或等待流量数据上报
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
