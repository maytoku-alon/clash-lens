import { useMemo } from 'react'
import type * as echarts from 'echarts'
import { AlertCircle, ArrowRight, Gauge, Network, ShieldCheck } from 'lucide-react'
import type { QueryParams } from '../api/trafficApi'
import { EChartBox } from '../components/EChartBox'
import { useNodesData } from '../hooks/useDashboardQueries'
import { buildByteValueAxis, buildChartTheme } from '../theme/chartAdapter'
import { useTheme } from '../theme/ThemeProvider'
import { formatBytes, formatNumber } from '../utils/format'

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
  const { tokens, colorMode } = useTheme()
  const chartTheme = useMemo(() => buildChartTheme(tokens, colorMode), [tokens, colorMode])
  const { data } = useNodesData(query)

  const donutOption = useMemo<echarts.EChartsCoreOption>(() => {
    const splits = data?.route_split ?? []
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
          radius: ['52%', '76%'],
          center: ['50%', '44%'],
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
          name: '原始流量',
          type: 'bar',
          data: topNodes.map((n) => n.raw_bytes),
          itemStyle: { color: chartTheme.palette[1] ?? chartTheme.accentPrimary, borderRadius: [0, 4, 4, 0] },
        },
        {
          name: '倍率计费',
          type: 'bar',
          data: topNodes.map((n) => n.billed_bytes),
          itemStyle: { color: chartTheme.palette[0] ?? chartTheme.accentPrimary, borderRadius: [0, 4, 4, 0] },
        },
      ],
    }
  }, [data, chartTheme])

  const quota = data?.quota

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
                style={{ color: 'var(--cl-accent-primary)' }}
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
              原始代理流量: {formatBytes(quota?.raw_proxy_bytes)}
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
                      quota.used_percent > 85 ? 'var(--cl-status-danger)' : 'var(--cl-accent-primary)',
                  }}
                />
              </div>
              <div className="flex justify-between font-mono text-[11px] text-[var(--cl-text-muted)] tabular-nums">
                <span>已用 {quota.used_percent.toFixed(1)}%</span>
                <span>预计本周期 {quota.projected_gb.toFixed(1)} GB · 剩 {quota.days_remaining} 天</span>
              </div>
            </div>
          ) : (
            <div
              className="mt-4 rounded-lg border p-3 text-xs text-[var(--cl-text-muted)]"
              style={{
                borderColor: 'var(--cl-border-subtle)',
                backgroundColor: 'var(--cl-bg-sidebar)',
              }}
            >
              暂未设定月度套餐配额。点击右上角「配置套餐与节点倍率」可开启配额进度条与节点倍率换算（如 0.5x / 2x）。
            </div>
          )}
        </div>

        {/* Route Donut */}
        <div className="cl-card rounded-xl p-4 lg:col-span-3">
          <div className="mb-1 text-xs font-semibold">代理 / 直连 / 拦截占比</div>
          <EChartBox option={donutOption} className="h-[220px] w-full" />
        </div>

        {/* Nodes Bar */}
        <div className="cl-card rounded-xl p-4 lg:col-span-5">
          <div className="mb-1 text-xs font-semibold">Top 出口节点流量对比</div>
          <EChartBox option={nodesBarOption} className="h-[220px] w-full" />
        </div>
      </div>

      {/* Bottom row: Proxy Audit + Rules & Nodes table */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Proxy Audit */}
        <div className="cl-card overflow-hidden rounded-xl">
          <div
            className="flex items-center justify-between border-b px-4 py-3"
            style={{ borderColor: 'var(--cl-border-subtle)' }}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" style={{ color: 'var(--cl-status-warning)' }} />
              <h3 className="text-sm font-semibold">规则误分流体检（Proxy Audit）</h3>
            </div>
            <span className="text-[11px] text-[var(--cl-text-muted)]">代理消耗最高的流向条目</span>
          </div>
          <div className="divide-y divide-[var(--cl-border-subtle)]">
            {!data || data.proxy_audit.length === 0 ? (
              <div className="py-10 text-center text-xs text-[var(--cl-text-muted)]">当前范围无代理流量记录</div>
            ) : (
              data.proxy_audit.map((item, idx) => (
                <button
                  type="button"
                  key={`${item.process_display}-${item.root_domain}-${item.egress_node}-${idx}`}
                  onClick={() => onOpenApp(item.process_display)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--cl-bg-surface-hover)]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-semibold">{item.process_display}</span>
                      <ArrowRight className="h-3 w-3 text-[var(--cl-text-muted)]" />
                      <span
                        className="truncate font-mono"
                        style={{ color: 'var(--cl-accent-primary)' }}
                      >
                        {item.root_domain}
                      </span>
                      {item.service_tag && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--cl-text-muted)]"
                          style={{ backgroundColor: 'var(--cl-bg-surface-hover)' }}
                        >
                          {item.service_tag}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-[var(--cl-text-muted)]">
                      <span>节点: {item.egress_node}</span>
                      <span>· 规则: {item.rule || '-'}</span>
                      {item.inbound_mode === 'TUN' && (
                        <span style={{ color: 'var(--cl-accent-primary)' }}>· TUN</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono tabular-nums">
                    <div className="text-xs font-bold" style={{ color: 'var(--cl-accent-primary)' }}>
                      {formatBytes(item.billed_bytes)}
                    </div>
                    {item.billed_bytes !== item.total_bytes && (
                      <div className="text-[10px] text-[var(--cl-text-muted)]">
                        原始 {formatBytes(item.total_bytes)}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Rules distribution */}
        <div className="cl-card overflow-hidden rounded-xl">
          <div
            className="flex items-center justify-between border-b px-4 py-3"
            style={{ borderColor: 'var(--cl-border-subtle)' }}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" style={{ color: 'var(--cl-status-success)' }} />
              <h3 className="text-sm font-semibold">规则命中排行</h3>
            </div>
            <Network className="h-4 w-4 text-[var(--cl-text-muted)]" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead
                className="border-b bg-[var(--cl-bg-sidebar)] text-[var(--cl-text-muted)]"
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
                  data.rules.map((r, i) => (
                    <tr key={`${r.rule}-${r.route_type}-${i}`} className="hover:bg-[var(--cl-bg-surface-hover)]">
                      <td className="max-w-[220px] truncate px-4 py-2 font-mono">{r.rule}</td>
                      <td className="px-4 py-2">
                        <span
                          className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                          style={
                            r.route_type === 'PROXY'
                              ? {
                                  backgroundColor: 'var(--cl-accent-soft)',
                                  color: 'var(--cl-accent-primary)',
                                }
                              : r.route_type === 'DIRECT'
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
