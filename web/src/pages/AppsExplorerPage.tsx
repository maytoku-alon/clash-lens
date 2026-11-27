import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type * as echarts from 'echarts'
import { Check, ChevronDown, ChevronRight, Copy, Filter, Globe, Layers, Search, X } from 'lucide-react'
import { maxStackedSeriesValue } from '../adapters/trafficAdapter'
import type { QueryParams } from '../api/trafficApi'
import { EChartBox } from '../components/EChartBox'
import { useAppsExplorerData } from '../hooks/useDashboardQueries'
import { buildByteValueAxis, buildChartTheme } from '../theme/chartAdapter'
import { useTheme } from '../theme/ThemeProvider'
import { formatBytes, formatNumber, formatTimeBucket } from '../utils/format'
import {
  formatClashRule,
  isMatchFallbackRule,
  maskHostOrDomain,
  maskRuleText,
  type ClashRuleFormat,
} from '../utils/privacy'

interface AppsExplorerPageProps {
  query: QueryParams
  initialMode: 'app' | 'domain'
  initialTarget: string
}

async function copyTextSafe(text: string): Promise<boolean> {
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

export function AppsExplorerPage({
  query,
  initialMode,
  initialTarget,
}: AppsExplorerPageProps) {
  const { theme, tokens, colorMode, privacyMode } = useTheme()
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
  const [onlyMatch, setOnlyMatch] = useState(false)
  const [ruleFormat, setRuleFormat] = useState<ClashRuleFormat>('yaml')
  const [sankeyFilter, setSankeyFilter] = useState<{ stage: 'domain' | 'egress'; value: string } | null>(null)
  const [copiedRuleKey, setCopiedRuleKey] = useState('')
  const [ruleToast, setRuleToast] = useState('')
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Bug #3 fix: only reset expanded rows & Sankey node filter when switching active target, NEVER on 30s refresh
  useEffect(() => {
    setExpandedKeys({})
    setSankeyFilter(null)
  }, [mode, selectedApp, selectedDomain])

  const handleCopyRule = async (rowKey: string, targetHost: string) => {
    const ruleStr = formatClashRule(targetHost, ruleFormat)
    const ok = await copyTextSafe(ruleStr)
    if (!ok) {
      setRuleToast('复制失败，请检查浏览器剪贴板权限')
    } else {
      setCopiedRuleKey(rowKey)
      setTimeout(() => setCopiedRuleKey((prev) => (prev === rowKey ? '' : prev)), 1600)
      setRuleToast(
        privacyMode
          ? `已复制分流规则（${ruleFormat === 'yaml' ? 'YAML' : 'Verge JS'}）`
          : `已复制规则: ${ruleStr}`,
      )
    }
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setRuleToast(''), 2200)
  }

  const timelineOption = useMemo<echarts.EChartsCoreOption>(() => {
    const tl = mode === 'app' ? appDetail?.timeline : domainDetail?.timeline
    const timestamps = tl?.timestamps ?? []
    const interval = tl?.interval ?? 'hour'
    const seriesList = tl?.series ?? []
    const peakStacked = maxStackedSeriesValue(seriesList)
    const seriesNames = seriesList.map((s) => {
      const raw = s.label || s.name
      return mode === 'app' ? maskHostOrDomain(raw, privacyMode) : raw
    })

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
        name: seriesNames[idx],
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
  }, [mode, appDetail, domainDetail, chartTheme, privacyMode])

  const sankeyOption = useMemo<echarts.EChartsCoreOption>(() => {
    const nodes = appDetail?.sankey?.nodes ?? []
    const links = appDetail?.sankey?.links ?? []
    const stripPrefix = (name: string) => name.replace(/^(app|dom|eg):/, '')
    const formatNodeDisplay = (rawName: string) => {
      const clean = stripPrefix(rawName)
      return rawName.startsWith('dom:') ? maskHostOrDomain(clean, privacyMode) : clean
    }

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
            return `${formatNodeDisplay(p.data.source || '')} → ${formatNodeDisplay(p.data.target || '')}<br/><b>${formatBytes(p.value)}</b>`
          }
          return `${formatNodeDisplay(p.name || '')}<br/><b>${formatBytes(p.value)}</b>`
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
            formatter: (p: { name: string }) => formatNodeDisplay(p.name),
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
  }, [appDetail, chartTheme, privacyMode])

  const handleSankeyReady = (chart: echarts.ECharts) => {
    chart.on('click', (params: unknown) => {
      const p = params as { dataType?: string; name?: string }
      if (p.dataType !== 'node' || !p.name) return
      if (p.name.startsWith('dom:')) {
        const val = p.name.slice(4)
        setSankeyFilter((prev) => (prev?.stage === 'domain' && prev.value === val ? null : { stage: 'domain', value: val }))
      } else if (p.name.startsWith('eg:')) {
        const val = p.name.slice(3)
        setSankeyFilter((prev) => (prev?.stage === 'egress' && prev.value === val ? null : { stage: 'egress', value: val }))
      }
    })
  }

  const filteredRootDomains = useMemo(() => {
    const raw = appDetail?.root_domains ?? []
    return raw
      .filter((grp) => (sankeyFilter?.stage === 'domain' ? grp.root_domain === sankeyFilter.value : true))
      .map((grp) => {
        const subs = grp.subdomains.filter((sub) => {
          if (onlyMatch && !isMatchFallbackRule(sub.rule)) return false
          if (sankeyFilter?.stage === 'egress') {
            const egressLabel = sub.route_type === 'DIRECT' ? 'DIRECT' : sub.egress_node
            if (egressLabel !== sankeyFilter.value) return false
          }
          return true
        })
        return { ...grp, subdomains: subs }
      })
      .filter((grp) => grp.subdomains.length > 0)
  }, [appDetail?.root_domains, onlyMatch, sankeyFilter])

  const filteredDomainApps = useMemo(() => {
    const raw = domainDetail?.apps ?? []
    if (!onlyMatch) return raw
    return raw
      .map((a) => ({
        ...a,
        subdomains: a.subdomains.filter((sub) => isMatchFallbackRule(sub.rule)),
      }))
      .filter((a) => a.subdomains.length > 0)
  }, [domainDetail?.apps, onlyMatch])

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

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyMatch((v) => !v)}
            className={onlyMatch ? 'cl-btn-accent !h-7' : 'cl-btn-secondary !h-7'}
            title="仅筛选命中共用 MATCH 兜底规则的明细条目"
          >
            <Filter className="h-3 w-3" />
            仅看兜底流量 (MATCH)
          </button>

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
      </div>

      {/* Master-Detail Split Layout */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left List */}
        <div
          data-testid="apps-left-card"
          className="cl-card flex w-full shrink-0 flex-col rounded-xl p-3 lg:h-[934px] lg:w-[330px]"
        >
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

          <div className="cl-thin-scroll flex max-h-[680px] min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 lg:max-h-none">
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
                      data-testid="apps-left-item"
                      onClick={() => setSelectedApp(item.process_display)}
                      className="flex h-[74px] w-full shrink-0 cursor-pointer flex-col justify-between rounded-lg border p-2.5 text-left transition hover:border-[var(--cl-border-focus)]"
                      style={{
                        borderColor: active ? 'var(--cl-border-focus)' : 'var(--cl-border-subtle)',
                        backgroundColor: active ? 'var(--cl-accent-soft)' : 'var(--cl-bg-sidebar)',
                      }}
                    >
                      <div className="flex h-5 items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-xs font-semibold">{item.process_display}</span>
                          {item.tun_bytes > 0 && (
                            <span
                              className="shrink-0 rounded px-1 py-0.5 font-mono text-[9px] leading-none"
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
                      <div className="flex h-4 items-center justify-between gap-2 text-[11px] text-[var(--cl-text-muted)]">
                        <span className="truncate font-mono">
                          {item.top_domains.slice(0, 2).map((d) => maskHostOrDomain(d.root_domain, privacyMode)).join(', ') || '-'}
                        </span>
                        <span className="shrink-0 font-mono">{item.domain_count} 域名</span>
                      </div>
                      <div
                        className="h-1 w-full overflow-hidden rounded-full"
                        style={{ backgroundColor: 'var(--cl-border-subtle)' }}
                      >
                        <div
                          className="cl-progress-fill h-full rounded-full"
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
                    data-testid="apps-left-item"
                    onClick={() => setSelectedDomain(item.root_domain)}
                    className="flex h-[74px] w-full shrink-0 cursor-pointer flex-col justify-between rounded-lg border p-2.5 text-left transition hover:border-[var(--cl-border-focus)]"
                    style={{
                      borderColor: active ? 'var(--cl-border-focus)' : 'var(--cl-border-subtle)',
                      backgroundColor: active ? 'var(--cl-accent-soft)' : 'var(--cl-bg-sidebar)',
                    }}
                  >
                    <div className="flex h-5 items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs font-semibold">
                        {maskHostOrDomain(item.root_domain, privacyMode)}
                      </span>
                      <span
                        className="shrink-0 font-mono text-xs font-bold tabular-nums"
                        style={{ color: 'var(--cl-accent-primary)' }}
                      >
                        {formatBytes(item.total_bytes)}
                      </span>
                    </div>
                    <div className="flex h-4 items-center justify-between gap-2 text-[11px] text-[var(--cl-text-muted)]">
                      <span className="truncate">
                        {item.service_tag || item.top_apps.map((a) => a.process_display).join(', ')}
                      </span>
                      <span className="shrink-0 font-mono">{item.app_count} 应用</span>
                    </div>
                    <div
                      className="h-1 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: 'var(--cl-border-subtle)' }}
                    >
                      <div
                        className="cl-progress-fill h-full rounded-full"
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
              <div className="cl-card grid min-h-[96px] items-center gap-3 rounded-xl p-4 sm:grid-cols-4">
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
                    <span style={{ color: chartTheme.routeColors.PROXY }}>
                      {formatBytes(appDetail.summary.proxy_bytes)}
                    </span>
                    <span className="mx-1 text-[var(--cl-text-muted)]">/</span>
                    <span style={{ color: chartTheme.routeColors.DIRECT }}>
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
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold">流量去向桑基图（应用 → 主域名 → 出口）</div>
                    <span className="text-[10px] text-[var(--cl-text-muted)]">点击主域名或出口可筛选下表</span>
                  </div>
                  {appDetail.sankey.nodes.length > 0 ? (
                    <EChartBox option={sankeyOption} className="h-[240px] w-full" onChartReady={handleSankeyReady} />
                  ) : (
                    <div className="flex h-[240px] items-center justify-center text-xs text-[var(--cl-text-muted)]">
                      暂无足够流向数据
                    </div>
                  )}
                </div>
              </div>

              {/* Expandable Root Domains -> Subdomains Table */}
              <div data-testid="apps-detail-table-card" className="cl-card flex flex-col overflow-hidden rounded-xl">
                <div
                  className="flex min-h-[50px] flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5"
                  style={{ borderColor: 'var(--cl-border-subtle)' }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">访问网站明细（点击任意主域名展开精确子域名与节点）</h3>
                    {sankeyFilter && (
                      <button
                        type="button"
                        onClick={() => setSankeyFilter(null)}
                        className="cl-btn-accent !h-6 !px-2 !text-[11px] font-mono"
                      >
                        <span>
                          {sankeyFilter.stage === 'domain'
                            ? `域名: ${maskHostOrDomain(sankeyFilter.value, privacyMode)}`
                            : `出口: ${sankeyFilter.value}`}
                        </span>
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    {ruleToast && (
                      <span
                        className="rounded px-2 py-0.5 font-mono text-[11px]"
                        style={{
                          backgroundColor: 'var(--cl-accent-soft)',
                          color: 'var(--cl-accent-primary)',
                        }}
                      >
                        {ruleToast}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="cl-segment !h-6">
                      <button
                        type="button"
                        onClick={() => setRuleFormat('yaml')}
                        className={`cl-segment-item !h-[18px] !text-[10px] ${ruleFormat === 'yaml' ? 'cl-segment-item-active' : ''}`}
                        style={ruleFormat === 'yaml' ? { color: 'var(--cl-accent-primary)' } : undefined}
                      >
                        YAML 规则
                      </button>
                      <button
                        type="button"
                        onClick={() => setRuleFormat('verge-js')}
                        className={`cl-segment-item !h-[18px] !text-[10px] ${ruleFormat === 'verge-js' ? 'cl-segment-item-active' : ''}`}
                        style={ruleFormat === 'verge-js' ? { color: 'var(--cl-accent-primary)' } : undefined}
                      >
                        Verge JS
                      </button>
                    </div>
                    {filteredRootDomains.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setAllExpanded(
                              filteredRootDomains.map((g) => g.root_domain),
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
                </div>
                <div className="cl-thin-scroll h-[460px] overflow-x-auto overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead
                      className="sticky top-0 z-10 border-b bg-[var(--cl-bg-sidebar)] text-[var(--cl-text-muted)]"
                      style={{ borderColor: 'var(--cl-border-subtle)' }}
                    >
                      <tr>
                        <th className="px-4 py-2.5 font-medium">主域名 / 服务</th>
                        <th className="px-4 py-2.5 text-right font-medium">总流量</th>
                        <th className="px-4 py-2.5 text-right font-medium">占比</th>
                        <th className="px-4 py-2.5 text-right font-medium">代理</th>
                        <th className="px-4 py-2.5 text-right font-medium">直连</th>
                        <th className="px-4 py-2.5 text-right font-medium">下行 / 上行 · 操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cl-border-subtle)]">
                      {filteredRootDomains.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-xs text-[var(--cl-text-muted)]">
                            {onlyMatch || sankeyFilter ? '当前筛选条件下无匹配明细条目' : '暂无访问网站明细'}
                          </td>
                        </tr>
                      ) : (
                        filteredRootDomains.map((grp) => {
                          const open = !!expandedKeys[grp.root_domain]
                          const grpCopyKey = `grp:${grp.root_domain}`
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
                                    <span className="font-mono font-semibold">
                                      {maskHostOrDomain(grp.root_domain, privacyMode)}
                                    </span>
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
                                  <div className="inline-flex items-center justify-end gap-2">
                                    <span style={{ color: chartTheme.liveColors.down }}>
                                      ↓{formatBytes(grp.down_bytes, 1)}
                                    </span>
                                    <span style={{ color: chartTheme.liveColors.up }}>
                                      ↑{formatBytes(grp.up_bytes, 1)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        void handleCopyRule(grpCopyKey, grp.root_domain)
                                      }}
                                      className="inline-flex h-6 items-center gap-1 rounded border px-1.5 font-sans text-[10px] text-[var(--cl-text-muted)] transition hover:border-[var(--cl-border-focus)] hover:text-[var(--cl-accent-primary)]"
                                      style={{ borderColor: 'var(--cl-border-subtle)' }}
                                      title="复制直连分流规则"
                                    >
                                      {copiedRuleKey === grpCopyKey ? (
                                        <Check className="h-3 w-3" style={{ color: 'var(--cl-status-success)' }} />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                      规则
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {open &&
                                grp.subdomains.map((sub, sIdx) => {
                                  const subCopyKey = `sub:${grp.root_domain}:${sub.host}:${sIdx}`
                                  const canCopy = Boolean(sub.host && sub.host !== '*')
                                  const isMatch = isMatchFallbackRule(sub.rule)
                                  return (
                                    <tr
                                      key={`${grp.root_domain}-${sub.host}-${sub.egress_node}-${sIdx}`}
                                      className="text-[11px]"
                                      style={{ backgroundColor: 'var(--cl-bg-sidebar)' }}
                                    >
                                      <td className="py-2 pl-10 pr-4" colSpan={2}>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-mono text-[var(--cl-text-primary)]">
                                            {sub.host === '*'
                                              ? '* (低频零散子域名合并)'
                                              : maskHostOrDomain(sub.host, privacyMode)}
                                          </span>
                                          <span
                                            className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                                            style={{
                                              backgroundColor: 'var(--cl-bg-surface-hover)',
                                              color:
                                                sub.route_type === 'PROXY'
                                                  ? chartTheme.routeColors.PROXY
                                                  : sub.route_type === 'DIRECT'
                                                    ? chartTheme.routeColors.DIRECT
                                                    : chartTheme.routeColors.REJECT,
                                            }}
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
                                          {isMatch && (
                                            <span
                                              className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                                              style={{
                                                backgroundColor: 'rgba(245, 158, 11, 0.14)',
                                                color: 'var(--cl-status-warning)',
                                              }}
                                            >
                                              兜底
                                            </span>
                                          )}
                                          {sub.rule && (
                                            <span className="font-mono text-[10px] text-[var(--cl-text-muted)]">
                                              规则: {maskRuleText(sub.rule, privacyMode)}
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
                                        <div className="inline-flex items-center justify-end gap-2">
                                          <span>
                                            ↓{formatBytes(sub.down_bytes, 1)} ↑{formatBytes(sub.up_bytes, 1)}
                                          </span>
                                          {canCopy && (
                                            <button
                                              type="button"
                                              onClick={() => void handleCopyRule(subCopyKey, sub.host)}
                                              className="inline-flex h-5 items-center gap-1 rounded border px-1.5 font-sans text-[10px] text-[var(--cl-text-muted)] transition hover:border-[var(--cl-border-focus)] hover:text-[var(--cl-accent-primary)]"
                                              style={{ borderColor: 'var(--cl-border-subtle)' }}
                                              title="复制精确目标规则"
                                            >
                                              {copiedRuleKey === subCopyKey ? (
                                                <Check className="h-2.5 w-2.5" style={{ color: 'var(--cl-status-success)' }} />
                                              ) : (
                                                <Copy className="h-2.5 w-2.5" />
                                              )}
                                              复制规则
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })}
                            </Fragment>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : mode === 'domain' && domainDetail ? (
            <>
              <div className="cl-card grid min-h-[96px] items-center gap-3 rounded-xl p-4 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-[var(--cl-text-muted)]">网站主域名</div>
                  <div className="mt-1 truncate font-mono text-lg font-bold">
                    {maskHostOrDomain(domainDetail.root_domain, privacyMode)}
                  </div>
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

              <div data-testid="apps-detail-table-card" className="cl-card flex flex-col overflow-hidden rounded-xl">
                <div
                  className="flex min-h-[50px] flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5"
                  style={{ borderColor: 'var(--cl-border-subtle)' }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">访问该网站的应用列表（点击展开子域名）</h3>
                    {ruleToast && (
                      <span
                        className="rounded px-2 py-0.5 font-mono text-[11px]"
                        style={{
                          backgroundColor: 'var(--cl-accent-soft)',
                          color: 'var(--cl-accent-primary)',
                        }}
                      >
                        {ruleToast}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="cl-segment !h-6">
                      <button
                        type="button"
                        onClick={() => setRuleFormat('yaml')}
                        className={`cl-segment-item !h-[18px] !text-[10px] ${ruleFormat === 'yaml' ? 'cl-segment-item-active' : ''}`}
                        style={ruleFormat === 'yaml' ? { color: 'var(--cl-accent-primary)' } : undefined}
                      >
                        YAML 规则
                      </button>
                      <button
                        type="button"
                        onClick={() => setRuleFormat('verge-js')}
                        className={`cl-segment-item !h-[18px] !text-[10px] ${ruleFormat === 'verge-js' ? 'cl-segment-item-active' : ''}`}
                        style={ruleFormat === 'verge-js' ? { color: 'var(--cl-accent-primary)' } : undefined}
                      >
                        Verge JS
                      </button>
                    </div>
                    {filteredDomainApps.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setAllExpanded(
                              filteredDomainApps.map((a) => a.process_display),
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
                </div>
                <div className="cl-thin-scroll h-[460px] overflow-x-auto overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead
                      className="sticky top-0 z-10 border-b bg-[var(--cl-bg-sidebar)] text-[var(--cl-text-muted)]"
                      style={{ borderColor: 'var(--cl-border-subtle)' }}
                    >
                      <tr>
                        <th className="px-4 py-2.5 font-medium">应用进程</th>
                        <th className="px-4 py-2.5 text-right font-medium">总流量</th>
                        <th className="px-4 py-2.5 text-right font-medium">占比</th>
                        <th className="px-4 py-2.5 text-right font-medium">代理</th>
                        <th className="px-4 py-2.5 text-right font-medium">下行 / 上行 · 操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cl-border-subtle)]">
                      {filteredDomainApps.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-xs text-[var(--cl-text-muted)]">
                            {onlyMatch ? '当前筛选条件下无 MATCH 兜底明细' : '暂无应用访问记录'}
                          </td>
                        </tr>
                      ) : (
                        filteredDomainApps.map((appRow) => {
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
                                appRow.subdomains.map((sub, sIdx) => {
                                  const subCopyKey = `domsub:${appRow.process_display}:${sub.host}:${sIdx}`
                                  const canCopy = Boolean(sub.host && sub.host !== '*')
                                  const isMatch = isMatchFallbackRule(sub.rule)
                                  return (
                                    <tr
                                      key={`${appRow.process_display}-${sub.host}-${sIdx}`}
                                      className="text-[11px]"
                                      style={{ backgroundColor: 'var(--cl-bg-sidebar)' }}
                                    >
                                      <td className="py-2 pl-10 pr-4" colSpan={2}>
                                        <span className="font-mono">
                                          {sub.host === '*'
                                            ? '* (低频零散子域名合并)'
                                            : maskHostOrDomain(sub.host, privacyMode)}
                                        </span>
                                        <span
                                          className="ml-2 rounded px-1.5 py-0.5 font-mono text-[10px]"
                                          style={{
                                            backgroundColor: 'var(--cl-bg-surface-hover)',
                                            color:
                                              sub.route_type === 'PROXY'
                                                ? chartTheme.routeColors.PROXY
                                                : sub.route_type === 'DIRECT'
                                                  ? chartTheme.routeColors.DIRECT
                                                  : chartTheme.routeColors.REJECT,
                                          }}
                                        >
                                          {sub.route_type === 'DIRECT' ? 'DIRECT' : sub.egress_node}
                                        </span>
                                        {isMatch && (
                                          <span
                                            className="ml-1.5 rounded px-1.5 py-0.5 font-mono text-[10px]"
                                            style={{
                                              backgroundColor: 'rgba(245, 158, 11, 0.14)',
                                              color: 'var(--cl-status-warning)',
                                            }}
                                          >
                                            兜底
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2 text-right font-mono tabular-nums">
                                        {formatBytes(sub.total_bytes)}
                                      </td>
                                      <td className="px-4 py-2 text-right font-mono text-[var(--cl-text-muted)]" colSpan={2}>
                                        <div className="inline-flex items-center justify-end gap-2">
                                          <span>
                                            {sub.inbound_mode} · {maskRuleText(sub.rule || '-', privacyMode)}
                                          </span>
                                          {canCopy && (
                                            <button
                                              type="button"
                                              onClick={() => void handleCopyRule(subCopyKey, sub.host)}
                                              className="inline-flex h-5 items-center gap-1 rounded border px-1.5 font-sans text-[10px] text-[var(--cl-text-muted)] transition hover:border-[var(--cl-border-focus)] hover:text-[var(--cl-accent-primary)]"
                                              style={{ borderColor: 'var(--cl-border-subtle)' }}
                                              title="复制精确目标规则"
                                            >
                                              {copiedRuleKey === subCopyKey ? (
                                                <Check className="h-2.5 w-2.5" style={{ color: 'var(--cl-status-success)' }} />
                                              ) : (
                                                <Copy className="h-2.5 w-2.5" />
                                              )}
                                              复制规则
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })}
                            </Fragment>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="cl-card flex h-64 items-center justify-center rounded-xl text-xs text-[var(--cl-text-muted)] lg:min-h-[934px]">
              请在左侧选择应用或等待流量数据上报
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
