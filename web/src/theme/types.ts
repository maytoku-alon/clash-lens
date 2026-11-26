export type ColorMode = 'dark' | 'light'
export type LayoutPreset = 'classic' | 'bento'

/**
 * Mandatory semantic hue separation rule for any new theme:
 * Every contrasting metric pair (`proxy` vs `direct`, `download` vs `upload`, `actual` vs `billed`)
 * MUST keep an HSL hue separation ΔH >= 75°. Never put adjacent hues (e.g. blue + cyan or green + teal)
 * on opposing metric pairs, and never read route/speed/billed colors by indexing `chartPalette`.
 */
export interface SemanticMetricColors {
  proxy: string
  direct: string
  reject: string
  download: string
  upload: string
  actual: string
  billed: string
}

export interface ThemeTokens {
  bgPage: string
  bgSidebar: string
  bgSurface: string
  bgSurfaceHover: string
  borderSubtle: string
  borderFocus: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  accentPrimary: string
  accentSoft: string
  statusSuccess: string
  statusWarning: string
  statusDanger: string
  chartPalette: string[]
  heatmapScale: [string, string, string, string, string]
  semanticMetrics: SemanticMetricColors
}

export interface ThemeChartEffects {
  barGradient?: boolean
  areaGradient?: boolean
  lineGlow?: boolean
  tooltipBg?: Record<ColorMode, string>
  heatmapBorderColor?: Record<ColorMode, string>
}

export interface ThemeDefinition {
  id: string
  name: string
  description: string
  defaultLayout: LayoutPreset
  typography: {
    fontSans: string
    fontMono: string
    baseSize: string
  }
  chartEffects?: ThemeChartEffects
  modes: Record<ColorMode, ThemeTokens>
}
