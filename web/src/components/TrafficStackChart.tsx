import { useEffect, useMemo, useRef, useState } from 'react'
import type * as echarts from 'echarts'
import { Crosshair, Search, X } from 'lucide-react'
import { EChartBox } from './EChartBox'
import { api } from '../api/client'
import type { BurstEvent, GroupByDim, TimeseriesResponse, TrafficScope } from '../types/api'
import { formatBytes, formatFullTime, formatTimeBucket } from '../utils/format'

const PALETTE = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#71717a']

const DIM_TABS: { key: GroupByDim; label: string }[] = [
  { key: 'process', label: '按应用' },
  { key: 'domain', label: '按网站' },
  { key: 'device', label: '按设备' },
  { key: 'node', label: '按节点' },
  { key: 'direction', label: '上下行' },
]

interface TrafficStackChartProps {
  data: TimeseriesResponse | null
  groupBy: GroupByDim
  onGroupByChange: (dim: GroupByDim) => void
  deviceId: string
  scope: TrafficScope
  isDark: boolean
  onInspectApp: (appName: string) => void
}

export function TrafficStackChart({
  data,
  groupBy,
  onGroupByChange,
  deviceId,
  scope,
  isDark,
  onInspectApp,
}: TrafficStackChartProps) {
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [brushMode, setBrushMode] = useState(false)
  const [inspectedRange, setInspectedRange] = useState<{ from: number; to: number } | null>(null)
  const [spikeItems, setSpikeItems] = useState<BurstEvent[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [showSlowLoading, setShowSlowLoading] = useState(false)

  const timestampsRef = useRef<number[]>([])
  const intervalRef = useRef<'minute' | 'hour' | 'day'>('hour')
  const deviceIdRef = useRef(deviceId)
  const scopeRef = useRef(scope)
  const reqSeqRef = useRef(0)
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  timestampsRef.current = data?.timestamps ?? []
  intervalRef.current = data?.interval ?? 'hour'
  deviceIdRef.current = deviceId
  scopeRef.current = scope

  useEffect(() => {
    return () => {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.dispatchAction({
      type: 'takeGlobalCursor',
      key: 'brush',
      brushOption: brushMode
        ? { brushType: 'lineX', brushMode: 'single' }
        : { brushType: false, brushMode: 'single' },
    })
  }, [brushMode])

  const loadSpikeRange = async (fromTS: number, toTS: number) => {
    const seq = ++reqSeqRef.current
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current)
      loadingTimerRef.current = null
    }
    setInspectedRange({ from: fromTS, to: toTS })
    setShowSlowLoading(false)
    loadingTimerRef.current = setTimeout(() => {
      if (reqSeqRef.current === seq) {
        setShowSlowLoading(true)
      }
    }, 150)

    try {
      const res = await api.bursts(
        { deviceId: deviceIdRef.current, scope: scopeRef.current, from: fromTS, to: toTS },
        10,
      )
      if (reqSeqRef.current !== seq) return
      setSpikeItems(res.items || [])
      setHasLoaded(true)
    } catch {
      if (reqSeqRef.current !== seq) return
      setSpikeItems([])
      setHasLoaded(true)
    } finally {
      if (reqSeqRef.current === seq) {
        if (loadingTimerRef.current) {
          clearTimeout(loadingTimerRef.current)
          loadingTimerRef.current = null
        }
        setShowSlowLoading(false)
      }
    }
  }

  const clearInspection = () => {
    reqSeqRef.current++
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current)
      loadingTimerRef.current = null
    }
    setShowSlowLoading(false)
    setHasLoaded(false)
    setInspectedRange(null)
    setSpikeItems([])
    chartRef.current?.dispatchAction({ type: 'brush', areas: [] })
  }

  const option = useMemo<echarts.EChartsCoreOption>(() => {
    const timestamps = data?.timestamps ?? []
    const interval = data?.interval ?? 'hour'
    const labels = timestamps.map((ts) => formatTimeBucket(ts, interval))
    const seriesList = data?.series ?? []

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
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : []
          if (list.length === 0) return ''
          const first = list[0] as { axisValueLabel?: string }
          let total = 0
          const rows = list
            .filter((item: { value?: number }) => Number(item.value || 0) > 0)
            .map((item: { marker?: string; seriesName?: string; value?: number }) => {
              const v = Number(item.value || 0)
              total += v
              return `<div style="display:flex;justify-content:space-between;gap:18px;font-family:ui-monospace,monospace;">
                <span>${item.marker || ''}${item.seriesName || ''}</span>
                <span style="font-weight:600;">${formatBytes(v)}</span>
              </div>`
            })
            .join('')
          return `
            <div style="min-width:190px;">
              <div style="font-weight:600;margin-bottom:4px;font-family:ui-monospace,monospace;">${first.axisValueLabel || ''}</div>
              ${rows || '<div style="color:#71717a;">无流量记录</div>'}
              <div style="border-top:1px solid ${gridLine};margin-top:5px;padding-top:4px;display:flex;justify-content:space-between;font-family:ui-monospace,monospace;">
                <span style="color:#a1a1aa;">时段合计</span>
                <span style="font-weight:700;color:#10b981;">${formatBytes(total)}</span>
              </div>
            </div>
          `
        },
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        textStyle: { color: textColor, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
      },
      brush: {
        xAxisIndex: 0,
        brushType: 'lineX',
        brushMode: 'single',
        toolbox: [],
        brushStyle: {
          borderWidth: 1,
          color: 'rgba(16, 185, 129, 0.14)',
          borderColor: 'rgba(16, 185, 129, 0.75)',
        },
      },
      grid: {
        top: 16,
        left: 56,
        right: 16,
        bottom: 42,
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: gridLine } },
        axisLabel: { color: textColor, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: gridLine } },
        axisLabel: {
          color: textColor,
          fontSize: 11,
          formatter: (val: number) => formatBytes(val, 0),
        },
      },
      series: seriesList.map((s) => ({
        name: s.label || s.name,
        type: 'bar',
        stack: 'total',
        barMaxWidth: 28,
        emphasis: { focus: 'series' },
        data: s.values,
      })),
    }
  }, [data, isDark])

  const handleReady = (chart: echarts.ECharts) => {
    chartRef.current = chart
    chart.on('brushEnd', (params: unknown) => {
      const p = params as { areas?: Array<{ coordRange?: [number, number] }> }
      const range = p.areas?.[0]?.coordRange
      const tsList = timestampsRef.current
      if (!range || tsList.length === 0) return
      const idxStart = Math.max(0, Math.min(tsList.length - 1, Math.round(range[0])))
      const idxEnd = Math.max(0, Math.min(tsList.length - 1, Math.round(range[1])))
      const lo = Math.min(idxStart, idxEnd)
      const hi = Math.max(idxStart, idxEnd)
      const step = intervalRef.current === 'minute' ? 60 : intervalRef.current === 'hour' ? 3600 : 86400
      const fromTS = tsList[lo]
      const toTS = tsList[hi] + step - 1
      void loadSpikeRange(fromTS, toTS)
    })

    chart.on('click', (params: unknown) => {
      const p = params as { dataIndex?: number }
      const tsList = timestampsRef.current
      if (p.dataIndex === undefined || !tsList[p.dataIndex]) return
      const step = intervalRef.current === 'minute' ? 60 : intervalRef.current === 'hour' ? 3600 : 86400
      const fromTS = tsList[p.dataIndex]
      void loadSpikeRange(fromTS, fromTS + step - 1)
    })
  }

  return (
    <div className="cl-card rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">分时流量分布与突发溯源</h2>
          <p className="text-xs text-[var(--cl-muted)]">
            点击任意柱状时段，或启用框选拖拽查看该时间段的精确进程与网站消耗
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="cl-segment">
            {DIM_TABS.map((t) => (
              <button
                type="button"
                key={t.key}
                onClick={() => onGroupByChange(t.key)}
                className={`cl-segment-item ${
                  groupBy === t.key ? 'cl-segment-item-active !text-emerald-400' : ''
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setBrushMode((v) => !v)}
            className={brushMode ? 'cl-btn-accent' : 'cl-btn-secondary'}
          >
            <Crosshair className="h-3.5 w-3.5" />
            {brushMode ? '框选中（拖拽图表）' : '框选溯源'}
          </button>
        </div>
      </div>

      <EChartBox option={option} className="h-[290px] w-full" onChartReady={handleReady} />

      {inspectedRange && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <Search className="h-3.5 w-3.5 text-emerald-500" />
              <span className="font-semibold text-emerald-400">时段流量溯源</span>
              <span className="font-mono tabular-nums text-[var(--cl-muted)]">
                {formatFullTime(inspectedRange.from)} → {formatFullTime(inspectedRange.to)}
              </span>
              {showSlowLoading && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
                  查询中...
                </span>
              )}
            </div>
            <button
              onClick={clearInspection}
              className="rounded p-1 text-[var(--cl-muted)] hover:bg-white/10 hover:text-[var(--cl-text)]"
              title="关闭溯源面板"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-h-[124px]">
            {spikeItems.length > 0 ? (
              <div
                className={`grid gap-2 transition-opacity duration-150 sm:grid-cols-2 lg:grid-cols-3 ${
                  showSlowLoading ? 'opacity-65' : 'opacity-100'
                }`}
              >
                {spikeItems.slice(0, 6).map((item, idx) => (
                  <button
                    key={`${item.bucket_ts}-${item.process_display}-${item.root_domain}-${idx}`}
                    onClick={() => onInspectApp(item.process_display)}
                    className="flex flex-col gap-1 rounded-lg border border-[var(--cl-border)] bg-[var(--cl-card)] p-2.5 text-left transition hover:border-emerald-500/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">{item.process_display}</span>
                      <span className="font-mono text-xs font-bold tabular-nums text-emerald-400">
                        {formatBytes(item.total_bytes)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--cl-muted)]">
                      <span className="truncate">
                        {item.root_domain}
                        {item.service_tag ? ` · ${item.service_tag}` : ''}
                      </span>
                      <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">
                        {item.route_type === 'DIRECT' ? 'DIRECT' : item.egress_node}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : !hasLoaded ? (
              showSlowLoading ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      className="h-[58px] animate-pulse rounded-lg border border-[var(--cl-border)] bg-[var(--cl-card)]/60"
                    />
                  ))}
                </div>
              ) : null
            ) : (
              <div className="flex h-[124px] items-center justify-center text-xs text-[var(--cl-muted)]">
                该时段暂无记录明细。
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
