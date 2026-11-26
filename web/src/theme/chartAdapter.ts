import { computeNiceByteScale, computeNiceSpeedScale, formatAxisBytes, formatAxisSpeed } from '../adapters/trafficAdapter'
import type { ColorMode, ThemeTokens } from './types'

export interface ChartThemeConfig {
  mode: ColorMode
  palette: string[]
  heatmapScale: [string, string, string, string, string]
  heatmapBorderColor: string
  tooltip: {
    backgroundColor: string
    borderColor: string
    textStyle: { color: string; fontSize: number }
  }
  legendTextStyle: { color: string; fontSize: number }
  axisLine: { lineStyle: { color: string } }
  splitLine: { lineStyle: { color: string; type: 'dashed' | 'solid' } }
  axisLabelColor: string
  textPrimary: string
  textMuted: string
  accentPrimary: string
  accentSoft: string
  barBorderRadius: [number, number, number, number]
  routeColors: {
    PROXY: string
    DIRECT: string
    REJECT: string
  }
  liveColors: {
    down: string
    up: string
    downArea: string
    upArea: string
  }
  sankeyColors: {
    app: string
    domain: string
    direct: string
    proxy: string
  }
}

function withAlpha(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '').trim()
  if (cleaned.length !== 6) {
    return `rgba(167, 139, 250, ${alpha})`
  }
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(167, 139, 250, ${alpha})`
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function buildChartTheme(tokens: ThemeTokens, mode: ColorMode): ChartThemeConfig {
  const palette = tokens.chartPalette
  const downColor = palette[1] ?? tokens.accentPrimary
  const upColor = palette[2] ?? tokens.accentPrimary
  return {
    mode,
    palette,
    heatmapScale: tokens.heatmapScale,
    heatmapBorderColor: tokens.bgSurface,
    tooltip: {
      backgroundColor: tokens.bgSurface,
      borderColor: tokens.borderSubtle,
      textStyle: { color: tokens.textPrimary, fontSize: 12 },
    },
    legendTextStyle: {
      color: tokens.textMuted,
      fontSize: 11,
    },
    axisLine: {
      lineStyle: { color: tokens.borderSubtle },
    },
    splitLine: {
      lineStyle: { color: tokens.borderSubtle, type: 'dashed' },
    },
    axisLabelColor: tokens.textMuted,
    textPrimary: tokens.textPrimary,
    textMuted: tokens.textMuted,
    accentPrimary: tokens.accentPrimary,
    accentSoft: tokens.accentSoft,
    barBorderRadius: [3, 3, 0, 0],
    routeColors: {
      PROXY: palette[0] ?? tokens.statusSuccess,
      DIRECT: palette[2] ?? tokens.accentPrimary,
      REJECT: tokens.statusDanger,
    },
    liveColors: {
      down: downColor,
      up: upColor,
      downArea: withAlpha(downColor, mode === 'dark' ? 0.16 : 0.12),
      upArea: withAlpha(upColor, mode === 'dark' ? 0.14 : 0.10),
    },
    sankeyColors: {
      app: palette[0] ?? tokens.accentPrimary,
      domain: palette[1] ?? tokens.statusSuccess,
      direct: palette[2] ?? tokens.textMuted,
      proxy: palette[4] ?? tokens.accentPrimary,
    },
  }
}

export function buildByteValueAxis(maxBytes: number, chartTheme: ChartThemeConfig, fontSize = 11) {
  const scale = computeNiceByteScale(maxBytes, 4)
  return {
    type: 'value' as const,
    min: scale.min,
    max: scale.max,
    interval: scale.interval,
    splitLine: chartTheme.splitLine,
    axisLabel: {
      color: chartTheme.axisLabelColor,
      fontSize,
      formatter: (val: number) => formatAxisBytes(val),
    },
  }
}

export function buildSpeedValueAxis(maxBps: number, chartTheme: ChartThemeConfig, fontSize = 10) {
  const scale = computeNiceSpeedScale(maxBps, 4)
  return {
    type: 'value' as const,
    min: scale.min,
    max: scale.max,
    interval: scale.interval,
    splitLine: chartTheme.splitLine,
    axisLabel: {
      color: chartTheme.axisLabelColor,
      fontSize,
      formatter: (val: number) => formatAxisSpeed(val),
    },
  }
}
