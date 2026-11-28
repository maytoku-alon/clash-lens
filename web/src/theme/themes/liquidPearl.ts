import type { ThemeDefinition } from '../types'

const SANS_STACK =
  '"SF Pro Display", "Inter", "Segoe UI Variable Display", "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", sans-serif'
const MONO_STACK =
  '"SF Mono", "JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export const liquidPearlTheme: ThemeDefinition = {
  id: 'liquid-pearl',
  name: 'Liquid Pearl',
  description: '液态珍珠 · 悬浮玻璃码头导航、珍珠白毛玻璃与缓缓流动的彩色光斑',
  defaultLayout: 'bento',
  typography: {
    fontSans: SANS_STACK,
    fontMono: MONO_STACK,
    baseSize: '14px',
  },
  chartEffects: {
    barGradient: true,
    areaGradient: true,
    lineGlow: true,
    tooltipBg: {
      dark: 'rgba(28, 22, 36, 0.86)',
      light: 'rgba(255, 255, 255, 0.88)',
    },
    heatmapBorderColor: {
      dark: 'rgba(15, 11, 20, 0.40)',
      light: 'rgba(240, 242, 248, 0.70)',
    },
  },
  modes: {
    dark: {
      bgPage: '#0F0B14',
      bgSidebar: 'rgba(255, 255, 255, 0.07)',
      bgSurface: 'rgba(255, 255, 255, 0.055)',
      bgSurfaceHover: 'rgba(255, 255, 255, 0.10)',
      borderSubtle: 'rgba(255, 255, 255, 0.10)',
      borderFocus: 'rgba(255, 107, 157, 0.55)',
      textPrimary: '#F6F0F5',
      textSecondary: '#C2B8C8',
      textMuted: '#9A90A4',
      accentPrimary: '#FF6B9D',
      accentSoft: 'rgba(255, 107, 157, 0.15)',
      statusSuccess: '#4FD6A8',
      statusWarning: '#FFB454',
      statusDanger: '#FF6A4D',
      chartPalette: ['#FF6B9D', '#7C9CFF', '#FFB454', '#4FD6B0', '#B48CFF', '#FF8E6B', '#6FD6E8', '#9A93A8'],
      heatmapScale: ['rgba(255, 255, 255, 0.05)', '#4A1D3A', '#8F2D63', '#D84A89', '#FF8FB6'],
      semanticMetrics: {
        proxy: '#8E8CFF',
        direct: '#FFB454',
        reject: '#FF6A4D',
        download: '#4FD6B0',
        upload: '#FF6B9D',
        actual: '#7C9CFF',
        billed: '#FFD25E',
      },
    },
    light: {
      bgPage: '#E8EBF4',
      bgSidebar: 'rgba(255, 255, 255, 0.62)',
      bgSurface: 'rgba(255, 255, 255, 0.58)',
      bgSurfaceHover: 'rgba(255, 255, 255, 0.82)',
      borderSubtle: 'rgba(48, 36, 92, 0.10)',
      borderFocus: 'rgba(196, 42, 98, 0.45)',
      textPrimary: '#1C1A2E',
      textSecondary: '#4A4763',
      textMuted: '#686581',
      accentPrimary: '#C42A62',
      accentSoft: 'rgba(196, 42, 98, 0.10)',
      statusSuccess: '#0F8F6A',
      statusWarning: '#A86200',
      statusDanger: '#D93A1C',
      chartPalette: ['#C42A62', '#4F6BE8', '#D98A12', '#0F9F7C', '#8B5CF6', '#E0562B', '#1596B8', '#6F6B85'],
      heatmapScale: ['rgba(60, 45, 110, 0.06)', '#F9D3E1', '#F2A3C0', '#E0608F', '#C42A62'],
      semanticMetrics: {
        proxy: '#5B5BE0',
        direct: '#A87500',
        reject: '#D93A1C',
        download: '#0F9F7C',
        upload: '#C42A62',
        actual: '#4F6BE8',
        billed: '#B8860B',
      },
    },
  },
}
