import type { ThemeDefinition } from '../types'

const SANS_STACK =
  '"Inter", "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", sans-serif'
const MONO_STACK =
  '"JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export const auroraMeshTheme: ThemeDefinition = {
  id: 'aurora-mesh',
  name: '极光暗黑',
  description: '弥散极光背景 · 磨砂玻璃卡片与渐变发光图表',
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
      dark: 'rgba(10, 16, 32, 0.90)',
      light: 'rgba(248, 251, 255, 0.94)',
    },
    heatmapBorderColor: {
      dark: 'rgba(7, 11, 20, 0.45)',
      light: 'rgba(238, 243, 249, 0.65)',
    },
  },
  modes: {
    dark: {
      bgPage: '#050916',
      bgSidebar: 'rgba(8, 14, 30, 0.72)',
      bgSurface: 'rgba(13, 22, 46, 0.54)',
      bgSurfaceHover: 'rgba(30, 48, 86, 0.56)',
      borderSubtle: 'rgba(125, 211, 252, 0.17)',
      borderFocus: 'rgba(56, 189, 248, 0.55)',
      textPrimary: '#EDF2FA',
      textSecondary: '#9FB0CC',
      textMuted: '#697C9C',
      accentPrimary: '#38BDF8',
      accentSoft: 'rgba(56, 189, 248, 0.16)',
      statusSuccess: '#34D399',
      statusWarning: '#FBBF24',
      statusDanger: '#FB7185',
      chartPalette: ['#38BDF8', '#A78BFA', '#22D3EE', '#F472B6', '#FBBF24', '#34D399', '#818CF8', '#94A3B8'],
      heatmapScale: ['rgba(148, 197, 255, 0.06)', '#253D6E', '#5B46C6', '#8B5CF6', '#38BDF8'],
      semanticMetrics: {
        proxy: '#8B5CF6',
        direct: '#10B981',
        reject: '#FB7185',
        download: '#38BDF8',
        upload: '#F59E0B',
        actual: '#38BDF8',
        billed: '#F472B6',
      },
    },
    light: {
      bgPage: '#EEF3F9',
      bgSidebar: 'rgba(235, 242, 250, 0.80)',
      bgSurface: 'rgba(255, 255, 255, 0.74)',
      bgSurfaceHover: 'rgba(224, 236, 248, 0.72)',
      borderSubtle: 'rgba(15, 35, 66, 0.10)',
      borderFocus: 'rgba(2, 132, 199, 0.42)',
      textPrimary: '#132035',
      textSecondary: '#3E526D',
      textMuted: '#627794',
      accentPrimary: '#0284C7',
      accentSoft: 'rgba(2, 132, 199, 0.12)',
      statusSuccess: '#059669',
      statusWarning: '#C97A08',
      statusDanger: '#E11D48',
      chartPalette: ['#059669', '#0284C7', '#7C3AED', '#D97706', '#DB2777', '#0D9488', '#4F46E5', '#64748B'],
      heatmapScale: ['rgba(15, 35, 66, 0.06)', '#BAE6FD', '#7DD3FC', '#818CF8', '#0284C7'],
      semanticMetrics: {
        proxy: '#7C3AED',
        direct: '#059669',
        reject: '#E11D48',
        download: '#0284C7',
        upload: '#D97706',
        actual: '#0284C7',
        billed: '#DB2777',
      },
    },
  },
}
