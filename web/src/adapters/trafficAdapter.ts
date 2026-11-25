import type { HeatmapDay, HeatmapResponse, OverviewResponse } from '../types/api'

export interface NiceAxisScale {
  min: number
  max: number
  interval: number
}

const BINARY_UNITS = [1, 1024, 1024 ** 2, 1024 ** 3, 1024 ** 4, 1024 ** 5]
const BINARY_LABELS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

/**
 * Selects a 1024-base binary unit first, then picks a decimal nice interval (1/2/5 * 10^n)
 * within that unit and converts back to exact bytes, eliminating odd ticks like "667.6 MB".
 */
export function computeNiceByteScale(maxBytes: number, targetTicks = 4): NiceAxisScale {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    return { min: 0, max: 4 * 1024, interval: 1024 }
  }

  let unitIdx = 0
  while (unitIdx < BINARY_UNITS.length - 1 && maxBytes >= BINARY_UNITS[unitIdx + 1]) {
    unitIdx++
  }
  if (unitIdx < BINARY_UNITS.length - 1 && maxBytes / BINARY_UNITS[unitIdx] >= 1000) {
    unitIdx++
  }

  const unit = BINARY_UNITS[unitIdx]
  const valueInUnit = maxBytes / unit
  const roughStep = Math.max(valueInUnit / Math.max(1, targetTicks), 1e-9)
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const residual = roughStep / magnitude

  let niceStepNorm = 10
  if (residual <= 1) {
    niceStepNorm = 1
  } else if (residual <= 2) {
    niceStepNorm = 2
  } else if (residual <= 5) {
    niceStepNorm = 5
  }

  const stepInUnit = niceStepNorm * magnitude
  const maxInUnit = Math.ceil(valueInUnit / stepInUnit) * stepInUnit

  return {
    min: 0,
    max: Math.max(1, Math.round(maxInUnit * unit)),
    interval: Math.max(1, Math.round(stepInUnit * unit)),
  }
}

export function computeNiceSpeedScale(maxBps: number, targetTicks = 4): NiceAxisScale {
  return computeNiceByteScale(maxBps, targetTicks)
}

/** Formats axis tick byte values cleanly without trailing ".0" on exact integers. */
export function formatAxisBytes(bytes: number): string {
  const b = Number(bytes || 0)
  if (!Number.isFinite(b) || b <= 0) return '0 B'
  let unitIdx = 0
  while (unitIdx < BINARY_UNITS.length - 1 && b >= BINARY_UNITS[unitIdx + 1] * 0.999999) {
    unitIdx++
  }
  const val = b / BINARY_UNITS[unitIdx]
  if (unitIdx === 0) return `${Math.round(val)} B`
  const rounded = Math.round(val * 10) / 10
  const str = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${str} ${BINARY_LABELS[unitIdx]}`
}

export function formatAxisSpeed(bps: number): string {
  return `${formatAxisBytes(bps)}/s`
}

export function maxStackedSeriesValue(series: { values: number[] }[] | undefined): number {
  if (!series || series.length === 0) return 0
  let maxLen = 0
  for (const s of series) {
    if (s.values.length > maxLen) maxLen = s.values.length
  }
  let peak = 0
  for (let i = 0; i < maxLen; i++) {
    let sum = 0
    for (const s of series) {
      sum += Number(s.values[i] || 0)
    }
    if (sum > peak) peak = sum
  }
  return peak
}

export interface HeatmapViewModel {
  start: string
  end: string
  q1: number
  q2: number
  q3: number
  byDate: Map<string, HeatmapDay>
  points: [string, number][]
}

export function buildHeatmapViewModel(data: HeatmapResponse | null): HeatmapViewModel {
  const days = data?.days ?? []
  const today = new Date()
  const yearAgo = new Date(today.getTime() - 364 * 86400 * 1000)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const start = days[0]?.date ?? fmt(yearAgo)
  const end = days[days.length - 1]?.date ?? fmt(today)

  const nonZero = days
    .map((d) => d.total_bytes)
    .filter((v) => v > 0)
    .sort((a, b) => a - b)
  const quantile = (p: number) => {
    if (nonZero.length === 0) return 0
    const idx = Math.min(nonZero.length - 1, Math.floor(nonZero.length * p))
    return nonZero[idx]
  }
  const q1 = Math.max(quantile(0.25), 1024)
  const q2 = Math.max(quantile(0.5), q1 + 1024)
  const q3 = Math.max(quantile(0.75), q2 + 1024)

  const byDate = new Map(days.map((d) => [d.date, d]))
  const points: [string, number][] = days.map((d) => [d.date, d.total_bytes])
  return { start, end, q1, q2, q3, byDate, points }
}

export interface OverviewViewModel {
  todayProxyPct: number
  quotaPct: number
  hasQuota: boolean
}

export function buildOverviewViewModel(overview: OverviewResponse | null): OverviewViewModel {
  const todayProxyPct =
    overview && overview.today_bytes > 0
      ? Math.round((overview.today_proxy_bytes / overview.today_bytes) * 100)
      : 0
  const hasQuota = Boolean(overview?.quota?.enabled)
  const quotaPct = Math.min(100, Math.max(0, overview?.quota?.used_percent ?? 0))
  return { todayProxyPct, quotaPct, hasQuota }
}
