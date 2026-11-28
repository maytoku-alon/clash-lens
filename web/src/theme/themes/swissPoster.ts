import type { ThemeDefinition } from '../types'

const SANS_STACK =
  '"Archivo", "Helvetica Neue", "Neue Haas Grotesk Text Pro", "Inter", "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", Arial, sans-serif'
const MONO_STACK =
  '"JetBrains Mono", "IBM Plex Mono", "Cascadia Code", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export const swissPosterTheme: ThemeDefinition = {
  id: 'swiss-poster',
  name: 'Swiss Poster',
  description: '国际主义海报 · 超大字号、粗黑规线与布劳恩橙，零圆角零阴影',
  defaultLayout: 'bento',
  typography: {
    fontSans: SANS_STACK,
    fontMono: MONO_STACK,
    baseSize: '14px',
  },
  chartEffects: {
    barGradient: false,
    areaGradient: false,
    lineGlow: false,
    tooltipBg: {
      dark: 'rgba(23, 23, 21, 0.98)',
      light: 'rgba(247, 245, 239, 0.98)',
    },
    heatmapBorderColor: {
      dark: 'rgba(12, 12, 11, 0.85)',
      light: 'rgba(236, 233, 225, 0.90)',
    },
  },
  modes: {
    dark: {
      bgPage: '#0C0C0B',
      bgSidebar: '#121210',
      bgSurface: '#171715',
      bgSurfaceHover: '#20201D',
      borderSubtle: 'rgba(242, 239, 230, 0.16)',
      borderFocus: 'rgba(255, 90, 20, 0.80)',
      textPrimary: '#F2EFE6',
      textSecondary: '#B3AFA3',
      textMuted: '#8A867A',
      accentPrimary: '#FF5A14',
      accentSoft: 'rgba(255, 90, 20, 0.14)',
      statusSuccess: '#2FD1A0',
      statusWarning: '#FFC21A',
      statusDanger: '#FF2E4D',
      chartPalette: ['#FF5A14', '#4D7CFF', '#FFC21A', '#2FD1B5', '#C77DFF', '#F2EFE6', '#FF7AB0', '#8A877C'],
      heatmapScale: ['#1B1B18', '#3A1D10', '#7A300F', '#C4470F', '#FF5A14'],
      semanticMetrics: {
        proxy: '#5B84FF',
        direct: '#FF5A14',
        reject: '#FF2E4D',
        download: '#2FD1B5',
        upload: '#FFC21A',
        actual: '#C77DFF',
        billed: '#FF5A14',
      },
    },
    light: {
      bgPage: '#ECE9E1',
      bgSidebar: '#E9E5DC',
      bgSurface: '#F7F5EF',
      bgSurfaceHover: '#EAE6DB',
      borderSubtle: 'rgba(20, 20, 20, 0.20)',
      borderFocus: 'rgba(217, 70, 10, 0.80)',
      textPrimary: '#141414',
      textSecondary: '#3A3A37',
      textMuted: '#625F58',
      accentPrimary: '#B03404',
      accentSoft: 'rgba(176, 52, 4, 0.11)',
      statusSuccess: '#0B7A55',
      statusWarning: '#9A6A00',
      statusDanger: '#B3122E',
      chartPalette: ['#B03404', '#1F3FA6', '#D99A00', '#0B7A6A', '#7A2E8E', '#141414', '#C2467F', '#76736A'],
      heatmapScale: ['#E2DED3', '#F6D2BC', '#EE9A6C', '#DD5F22', '#A93205'],
      semanticMetrics: {
        proxy: '#1F3FA6',
        direct: '#BF3C07',
        reject: '#B3122E',
        download: '#0B7A6A',
        upload: '#A87500',
        actual: '#7A2E8E',
        billed: '#BF3C07',
      },
    },
  },
}
