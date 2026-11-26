export type ColorMode = 'dark' | 'light'
export type LayoutPreset = 'classic' | 'bento'

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
