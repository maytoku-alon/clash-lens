import { Fragment, useEffect, useMemo, useState } from 'react'
import type * as echarts from 'echarts'
import { ChevronDown, ChevronRight, Globe, Layers, Search } from 'lucide-react'
import { api, type QueryParams } from '../api/client'
import { EChartBox } from '../components/EChartBox'
import type {
  AppDetailResponse,
  AppsListResponse,
  DomainDetailResponse,
  DomainsListResponse,
} from '../types/api'
import { formatBytes, formatNumber, formatTimeBucket } from '../utils/format'

const PALETTE = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#71717a']

interface AppsExplorerPageProps {
  query: QueryParams
  initialMode: 'app' | 'domain'
  initialTarget: string
  isDark: boolean
}

export function AppsExplorerPage({
  query,
  initialMode,
  initialTarget,
  isDark,
}: AppsExplorerPageProps) {
  const [mode, setMode] = useState<'app' | 'domain'>(initialMode)
  const [search, setSearch] = useState('')
  const [appsList, setAppsList] = useState<AppsListResponse | null>(null)
  const [domainsList, setDomainsList] = useState<DomainsListResponse | null>(null)
  const [selectedApp, setSelectedApp] = useState(initialMode === 'app' ? initialTarget : '')
  const [selectedDomain, setSelectedDomain] = useState(initialMode === 'domain' ? initialTarget : '')
  const [appDetail, setAppDetail] = useState<AppDetailResponse | null>(null)
  const [domainDetail, setDomainDetail] = useState<DomainDetailResponse | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setMode(initialMode)
    if (initialMode === 'app' && initialTarget) setSelectedApp(initialTarget)
    if (initialMode === 'domain' && initialTarget) setSelectedDomain(initialTarget)
  }, [initialMode, initialTarget])

  // Load master list
  useEffect(() => {
    let alive = true
    if (mode === 'app') {
      api
        .apps(query, search, 80)
        .then((res) => {
          if (!alive) return
          setAppsList(res)
          if (res.items.length > 0) {
            setSelectedApp((prev) =>
              prev && res.items.some((x) => x.process_display === prev) ? prev : res.items[0].process_display,
            )
          } else {
            setSelectedApp('')
            setAppDetail(null)
          }
        })
        .catch(() => {})
    } else {
      api
        .domains(query, search, 80)
        .then((res) => {
          if (!alive) return
          setDomainsList(res)
          if (res.items.length > 0) {
            setSelectedDomain((prev) =>
              prev && res.items.some((x) => x.root_domain === prev) ? prev : res.items[0].root_domain,
            )
          } else {
            setSelectedDomain('')
            setDomainDetail(null)
          }
        })
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [mode, search, query.deviceId, query.scope, query.from, query.to])

  // Load detail pane
  useEffect(() => {
    let alive = true
    setExpandedKeys({})
    if (mode === 'app' && selectedApp) {
      api
        .appDetail(query, selectedApp)
        .then((d) => {
          if (alive) setAppDetail(d)
        })
        .catch(() => {})
    } else if (mode === 'domain' && selectedDomain) {
      api
        .domainDetail(query, selectedDomain)
        .then((d) => {
          if (alive) setDomainDetail(d)
        })
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [mode, selectedApp, selectedDomain, query.deviceId, query.scope, query.from, query.to])

  const timelineOption = useMemo<echarts.EChartsCoreOption>(() => {
    const tl = mode === 'app' ? appDetail?.timeline : domainDetail?.timeline
    const timestamps = tl?.timestamps ?? []
    const interval = tl?.interval ?? 'hour'
    const textColor = isDark ? '#a1a1aa' : '#64748b'
    const gridLine = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)'
    return {
      color: PALETTE,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        backgroundColor: isDark ? '#141419' : '#ffffff',
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
        textStyle: { color: isDark ? '#fafafa' : '#0f172a', fontSize: 12 },
        valueFormatter: (val: unknown) => formatBytes(Number(val)),
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        textStyle: { color: textColor, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
      },
      grid: { top: 12, left: 52, right: 12, bottom: 38 },
      xAxis: {
        type: 'category',
        data: timestamps.map((ts) => formatTimeBucket(ts, interval)),
        axisLabel: { color: textColor, fontSize: 10 },
        axisLine: { lineStyle: { color: gridLine } },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: gridLine } },
        axisLabel: { color: textColor, fontSize: 10, formatter: (v: number) => formatBytes(v, 0) },
      },
      series: (tl?.series ?? []).map((s) => ({
        name: s.label || s.name,
        type: 'bar',
        stack: 'total',
        barMaxWidth: 22,
        data: s.values,
      })),
    }
  }, [mode, appDetail, domainDetail, isDark])

  const sankeyOption = useMemo<echarts.EChartsCoreOption>(() => {
    const nodes = appDetail?.sankey?.nodes ?? []
    const links = appDetail?.sankey?.links ?? []
    const textColor = isDark ? '#e4e4e7' : '#1e293b'
    const stripPrefix = (name: string) => name.replace(/^(app|dom|eg):/, '')

    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: isDark ? '#141419' : '#ffffff',
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
        textStyle: { color: isDark ? '#fafafa' : '#0f172a', fontSize: 12 },
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
            color: textColor,
            fontSize: 11,
            formatter: (p: { name: string }) => stripPrefix(p.name),
          },
          data: nodes.map((n) => ({
            name: n.name,
            itemStyle: {
              color:
                n.stage === 'app'
                  ? '#10b981'
                  : n.stage === 'domain'
                    ? '#06b6d4'
                    : n.name.includes('DIRECT')
                      ? '#6366f1'
                      : '#8b5cf6',
            },
          })),
          links,
        },
      ],
    }
  }, [appDetail, isDark])

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="space-y-4">
      {/* Header Mode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold tracking-tight">应用 × 网站 流量透视</h1>
          <p className="text-xs text-[var(--cl-muted)]">
            彻底看清某个程序（如 Chrome）到底访问了哪些网站与子域名、走了哪条节点或 TUN 出口
          </p>
        </div>

        <div className="cl-segment">
          <button
            type="button"
            onClick={() => setMode('app')}
            className={`cl-segment-item ${
              mode === 'app' ? 'cl-segment-item-active !text-emerald-400' : ''
            }`}
          >
            <Layers className="h-3 w-3" />
            按应用查网站
          </button>
          <button
            type="button"
            onClick={() => setMode('domain')}
            className={`cl-segment-item ${
              mode === 'domain' ? 'cl-segment-item-active !text-cyan-400' : ''
            }`}
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
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--cl-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={mode === 'app' ? '搜索应用进程名...' : '搜索主域名或服务标签...'}
              className="cl-input w-full pl-8 pr-3"
            />
          </div>

          <div className="max-h-[680px] space-y-1.5 overflow-y-auto pr-1">
            {mode === 'app' ? (
              !appsList || appsList.items.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--cl-muted)]">暂无应用数据</div>
              ) : (
                appsList.items.map((item) => {
                  const active = item.process_display === selectedApp
                  return (
                    <button
                      key={item.process_display}
                      onClick={() => setSelectedApp(item.process_display)}
                      className={`w-full rounded-lg border p-2.5 text-left transition ${
                        active
                          ? 'border-emerald-500/50 bg-emerald-500/10'
                          : 'border-[var(--cl-border)] bg-[var(--cl-surface)] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-xs font-semibold">{item.process_display}</span>
                          {item.tun_bytes > 0 && (
                            <span className="rounded bg-cyan-500/15 px-1 py-0.5 font-mono text-[9px] text-cyan-400">
                              TUN
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 font-mono text-xs font-bold text-emerald-400 tabular-nums">
                          {formatBytes(item.total_bytes)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--cl-muted)]">
                        <span className="truncate font-mono">
                          {item.top_domains.slice(0, 2).map((d) => d.root_domain).join(', ') || '-'}
                        </span>
                        <span className="shrink-0 font-mono">{item.domain_count} 域名</span>
                      </div>
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.max(2, item.share_pct)}%` }}
                        />
                      </div>
                    </button>
                  )
                })
              )
            ) : !domainsList || domainsList.items.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--cl-muted)]">暂无域名数据</div>
            ) : (
              domainsList.items.map((item) => {
                const active = item.root_domain === selectedDomain
                return (
                  <button
                    key={item.root_domain}
                    onClick={() => setSelectedDomain(item.root_domain)}
                    className={`w-full rounded-lg border p-2.5 text-left transition ${
                      active
                        ? 'border-cyan-500/50 bg-cyan-500/10'
                        : 'border-[var(--cl-border)] bg-[var(--cl-surface)] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs font-semibold">{item.root_domain}</span>
                      <span className="shrink-0 font-mono text-xs font-bold text-cyan-400 tabular-nums">
                        {formatBytes(item.total_bytes)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--cl-muted)]">
                      <span className="truncate">
                        {item.service_tag || item.top_apps.map((a) => a.process_display).join(', ')}
                      </span>
                      <span className="shrink-0 font-mono">{item.app_count} 应用</span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-cyan-500"
                        style={{ width: `${Math.max(2, item.share_pct)}%` }}
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
                  <div className="text-xs text-[var(--cl-muted)]">应用总流量</div>
                  <div className="mt-1 font-mono text-xl font-bold tabular-nums">
                    {formatBytes(appDetail.summary.total_bytes)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--cl-muted)]">{appDetail.process_display}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--cl-muted)]">代理 / 直连</div>
                  <div className="mt-1 font-mono text-sm font-semibold tabular-nums">
                    <span className="text-emerald-400">{formatBytes(appDetail.summary.proxy_bytes)}</span>
                    <span className="mx-1 text-[var(--cl-muted)]">/</span>
                    <span className="text-indigo-400">{formatBytes(appDetail.summary.direct_bytes)}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[var(--cl-muted)]">
                    TUN {formatBytes(appDetail.summary.tun_bytes)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--cl-muted)]">下行 / 上行</div>
                  <div className="mt-1 font-mono text-sm font-semibold tabular-nums">
                    <span className="text-cyan-400">↓ {formatBytes(appDetail.summary.down_bytes)}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-violet-400 tabular-nums">
                    ↑ {formatBytes(appDetail.summary.up_bytes)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--cl-muted)]">关联主域名 / 连接数</div>
                  <div className="mt-1 font-mono text-xl font-bold tabular-nums">
                    {appDetail.summary.domain_count}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[var(--cl-muted)]">
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
                    <div className="flex h-[240px] items-center justify-center text-xs text-[var(--cl-muted)]">
                      暂无足够流向数据
                    </div>
                  )}
                </div>
              </div>

              {/* Expandable Root Domains -> Subdomains Table */}
              <div className="cl-card overflow-hidden rounded-xl">
                <div className="border-b border-[var(--cl-border)] px-4 py-3">
                  <h3 className="text-sm font-semibold">访问网站明细（点击任意主域名展开精确子域名与节点）</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[var(--cl-border)] bg-[var(--cl-surface)] text-[var(--cl-muted)]">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">主域名 / 服务</th>
                        <th className="px-4 py-2.5 font-medium text-right">总流量</th>
                        <th className="px-4 py-2.5 font-medium text-right">占比</th>
                        <th className="px-4 py-2.5 font-medium text-right">代理</th>
                        <th className="px-4 py-2.5 font-medium text-right">直连</th>
                        <th className="px-4 py-2.5 font-medium text-right">下行 / 上行</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cl-border)]">
                      {appDetail.root_domains.map((grp) => {
                        const open = !!expandedKeys[grp.root_domain]
                        return (
                          <Fragment key={grp.root_domain}>
                            <tr
                              onClick={() => toggleExpand(grp.root_domain)}
                              className="cursor-pointer transition hover:bg-[var(--cl-hover)]"
                            >
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  {open ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-[var(--cl-muted)]" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-[var(--cl-muted)]" />
                                  )}
                                  <span className="font-mono font-semibold">{grp.root_domain}</span>
                                  {grp.service_tag && (
                                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
                                      {grp.service_tag}
                                    </span>
                                  )}
                                  <span className="font-mono text-[10px] text-[var(--cl-muted)]">
                                    ({grp.subdomains.length} 项)
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400 tabular-nums">
                                {formatBytes(grp.total_bytes)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                                {grp.share_pct.toFixed(1)}%
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-[var(--cl-muted)] tabular-nums">
                                {formatBytes(grp.proxy_bytes)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-[var(--cl-muted)] tabular-nums">
                                {formatBytes(grp.direct_bytes)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-[11px] tabular-nums">
                                <span className="text-cyan-400">↓{formatBytes(grp.down_bytes, 1)}</span>{' '}
                                <span className="text-violet-400">↑{formatBytes(grp.up_bytes, 1)}</span>
                              </td>
                            </tr>
                            {open &&
                              grp.subdomains.map((sub, sIdx) => (
                                <tr
                                  key={`${grp.root_domain}-${sub.host}-${sub.egress_node}-${sIdx}`}
                                  className="bg-[var(--cl-bg)]/60 text-[11px]"
                                >
                                  <td className="py-2 pl-10 pr-4" colSpan={2}>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-mono text-[var(--cl-text)]">
                                        {sub.host === '*' ? '* (低频零散子域名合并)' : sub.host}
                                      </span>
                                      <span
                                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                                          sub.route_type === 'PROXY'
                                            ? 'bg-emerald-500/15 text-emerald-400'
                                            : sub.route_type === 'DIRECT'
                                              ? 'bg-indigo-500/15 text-indigo-400'
                                              : 'bg-rose-500/15 text-rose-400'
                                        }`}
                                      >
                                        {sub.route_type === 'DIRECT' ? 'DIRECT' : sub.egress_node}
                                      </span>
                                      {sub.inbound_mode === 'TUN' && (
                                        <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] text-cyan-400">
                                          TUN
                                        </span>
                                      )}
                                      {sub.rule && (
                                        <span className="font-mono text-[10px] text-[var(--cl-muted)]">
                                          规则: {sub.rule}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums">
                                    {formatBytes(sub.total_bytes)}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-[var(--cl-muted)] tabular-nums" colSpan={2}>
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
                  <div className="text-xs text-[var(--cl-muted)]">网站主域名</div>
                  <div className="mt-1 truncate font-mono text-lg font-bold">{domainDetail.root_domain}</div>
                  <div className="mt-0.5 text-[11px] text-cyan-400">{domainDetail.service_tag || '域名明细'}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--cl-muted)]">总消耗流量</div>
                  <div className="mt-1 font-mono text-xl font-bold text-cyan-400 tabular-nums">
                    {formatBytes(domainDetail.summary.total_bytes)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[var(--cl-muted)]">
                    代理 {formatBytes(domainDetail.summary.proxy_bytes)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--cl-muted)]">下行 / 上行</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-cyan-400 tabular-nums">
                    ↓ {formatBytes(domainDetail.summary.down_bytes)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-violet-400 tabular-nums">
                    ↑ {formatBytes(domainDetail.summary.up_bytes)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--cl-muted)]">访问应用数</div>
                  <div className="mt-1 font-mono text-xl font-bold tabular-nums">
                    {domainDetail.summary.app_count}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[var(--cl-muted)]">
                    {formatNumber(domainDetail.summary.conn_count)} 次连接
                  </div>
                </div>
              </div>

              <div className="cl-card rounded-xl p-4">
                <div className="mb-2 text-xs font-semibold">各应用访问趋势</div>
                <EChartBox option={timelineOption} className="h-[240px] w-full" />
              </div>

              <div className="cl-card overflow-hidden rounded-xl">
                <div className="border-b border-[var(--cl-border)] px-4 py-3">
                  <h3 className="text-sm font-semibold">访问该网站的应用列表（点击展开子域名）</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[var(--cl-border)] bg-[var(--cl-surface)] text-[var(--cl-muted)]">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">应用进程</th>
                        <th className="px-4 py-2.5 font-medium text-right">总流量</th>
                        <th className="px-4 py-2.5 font-medium text-right">占比</th>
                        <th className="px-4 py-2.5 font-medium text-right">代理</th>
                        <th className="px-4 py-2.5 font-medium text-right">下行 / 上行</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cl-border)]">
                      {domainDetail.apps.map((appRow) => {
                        const open = !!expandedKeys[appRow.process_display]
                        return (
                          <Fragment key={appRow.process_display}>
                            <tr
                              onClick={() => toggleExpand(appRow.process_display)}
                              className="cursor-pointer transition hover:bg-[var(--cl-hover)]"
                            >
                              <td className="px-4 py-2.5 font-semibold">
                                <div className="flex items-center gap-2">
                                  {open ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-[var(--cl-muted)]" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-[var(--cl-muted)]" />
                                  )}
                                  <span>{appRow.process_display}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-cyan-400 tabular-nums">
                                {formatBytes(appRow.total_bytes)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                                {appRow.share_pct.toFixed(1)}%
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-[var(--cl-muted)] tabular-nums">
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
                                  className="bg-[var(--cl-bg)]/60 text-[11px]"
                                >
                                  <td className="py-2 pl-10 pr-4" colSpan={2}>
                                    <span className="font-mono">{sub.host}</span>
                                    <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">
                                      {sub.route_type === 'DIRECT' ? 'DIRECT' : sub.egress_node}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                                    {formatBytes(sub.total_bytes)}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-[var(--cl-muted)]" colSpan={2}>
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
            <div className="cl-card flex h-64 items-center justify-center rounded-xl text-xs text-[var(--cl-muted)]">
              请在左侧选择应用或等待流量数据上报
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
