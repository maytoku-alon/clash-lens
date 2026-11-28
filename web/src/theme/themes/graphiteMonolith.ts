import type { ThemeDefinition } from '../types'

const SANS_STACK =
  '"Inter", "Geist", "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", sans-serif'
const MONO_STACK =
  '"Geist Mono", "JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export const graphiteMonolithTheme: ThemeDefinition = {
  id: 'graphite-monolith',
  name: 'Graphite Monolith',
  description: '工业曜石 · 冷银炭黑与钢青微光，极致克制的专业监控台秩序感',
  defaultLayout: 'classic',
  typography: {
    fontSans: SANS_STACK,
    fontMono: MONO_STACK,
    baseSize: '14px',
  },
  chartEffects: {
    barGradient: true,
    areaGradient: true,
    lineGlow: false,
    tooltipBg: {
      dark: 'rgba(17, 20, 24, 0.94)',
      light: 'rgba(238, 241, 245, 0.96)',
    },
    heatmapBorderColor: {
      dark: 'rgba(12, 14, 17, 0.55)',
      light: 'rgba(227, 231, 236, 0.70)',
    },
  },
  modes: {
    dark: {
      bgPage: '#0C0E11',
      bgSidebar: '#111418',
      bgSurface: '#171B20',
      bgSurfaceHover: '#1F242B',
      borderSubtle: 'rgba(205, 220, 235, 0.08)',
      borderFocus: 'rgba(141, 175, 208, 0.45)',
      textPrimary: '#E4E8ED',
      textSecondary: '#A4ADB8',
      textMuted: '#7A8592',
      accentPrimary: '#8DAFD0',
      accentSoft: 'rgba(141, 175, 208, 0.13)',
      statusSuccess: '#6BCB9B',
      statusWarning: '#E3B25A',
      statusDanger: '#EF7A7A',
      chartPalette: ['#8DAFD0', '#E8876F', '#6BCB9B', '#E3B25A', '#B58DE0', '#5BB8B0', '#D97FA6', '#8793A1'],
      heatmapScale: ['#161A1F', '#1F2D3B', '#2F4A63', '#5A82A8', '#9CC0E0'],
      semanticMetrics: {
        proxy: '#7BA7E0',
        direct: '#A3CF78',
        reject: '#EF6B6B',
        download: '#62C0D8',
        upload: '#E8876F',
        actual: '#5BB8B0',
        billed: '#B58DE0',
      },
    },
    light: {
      bgPage: '#E3E7EC',
      bgSidebar: '#D9DEE5',
      bgSurface: '#EEF1F5',
      bgSurfaceHover: '#E1E6EC',
      borderSubtle: 'rgba(20, 30, 45, 0.11)',
      borderFocus: 'rgba(52, 98, 140, 0.45)',
      textPrimary: '#1B232D',
      textSecondary: '#46525F',
      textMuted: '#5F6B78',
      accentPrimary: '#31618C',
      accentSoft: 'rgba(49, 97, 140, 0.11)',
      statusSuccess: '#1A8056',
      statusWarning: '#9C6208',
      statusDanger: '#C93A3A',
      chartPalette: ['#31618C', '#C44E33', '#1A8056', '#B07A12', '#7A4FB5', '#1B807A', '#B84A7E', '#66727F'],
      heatmapScale: ['#DCE1E7', '#C5D5E5', '#98B6D2', '#5F8AB1', '#31618C'],
      semanticMetrics: {
        proxy: '#3F6FB5',
        direct: '#528019',
        reject: '#C93A3A',
        download: '#187A9C',
        upload: '#C44E33',
        actual: '#1B807A',
        billed: '#7A4FB5',
      },
    },
  },
}
