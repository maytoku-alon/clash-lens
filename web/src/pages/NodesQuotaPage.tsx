import { useEffect, useMemo, useState } from 'react'
import type * as echarts from 'echarts'
import { AlertCircle, ArrowRight, Gauge, Network, ShieldCheck } from 'lucide-react'
import { api, type QueryParams } from '../api/client'
import { EChartBox } from '../components/EChartBox'
import type { NodesAnalyticsResponse } from '../types/api'
import { formatBytes, formatNumber } from '../utils/format'

interface NodesQuotaPageProps {
  query: QueryParams
  isDark: boolean
  onOpenSettings: () => void
  onOpenApp: (processDisplay: string) => void
}

export function NodesQuotaPage({
  query,
  isDark,
  onOpenSettings,
  onOpenApp,
}: NodesQuotaPageProps) {
  const [data, setData] = useState<NodesAnalyticsResponse | null>(null)

  useEffect(() => {
    let alive = true
    api
      .nodes(query)
      .then((res) => {
        if (alive) setData(res)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [query.deviceId, query.scope, query.from, query.to])

  const donutOption = useMemo<echarts.EChartsCoreOption>(() => {
    const splits = data?.route_split ?? []
    const colorMap: Record<string, string> = {
      PROXY: '#10b981',
      DIRECT: '#6366f1',
      REJECT: '#f43f5e',
    }
    const labelMap: Record<string, string> = {
      PROXY: '代理 (PROXY)',
      DIRECT: '直连 (DIRECT)',
      REJECT: '拦截 (REJECT)',
    }
    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: isDark ? '#141419' : '#ffffff',
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
        textStyle: { color: isDark ? '#fafafa' : '#0f172a', fontSize: 12 },
        formatter: (p: unknown) => {
          const item = p as { name?: string; value?: number; percent?: number }
          return `${item.name}: <b>${formatBytes(item.value)}</b> (${item.percent ?? 0}%)`
        },
      },
      legend: {
        bottom: 0,
        textStyle: { color: isDark ? '#a1a1aa' : '#64748b', fontSize: 11 },
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
            itemStyle: { color: colorMap[s.route_type] || '#71717a' },
          })),
        },
      ],
    }
  }, [data, isDark])

  const nodesBarOption = useMemo<echarts.EChartsCoreOption>(() => {
    const topNodes = (data?.nodes ?? []).slice(0, 10).reverse()
    const textColor = isDark ? '#a1a1aa' : '#64748b'
    const gridLine = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)'
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        backgroundColor: isDark ? '#141419' : '#ffffff',
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
        textStyle: { color: isDark ? '#fafafa' : '#0f172a', fontSize: 12 },
        valueFormatter: (v: unknown) => formatBytes(Number(v)),
      },
      legend: {
        top: 0,
        textStyle: { color: textColor, fontSize: 11 },
      },
      grid: { top: 28, left: 110, right: 18, bottom: 16 },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: gridLine } },
        axisLabel: { color: textColor, fontSize: 10, formatter: (v: number) => formatBytes(v, 0) },
      },
      yAxis: {
        type: 'category',
        data: topNodes.map((n) => (n.route_type === 'DIRECT' ? 'DIRECT' : n.egress_node)),
        axisLabel: { color: textColor, fontSize: 11, width: 100, overflow: 'truncate' },
      },
      series: [
        {
          name: '原始流量',
          type: 'bar',
          data: topNodes.map((n) => n.raw_bytes),
          itemStyle: { color: '#06b6d4', borderRadius: [0, 4, 4, 0] },
        },
        {
          name: '倍率计费',
          type: 'bar',
          data: topNodes.map((n) => n.billed_bytes),
          itemStyle: { color: '#10b981', borderRadius: [0, 4, 4, 0] },
        },
      ],
    }
  }, [data, isDark])

  const quota = data?.quota

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-bold tracking-tight">节点、规则与套餐计费</h1>
          <p className="text-xs text-[var(--cl-muted)]">
            按节点倍率折算等效套餐消耗，并核查走代理的大流量条目是否被规则误分流
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="cl-btn-secondary"
        >
          <Gauge className="h-3.5 w-3.5 text-emerald-400" />
          配置套餐与节点倍率
        </button>
      </div>

      {/* Top row: Quota card + Route Donut + Nodes Bar */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Quota */}
        <div className="cl-card flex flex-col justify-between rounded-xl p-4 lg:col-span-4">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--cl-muted)]">
              <span>机场账单周期估算</span>
              <span className="font-mono">
                {quota ? `${quota.cycle_start_label} ~ ${quota.cycle_end_label}` : '-'}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                {formatBytes(quota?.billed_bytes)}
              </span>
              {quota?.enabled && (
                <span className="font-mono text-xs text-[var(--cl-muted)]">
                  / {quota.monthly_quota_gb} GB
                </span>
              )}
            </div>
            <div className="mt-1 font-mono text-xs text-[var(--cl-muted)] tabular-nums">
              原始代理流量: {formatBytes(quota?.raw_proxy_bytes)}
            </div>
          </div>

          {quota?.enabled ? (
            <div className="mt-4 space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${quota.used_percent > 85 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, quota.used_percent)}%` }}
                />
              </div>
              <div className="flex justify-between font-mono text-[11px] text-[var(--cl-muted)] tabular-nums">
                <span>已用 {quota.used_percent.toFixed(1)}%</span>
                <span>预计本周期 {quota.projected_gb.toFixed(1)} GB · 剩 {quota.days_remaining} 天</span>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-[var(--cl-border)] bg-[var(--cl-surface)] p-3 text-xs text-[var(--cl-muted)]">
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
          <div className="flex items-center justify-between border-b border-[var(--cl-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold">规则误分流体检（Proxy Audit）</h3>
            </div>
            <span className="text-[11px] text-[var(--cl-muted)]">代理消耗最高的流向条目</span>
          </div>
          <div className="divide-y divide-[var(--cl-border)]">
            {!data || data.proxy_audit.length === 0 ? (
              <div className="py-10 text-center text-xs text-[var(--cl-muted)]">当前范围无代理流量记录</div>
            ) : (
              data.proxy_audit.map((item, idx) => (
                <button
                  key={`${item.process_display}-${item.root_domain}-${item.egress_node}-${idx}`}
                  onClick={() => onOpenApp(item.process_display)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--cl-hover)]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-semibold">{item.process_display}</span>
                      <ArrowRight className="h-3 w-3 text-[var(--cl-muted)]" />
                      <span className="truncate font-mono text-emerald-400">{item.root_domain}</span>
                      {item.service_tag && (
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--cl-muted)]">
                          {item.service_tag}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-[var(--cl-muted)]">
                      <span>节点: {item.egress_node}</span>
                      <span>· 规则: {item.rule || '-'}</span>
                      {item.inbound_mode === 'TUN' && <span className="text-cyan-400">· TUN</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono tabular-nums">
                    <div className="text-xs font-bold text-emerald-400">{formatBytes(item.billed_bytes)}</div>
                    {item.billed_bytes !== item.total_bytes && (
                      <div className="text-[10px] text-[var(--cl-muted)]">原始 {formatBytes(item.total_bytes)}</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Rules distribution */}
        <div className="cl-card overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-[var(--cl-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold">规则命中排行</h3>
            </div>
            <Network className="h-4 w-4 text-[var(--cl-muted)]" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--cl-border)] bg-[var(--cl-surface)] text-[var(--cl-muted)]">
                <tr>
                  <th className="px-4 py-2 font-medium">规则</th>
                  <th className="px-4 py-2 font-medium">策略</th>
                  <th className="px-4 py-2 font-medium text-right">流量</th>
                  <th className="px-4 py-2 font-medium text-right">连接数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cl-border)]">
                {!data || data.rules.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-[var(--cl-muted)]">
                      暂无规则命中记录
                    </td>
                  </tr>
                ) : (
                  data.rules.map((r, i) => (
                    <tr key={`${r.rule}-${r.route_type}-${i}`} className="hover:bg-[var(--cl-hover)]">
                      <td className="max-w-[220px] truncate px-4 py-2 font-mono">{r.rule}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                            r.route_type === 'PROXY'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : r.route_type === 'DIRECT'
                                ? 'bg-indigo-500/15 text-indigo-400'
                                : 'bg-rose-500/15 text-rose-400'
                          }`}
                        >
                          {r.route_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums">
                        {formatBytes(r.total_bytes)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-[var(--cl-muted)] tabular-nums">
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
