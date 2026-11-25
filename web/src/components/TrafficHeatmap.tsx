import { useMemo } from 'react'
import type * as echarts from 'echarts'
import { buildHeatmapViewModel } from '../adapters/trafficAdapter'
import { buildChartTheme } from '../theme/chartAdapter'
import { useTheme } from '../theme/ThemeProvider'
import type { HeatmapResponse } from '../types/api'
import { formatBytes } from '../utils/format'
import { EChartBox } from './EChartBox'

interface TrafficHeatmapProps {
  data: HeatmapResponse | null
  onSelectDay: (dateStr: string) => void
}

export function TrafficHeatmap({ data, onSelectDay }: TrafficHeatmapProps) {
  const { tokens, colorMode } = useTheme()
  const chartTheme = useMemo(() => buildChartTheme(tokens, colorMode), [tokens, colorMode])
  const vm = useMemo(() => buildHeatmapViewModel(data), [data])

  const option = useMemo<echarts.EChartsCoreOption>(() => {
    const { start, end, q1, q2, q3, byDate, points } = vm
    const [lvl0, lvl1, lvl2, lvl3, lvl4] = chartTheme.heatmapScale

    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: chartTheme.tooltip.backgroundColor,
        borderColor: chartTheme.tooltip.borderColor,
        textStyle: chartTheme.tooltip.textStyle,
        formatter: (params: unknown) => {
          const p = params as { value: [string, number] }
          const date = p.value?.[0]
          const item = date ? byDate.get(date) : undefined
          if (!item) return ''
          return `
            <div style="font-family: var(--cl-font-mono); min-width: 170px;">
              <div style="font-weight: 600; margin-bottom: 4px;">${item.date}</div>
              <div style="display:flex;justify-content:space-between;gap:16px;">
                <span style="color:${chartTheme.textMuted};">总计</span>
                <span style="font-weight:600;color:${chartTheme.accentPrimary};">${formatBytes(item.total_bytes)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:16px;">
                <span style="color:${chartTheme.textMuted};">代理</span>
                <span>${formatBytes(item.proxy_bytes)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:16px;">
                <span style="color:${chartTheme.textMuted};">直连</span>
                <span>${formatBytes(item.direct_bytes)}</span>
              </div>
              <div style="margin-top:4px;font-size:11px;color:${chartTheme.textMuted};">点击下钻查看当日详情</div>
            </div>
          `
        },
      },
      visualMap: {
        type: 'piecewise',
        show: false,
        pieces: [
          { lte: 0, color: lvl0 },
          { gt: 0, lte: q1, color: lvl1 },
          { gt: q1, lte: q2, color: lvl2 },
          { gt: q2, lte: q3, color: lvl3 },
          { gt: q3, color: lvl4 },
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
          color: 'transparent',
          borderWidth: 2,
          borderColor: chartTheme.heatmapBorderColor,
          borderRadius: 2,
        },
        yearLabel: { show: false },
        monthLabel: {
          nameMap: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
          color: chartTheme.axisLabelColor,
          fontSize: 11,
        },
        dayLabel: {
          firstDay: 1,
          nameMap: ['日', '一', '二', '三', '四', '五', '六'],
          color: chartTheme.axisLabelColor,
          fontSize: 10,
        },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: points,
        },
      ],
    }
  }, [vm, chartTheme])

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
          <p className="text-xs text-[var(--cl-text-muted)]">
            活跃度网格视图，点击任意日期可下钻至当日流量详情
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span
            className="rounded-md border px-2.5 py-1 text-[var(--cl-text-muted)]"
            style={{ borderColor: 'var(--cl-border-subtle)' }}
          >
            活跃 <strong style={{ color: 'var(--cl-text-primary)' }}>{data?.active_days ?? 0}</strong> 天
          </span>
          <span
            className="rounded-md border px-2.5 py-1 text-[var(--cl-text-muted)]"
            style={{ borderColor: 'var(--cl-border-subtle)' }}
          >
            连续 <strong style={{ color: 'var(--cl-status-success)' }}>{data?.current_streak ?? 0}</strong> 天
          </span>
          <span
            className="rounded-md border px-2.5 py-1 text-[var(--cl-text-muted)]"
            style={{ borderColor: 'var(--cl-border-subtle)' }}
          >
            日均 <strong style={{ color: 'var(--cl-text-primary)' }}>{formatBytes(data?.daily_avg_bytes)}</strong>
          </span>
          <span
            className="rounded-md border px-2.5 py-1 text-[var(--cl-text-muted)]"
            style={{ borderColor: 'var(--cl-border-subtle)' }}
          >
            峰值{' '}
            <strong style={{ color: 'var(--cl-status-warning)' }}>
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
