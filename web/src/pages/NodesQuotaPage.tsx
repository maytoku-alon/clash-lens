import { useMemo } from 'react'
import type * as echarts from 'echarts'
import { AlertCircle, ArrowRight, Gauge, Network, Plus, ShieldCheck } from 'lucide-react'
import type { QueryParams } from '../api/trafficApi'
import { EChartBox } from '../components/EChartBox'
import { useNodesData } from '../hooks/useDashboardQueries'
import { buildByteValueAxis, buildChartTheme } from '../theme/chartAdapter'
import { useTheme } from '../theme/ThemeProvider'
import { formatBytes, formatNumber } from '../utils/format'
import { isMatchFallbackRule, maskHostOrDomain, maskRuleText } from '../utils/privacy'

interface NodesQuotaPageProps {
  query: QueryParams
  onOpenSettings: () => void
  onOpenApp: (processDisplay: string) => void
}

export function NodesQuotaPage({
  query,
  onOpenSettings,
  onOpenApp,
}: NodesQuotaPageProps) {
  const { theme, tokens, colorMode, privacyMode } = useTheme()
  const chartTheme = useMemo(
    () => buildChartTheme(tokens, colorMode, theme.chartEffects),
    [tokens, colorMode, theme.chartEffects],
  )
  const { data } = useNodesData(query)

  const routeSummary = useMemo(() => {
    const splits = data?.route_split ?? []
    let total = 0
    let proxy = 0
    for (const s of splits) {
      total += s.total_bytes
      if (s.route_type === 'PROXY') proxy += s.total_bytes
    }
    const proxyPct = total > 0 ? (proxy / total) * 100 : 0
    return { total, proxy, proxyPct }
  }, [data])

  const donutOption = useMemo<echarts.EChartsCoreOption>(() => {
    const routeOrder: Record<string, number> = { PROXY: 0, DIRECT: 1, REJECT: 2 }
    const splits = [...(data?.route_split ?? [])].sort(
      (a, b) => (routeOrder[a.route_type] ?? 99) - (routeOrder[b.route_type] ?? 99),
    )
    const colorMap: Record<string, string> = chartTheme.routeColors
    const labelMap: Record<string, string> = {
      PROXY: '代理 (PROXY)',
      DIRECT: '直连 (DIRECT)',
      REJECT: '拦截 (REJECT)',
    }
    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: chartTheme.tooltip.backgroundColor,
        borderColor: chartTheme.tooltip.borderColor,
        textStyle: chartTheme.tooltip.textStyle,
        formatter: (p: unknown) => {
          const item = p as { name?: string; value?: number; percent?: number }
          return `${item.name}: <b>${formatBytes(item.value)}</b> (${item.percent ?? 0}%)`
        },
      },
      legend: {
        bottom: 0,
        textStyle: chartTheme.legendTextStyle,
      },
      series: [
        {
          type: 'pie',
          radius: ['56%', '78%'],
          center: ['50%', '43%'],
          padAngle: 2,
          itemStyle: { borderRadius: 4 },
          label: { show: false },
          data: splits.map((s) => ({
            name: labelMap[s.route_type] || s.route_type,
            value: s.total_bytes,
            itemStyle: { color: colorMap[s.route_type] || chartTheme.textMuted },
          })),
        },
      ],
    }
  }, [data, chartTheme])

  const nodesBarOption = useMemo<echarts.EChartsCoreOption>(() => {
    const topNodes = (data?.nodes ?? []).slice(0, 10).reverse()
    let peakNodeBytes = 0
    for (const n of topNodes) {
      if (n.raw_bytes > peakNodeBytes) peakNodeBytes = n.raw_bytes
      if (n.billed_bytes > peakNodeBytes) peakNodeBytes = n.billed_bytes
    }

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        backgroundColor: chartTheme.tooltip.backgroundColor,
        borderColor: chartTheme.tooltip.borderColor,
        textStyle: chartTheme.tooltip.textStyle,
        valueFormatter: (v: unknown) => formatBytes(Number(v)),
      },
      legend: {
        top: 0,
        textStyle: chartTheme.legendTextStyle,
      },
      grid: { top: 28, left: 110, right: 20, bottom: 16 },
      xAxis: buildByteValueAxis(peakNodeBytes, chartTheme, 10),
      yAxis: {
        type: 'category',
        data: topNodes.map((n) => (n.route_type === 'DIRECT' ? 'DIRECT' : n.egress_node)),
        axisLabel: { color: chartTheme.axisLabelColor, fontSize: 11, width: 100, overflow: 'truncate' },
      },
      series: [
        {
          name: '实际消耗',
          type: 'bar',
          data: topNodes.map((n) => n.raw_bytes),
          itemStyle: {
            color: chartTheme.barItemColor(chartTheme.metricColors.actual, 'horizontal'),
            borderRadius: [0, 4, 4, 0],
          },
        },
        {
          name: '倍率计费',
          type: 'bar',
          data: topNodes.map((n) => n.billed_bytes),
          itemStyle: {
            color: chartTheme.barItemColor(chartTheme.metricColors.billed, 'horizontal'),
            borderRadius: [0, 4, 4, 0],
          },
        },
      ],
    }
  }, [data, chartTheme])

  const quota = data?.quota
  const dailyAvgEstimate = useMemo(() => {
    if (!quota?.enabled) return 0
    const startMs = Date.parse(`${quota.cycle_start_label}T00:00:00`)
    if (Number.isNaN(startMs)) return quota.billed_bytes
    const elapsedDays = Math.max(1, Math.floor((Date.now() - startMs) / 86400000) + 1)
    return quota.billed_bytes / elapsedDays
  }, [quota])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-bold tracking-tight">节点、规则与套餐计费</h1>
          <p className="text-xs text-[var(--cl-text-muted)]">
            按节点倍率折算等效套餐消耗，并核查走代理的大流量条目是否被规则误分流
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="cl-btn-secondary"
        >
          <Gauge className="h-3.5 w-3.5" style={{ color: 'var(--cl-accent-primary)' }} />
          配置套餐与节点倍率
        </button>
      </div>

      {/* Top row: Quota card + Route Donut + Nodes Bar */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Quota */}
        <div className="cl-card flex flex-col justify-between rounded-xl p-4 lg:col-span-4">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--cl-text-muted)]">
              <span>机场账单周期估算</span>
              <span className="font-mono">
                {quota ? `${quota.cycle_start_label} ~ ${quota.cycle_end_label}` : '-'}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span
                className="font-mono text-2xl font-bold tabular-nums"
                style={{ color: chartTheme.metricColors.billed }}
              >
                {formatBytes(quota?.billed_bytes)}
              </span>
              {quota?.enabled && (
                <span className="font-mono text-xs text-[var(--cl-text-muted)]">
                  / {quota.monthly_quota_gb} GB
                </span>
              )}
            </div>
            <div className="mt-1 font-mono text-xs text-[var(--cl-text-muted)] tabular-nums">
              实际代理流量: {formatBytes(quota?.raw_proxy_bytes)}
            </div>
          </div>

          {quota?.enabled ? (
            <div className="mt-4 space-y-2">
              <div
                className="h-2 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: 'var(--cl-border-subtle)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, quota.used_percent)}%`,
                    backgroundColor:
                      quota.used_percent > 85 ? 'var(--cl-status-danger)' : chartTheme.metricColors.billed,
                  }}
                />
              </div>
              <div className="flex justify-between font-mono text-[11px] text-[var(--cl-text-muted)] tabular-nums">
                <span>已用 {quota.used_percent.toFixed(1)}% · 日均 {formatBytes(dailyAvgEstimate)}</span>
                <span>预计本周期 {quota.projected_gb.toFixed(1)} GB · 剩 {quota.days_remaining} 天</span>
              </div>
            </div>
          ) : (
            <div
              className="mt-4 flex flex-col gap-3 rounded-lg border p-3 text-xs text-[var(--cl-text-muted)]"
              style={{
                borderColor: 'var(--cl-border-subtle)',
                backgroundColor: 'var(--cl-bg-sidebar)',
              }}
            >
              <span>暂未设定月度套餐配额。配置后可实时监控配额余量、周期日均与节点倍率折算。</span>
              <div>
                <button type="button" onClick={onOpenSettings} className="cl-btn-primary !h-7 !px-2.5 !text-[11px]">
                  <Plus className="h-3 w-3" />
                  立即配置套餐
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Route Donut */}
        <div className="cl-card rounded-xl p-4 lg:col-span-3">
          <div className="mb-1 text-xs font-semibold">代理 / 直连 / 拦截占比</div>
          <div className="relative h-[220px] w-full">
            <EChartBox option={donutOption} className="h-[220px] w-full" />
            <div className="pointer-events-none absolute inset-x-0 top-[26%] flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-[var(--cl-text-muted)]">代理占比</span>
              <span
                className="font-mono text-lg font-bold leading-tight tabular-nums"
                style={{ color: chartTheme.routeColors.PROXY }}
              >
                {routeSummary.proxyPct.toFixed(1)}%
              </span>
              <span className="font-mono text-[10px] text-[var(--cl-text-muted)] tabular-nums">
                共 {formatBytes(routeSummary.total, 1)}
              </span>
            </div>
          </div>
        </div>

        {/* Nodes Bar */}
        <div className="cl-card rounded-xl p-4 lg:col-span-5">
          <div className="mb-1 text-xs font-semibold">Top 出口节点流量对比</div>
          <EChartBox option={nodesBarOption} className="h-[220px] w-full" />
        </div>
      </div>

      {/* Bottom row: Proxy Audit + Rules & Nodes table (unified fixed heights prevent cross-device layout shift) */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Proxy Audit */}
        <div data-testid="proxy-audit-card" className="cl-card flex flex-col overflow-hidden rounded-xl">
          <div
            className="flex shrink-0 items-center justify-between border-b px-4 py-3"
            style={{ borderColor: 'var(--cl-border-subtle)' }}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" style={{ color: 'var(--cl-status-warning)' }} />
              <h3 className="text-sm font-semibold">规则误分流体检（Proxy Audit）</h3>
            </div>
            <span className="text-[11px] text-[var(--cl-text-muted)]">代理消耗最高的流向条目</span>
          </div>
          <div className="cl-thin-scroll h-[460px] divide-y divide-[var(--cl-border-subtle)] overflow-y-auto">
            {!data || data.proxy_audit.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-[var(--cl-text-muted)]">
                当前范围无代理流量记录
              </div>
            ) : (
              data.proxy_audit.map((item, idx) => (
                <button
                  type="button"
                  key={`${item.process_display}-${item.root_domain}-${item.egress_node}-${idx}`}
                  onClick={() => onOpenApp(item.process_display)}
                  className="flex min-h-[58px] w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--cl-bg-surface-hover)]"
                >
                  <div className="min-w-0">
                    <div className="flex h-5 items-center gap-1.5 text-xs">
                      <span className="shrink-0 font-semibold">{item.process_display}</span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-[var(--cl-text-muted)]" />
                      <span
                        className="truncate font-mono"
                        style={{ color: 'var(--cl-accent-primary)' }}
                      >
                        {maskHostOrDomain(item.root_domain, privacyMode)}
                      </span>
                      {item.service_tag && (
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-none text-[var(--cl-text-muted)]"
                          style={{ backgroundColor: 'var(--cl-bg-surface-hover)' }}
                        >
                          {item.service_tag}
                        </span>
                      )}
                      {isMatchFallbackRule(item.rule) && (
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] leading-none"
                          style={{
                            backgroundColor: 'rgba(245, 158, 11, 0.14)',
                            color: 'var(--cl-status-warning)',
                          }}
                        >
                          兜底
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-[var(--cl-text-muted)]">
                      <span>节点: {item.egress_node}</span>
                      <span>· 规则: {maskRuleText(item.rule || '-', privacyMode)}</span>
                      {item.inbound_mode === 'TUN' && (
                        <span style={{ color: 'var(--cl-accent-primary)' }}>· TUN</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono tabular-nums">
                    <div className="text-xs font-bold" style={{ color: chartTheme.metricColors.billed }}>
                      {formatBytes(item.billed_bytes)}
                    </div>
                    {item.billed_bytes !== item.total_bytes && (
                      <div className="text-[10px] text-[var(--cl-text-muted)]">
                        实际 {formatBytes(item.total_bytes)}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Rules distribution */}
        <div data-testid="rules-rank-card" className="cl-card flex flex-col overflow-hidden rounded-xl">
          <div
            className="flex shrink-0 items-center justify-between border-b px-4 py-3"
            style={{ borderColor: 'var(--cl-border-subtle)' }}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" style={{ color: 'var(--cl-status-success)' }} />
              <h3 className="text-sm font-semibold">规则命中排行</h3>
            </div>
            <Network className="h-4 w-4 text-[var(--cl-text-muted)]" />
          </div>
          <div className="cl-thin-scroll h-[460px] overflow-x-auto overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead
                className="sticky top-0 z-10 border-b bg-[var(--cl-bg-sidebar)] text-[var(--cl-text-muted)]"
                style={{ borderColor: 'var(--cl-border-subtle)' }}
              >
                <tr>
                  <th className="px-4 py-2 font-medium">规则</th>
                  <th className="px-4 py-2 font-medium">策略</th>
                  <th className="px-4 py-2 text-right font-medium">流量</th>
                  <th className="px-4 py-2 text-right font-medium">连接数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cl-border-subtle)]">
                {!data || data.rules.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-[var(--cl-text-muted)]">
                      暂无规则命中记录
                    </td>
                  </tr>
                ) : (
                  data.rules.map((r, i) => {
                    const isMatch = isMatchFallbackRule(r.rule)
                    return (
                      <tr key={`${r.rule}-${r.route_type}-${i}`} className="hover:bg-[var(--cl-bg-surface-hover)]">
                        <td className="max-w-[240px] px-4 py-2 font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{maskRuleText(r.rule, privacyMode)}</span>
                            {isMatch && (
                              <span
                                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                style={{
                                  backgroundColor: 'rgba(245, 158, 11, 0.14)',
                                  color: 'var(--cl-status-warning)',
                                }}
                              >
                                兜底
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                            style={{
                              backgroundColor: 'var(--cl-bg-surface-hover)',
                              color:
                                r.route_type === 'PROXY'
                                  ? chartTheme.routeColors.PROXY
                                  : r.route_type === 'DIRECT'
                                    ? chartTheme.routeColors.DIRECT
                                    : chartTheme.routeColors.REJECT,
                            }}
                          >
                            {r.route_type}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums">
                          {formatBytes(r.total_bytes)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-[var(--cl-text-muted)] tabular-nums">
                          {formatNumber(r.conn_count)}
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
    </div>
  )
}
