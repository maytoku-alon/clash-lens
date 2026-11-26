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
      bgPage: '#070B14',
      bgSidebar: 'rgba(9, 14, 27, 0.78)',
      bgSurface: 'rgba(13, 20, 36, 0.66)',
      bgSurfaceHover: 'rgba(30, 45, 76, 0.52)',
      borderSubtle: 'rgba(148, 197, 255, 0.14)',
      borderFocus: 'rgba(45, 212, 191, 0.48)',
      textPrimary: '#EDF2FA',
      textSecondary: '#9FB0CC',
      textMuted: '#697C9C',
      accentPrimary: '#2DD4BF',
      accentSoft: 'rgba(45, 212, 191, 0.14)',
      statusSuccess: '#34D399',
      statusWarning: '#FBBF24',
      statusDanger: '#FB7185',
      chartPalette: ['#10D9A0', '#38BDF8', '#A78BFA', '#F59E0B', '#F472B6', '#2DD4BF', '#818CF8', '#94A3B8'],
      heatmapScale: ['rgba(148, 197, 255, 0.06)', '#253D6E', '#5B46C6', '#8B5CF6', '#38BDF8'],
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
    },
  },
}
