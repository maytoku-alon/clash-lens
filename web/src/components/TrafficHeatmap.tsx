import { useMemo } from 'react'
import type * as echarts from 'echarts'
import { EChartBox } from './EChartBox'
import type { HeatmapResponse } from '../types/api'
import { formatBytes } from '../utils/format'

interface TrafficHeatmapProps {
  data: HeatmapResponse | null
  isDark: boolean
  onSelectDay: (dateStr: string) => void
}

export function TrafficHeatmap({ data, isDark, onSelectDay }: TrafficHeatmapProps) {
  const option = useMemo<echarts.EChartsCoreOption>(() => {
    const days = data?.days ?? []
    const today = new Date()
    const yearAgo = new Date(today.getTime() - 364 * 86400 * 1000)
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const start = days[0]?.date ?? fmt(yearAgo)
    const end = days[days.length - 1]?.date ?? fmt(today)

    const nonZero = days.map((d) => d.total_bytes).filter((v) => v > 0).sort((a, b) => a - b)
    const q = (p: number) => {
      if (nonZero.length === 0) return 0
      const idx = Math.min(nonZero.length - 1, Math.floor(nonZero.length * p))
      return nonZero[idx]
    }
    const q1 = Math.max(q(0.25), 1024)
    const q2 = Math.max(q(0.5), q1 + 1024)
    const q3 = Math.max(q(0.75), q2 + 1024)

    const byDate = new Map(days.map((d) => [d.date, d]))
    const emptyColor = isDark ? '#18181f' : '#eef2f6'
    const borderColor = isDark ? '#09090b' : '#ffffff'
    const textColor = isDark ? '#a1a1aa' : '#64748b'

    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: isDark ? '#141419' : '#ffffff',
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
        textStyle: { color: isDark ? '#fafafa' : '#0f172a', fontSize: 12 },
        formatter: (params: unknown) => {
          const p = params as { value: [string, number] }
          const date = p.value?.[0]
          const item = date ? byDate.get(date) : undefined
          if (!item) return ''
          return `
            <div style="font-family: ui-monospace, monospace; min-width: 170px;">
              <div style="font-weight: 600; margin-bottom: 4px;">${item.date}</div>
              <div style="display:flex;justify-content:space-between;gap:16px;">
                <span style="color:#a1a1aa;">总计</span>
                <span style="font-weight:600;color:#10b981;">${formatBytes(item.total_bytes)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:16px;">
                <span style="color:#a1a1aa;">代理</span>
                <span>${formatBytes(item.proxy_bytes)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:16px;">
                <span style="color:#a1a1aa;">直连</span>
                <span>${formatBytes(item.direct_bytes)}</span>
              </div>
              <div style="margin-top:4px;font-size:11px;color:#71717a;">点击下钻查看当日详情</div>
            </div>
          `
        },
      },
      visualMap: {
        type: 'piecewise',
        show: false,
        pieces: [
          { lte: 0, color: emptyColor },
          { gt: 0, lte: q1, color: isDark ? '#064e3b' : '#bbf7d0' },
          { gt: q1, lte: q2, color: isDark ? '#047857' : '#4ade80' },
          { gt: q2, lte: q3, color: isDark ? '#10b981' : '#16a34a' },
          { gt: q3, color: isDark ? '#34d399' : '#15803d' },
        ],
      },
      calendar: {
        top: 26,
        left: 34,
        right: 12,
        bottom: 8,
        cellSize: ['auto', 13],
        range: [start, end],
        splitLine: { show: false },
        itemStyle: {
          borderWidth: 2.5,
          borderColor,
          borderRadius: 3,
        },
        yearLabel: { show: false },
        monthLabel: {
          nameMap: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
          color: textColor,
          fontSize: 11,
        },
        dayLabel: {
          firstDay: 1,
          nameMap: ['日', '一', '二', '三', '四', '五', '六'],
          color: textColor,
          fontSize: 10,
        },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: days.map((d) => [d.date, d.total_bytes]),
        },
      ],
    }
  }, [data, isDark])

  const handleReady = (chart: echarts.ECharts) => {
    chart.on('click', (params: unknown) => {
      const p = params as { value?: [string, number] }
      if (p.value?.[0]) {
        onSelectDay(p.value[0])
      }
    })
  }

  return (
    <div className="cl-card rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">年度流量热力图（365 天）</h2>
          <p className="text-xs text-[var(--cl-muted)]">
            仿 Token Usage 活跃网格，点击任意日期可下钻至当日流量详情
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
          <span className="rounded-md border border-[var(--cl-border)] px-2.5 py-1 text-[var(--cl-muted)]">
            活跃 <strong className="text-[var(--cl-text)]">{data?.active_days ?? 0}</strong> 天
          </span>
          <span className="rounded-md border border-[var(--cl-border)] px-2.5 py-1 text-[var(--cl-muted)]">
            连续 <strong className="text-emerald-500">{data?.current_streak ?? 0}</strong> 天
          </span>
          <span className="rounded-md border border-[var(--cl-border)] px-2.5 py-1 text-[var(--cl-muted)]">
            日均 <strong className="text-[var(--cl-text)]">{formatBytes(data?.daily_avg_bytes)}</strong>
          </span>
          <span className="rounded-md border border-[var(--cl-border)] px-2.5 py-1 text-[var(--cl-muted)]">
            峰值{' '}
            <strong className="text-amber-500">
              {data?.peak_day ? `${data.peak_day} · ${formatBytes(data.peak_bytes)}` : '暂无'}
            </strong>
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <EChartBox option={option} className="h-[146px] w-full" onChartReady={handleReady} />
        </div>
      </div>
    </div>
  )
}
