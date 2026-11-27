import { useEffect, useMemo, useRef, useState } from 'react'
import type * as echarts from 'echarts'
import { Crosshair, Search, X } from 'lucide-react'
import { maxStackedSeriesValue } from '../adapters/trafficAdapter'
import { trafficApi } from '../api/trafficApi'
import { useI18n } from '../i18n/I18nProvider'
import { buildByteValueAxis, buildChartTheme } from '../theme/chartAdapter'
import { useTheme } from '../theme/ThemeProvider'
import type { BurstEvent, GroupByDim, TimeseriesResponse, TrafficScope } from '../types/api'
import { formatBytes, formatFullTime, formatTimeBucket } from '../utils/format'
import { maskHostOrDomain } from '../utils/privacy'
import { EChartBox } from './EChartBox'

const DIM_KEYS: GroupByDim[] = ['process', 'domain', 'device', 'node', 'direction']

interface TrafficStackChartProps {
  data: TimeseriesResponse | null
  groupBy: GroupByDim
  onGroupByChange: (dim: GroupByDim) => void
  deviceId: string
  scope: TrafficScope
  onInspectApp: (appName: string) => void
}

export function TrafficStackChart({
  data,
  groupBy,
  onGroupByChange,
  deviceId,
  scope,
  onInspectApp,
}: TrafficStackChartProps) {
  const { theme, tokens, colorMode, privacyMode } = useTheme()
  const { lang, m, resolveProcessName, resolveServiceTag } = useI18n()
  const chartTheme = useMemo(
    () => buildChartTheme(tokens, colorMode, theme.chartEffects),
    [tokens, colorMode, theme.chartEffects],
  )

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
      const res = await trafficApi.bursts(
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
    const peakStacked = maxStackedSeriesValue(seriesList)
    const displaySeriesNames = seriesList.map((s) => {
      const raw = s.label || s.name
      if (raw === '其他') return m.common.other
      if (groupBy === 'domain') return maskHostOrDomain(raw, privacyMode)
      if (groupBy === 'process') return resolveProcessName(raw, s.name)
      if (groupBy === 'direction') {
        if (raw === '下行') return m.live.downSpeedSeries
        if (raw === '上行') return m.live.upSpeedSeries
      }
      return raw
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
              return `<div style="display:flex;justify-content:space-between;gap:18px;font-family:var(--cl-font-mono);">
                <span>${item.marker || ''}${item.seriesName || ''}</span>
                <span style="font-weight:600;">${formatBytes(v)}</span>
              </div>`
            })
            .join('')
          return `
            <div style="min-width:190px;">
              <div style="font-weight:600;margin-bottom:4px;font-family:var(--cl-font-mono);">${first.axisValueLabel || ''}</div>
              ${rows || `<div style="color:${chartTheme.textMuted};">${m.overview.tooltipNoFlow}</div>`}
              <div style="border-top:1px solid ${chartTheme.tooltip.borderColor};margin-top:5px;padding-top:4px;display:flex;justify-content:space-between;font-family:var(--cl-font-mono);">
                <span style="color:${chartTheme.textMuted};">${m.overview.tooltipBucketTotal}</span>
                <span style="font-weight:700;color:${chartTheme.accentPrimary};">${formatBytes(total)}</span>
              </div>
            </div>
          `
        },
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        textStyle: chartTheme.legendTextStyle,
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
          color: chartTheme.accentSoft,
          borderColor: chartTheme.accentPrimary,
        },
      },
      grid: {
        top: 16,
        left: 58,
        right: 16,
        bottom: 42,
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: chartTheme.axisLine,
        axisLabel: { color: chartTheme.axisLabelColor, fontSize: 11 },
      },
      yAxis: buildByteValueAxis(peakStacked, chartTheme, 11),
      series: seriesList.map((s, idx) => ({
        name: displaySeriesNames[idx],
        type: 'bar',
        stack: 'total',
        barMaxWidth: 28,
        itemStyle: {
          color: chartTheme.barItemColor(chartTheme.palette[idx % chartTheme.palette.length]),
          borderRadius: [2, 2, 0, 0],
        },
        emphasis: { focus: 'series' },
        data: s.values,
      })),
    }
  }, [data, chartTheme, groupBy, privacyMode, m, resolveProcessName])

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

  const dimLabel: Record<GroupByDim, string> = {
    process: m.overview.dimProcess,
    domain: m.overview.dimDomain,
    device: m.overview.dimDevice,
    node: m.overview.dimNode,
    direction: m.overview.dimDirection,
  }

  return (
    <div className="cl-card flex h-full flex-col rounded-xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{m.overview.stackTitle}</h2>
          <p className="text-xs text-[var(--cl-text-muted)]">{m.overview.stackSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="cl-segment">
            {DIM_KEYS.map((key) => (
              <button
                type="button"
                key={key}
                onClick={() => onGroupByChange(key)}
                className={`cl-segment-item ${groupBy === key ? 'cl-segment-item-active' : ''}`}
                style={groupBy === key ? { color: 'var(--cl-accent-primary)' } : undefined}
              >
                {dimLabel[key]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setBrushMode((v) => !v)}
            className={brushMode ? 'cl-btn-accent' : 'cl-btn-secondary'}
          >
            <Crosshair className="h-3.5 w-3.5" strokeWidth={1.6} />
            {brushMode ? m.overview.brushActive : m.overview.brushIdle}
          </button>
        </div>
      </div>

      <EChartBox option={option} className="h-[290px] w-full" onChartReady={handleReady} />

      {inspectedRange && (
        <div
          className="mt-4 rounded-xl border p-3.5"
          style={{
            borderColor: 'var(--cl-border-focus)',
            backgroundColor: 'var(--cl-accent-soft)',
          }}
        >
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <Search className="h-3.5 w-3.5" style={{ color: 'var(--cl-accent-primary)' }} />
              <span className="font-semibold" style={{ color: 'var(--cl-accent-primary)' }}>
                {m.overview.spikeInspectTitle}
              </span>
              <span className="font-mono tabular-nums text-[var(--cl-text-muted)]">
                {formatFullTime(inspectedRange.from, lang)} → {formatFullTime(inspectedRange.to, lang)}
              </span>
              {showSlowLoading && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px]"
                  style={{
                    backgroundColor: 'var(--cl-accent-soft)',
                    color: 'var(--cl-accent-primary)',
                  }}
                >
                  {m.overview.querying}
                </span>
              )}
            </div>
            <button
              onClick={clearInspection}
              className="rounded p-1 text-[var(--cl-text-muted)] hover:bg-[var(--cl-bg-surface-hover)] hover:text-[var(--cl-text-primary)]"
              title={m.overview.closeInspectTitle}
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
                {spikeItems.slice(0, 6).map((item, idx) => {
                  const tag = resolveServiceTag(item.service_tag, item.root_domain)
                  return (
                    <button
                      key={`${item.bucket_ts}-${item.process_display}-${item.root_domain}-${idx}`}
                      onClick={() => onInspectApp(item.process_display)}
                      className="flex cursor-pointer flex-col gap-1 rounded-lg border p-2.5 text-left transition hover:border-[var(--cl-border-focus)]"
                      style={{
                        borderColor: 'var(--cl-border-subtle)',
                        backgroundColor: 'var(--cl-bg-surface)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold">
                          {resolveProcessName(item.process_display)}
                        </span>
                        <span
                          className="font-mono text-xs font-bold tabular-nums"
                          style={{ color: 'var(--cl-accent-primary)' }}
                        >
                          {formatBytes(item.total_bytes)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--cl-text-muted)]">
                        <span className="truncate">
                          {maskHostOrDomain(item.root_domain, privacyMode)}
                          {tag ? ` · ${tag}` : ''}
                        </span>
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]"
                          style={{ backgroundColor: 'var(--cl-bg-surface-hover)' }}
                        >
                          {item.route_type === 'DIRECT' ? 'DIRECT' : item.egress_node}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : !hasLoaded ? (
              showSlowLoading ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      className="h-[58px] animate-pulse rounded-lg border"
                      style={{
                        borderColor: 'var(--cl-border-subtle)',
                        backgroundColor: 'var(--cl-bg-surface)',
                      }}
                    />
                  ))}
                </div>
              ) : null
            ) : (
              <div className="flex h-[124px] items-center justify-center text-xs text-[var(--cl-text-muted)]">
                {m.overview.spikeEmpty}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
