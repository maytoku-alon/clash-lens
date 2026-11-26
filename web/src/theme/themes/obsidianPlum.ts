import type { ThemeDefinition } from '../types'

const SANS_STACK =
  '"Inter", "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", sans-serif'
const MONO_STACK =
  '"JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export const obsidianPlumTheme: ThemeDefinition = {
  id: 'obsidian-plum',
  name: 'Obsidian Plum',
  description: 'Claude Code 极简去框骨架 · 暗夜灰紫 / 暖纸烟紫',
  defaultLayout: 'bento',
  typography: {
    fontSans: SANS_STACK,
    fontMono: MONO_STACK,
    baseSize: '14px',
  },
  modes: {
    dark: {
      bgPage: '#0B0A0F',
      bgSidebar: '#111017',
      bgSurface: '#16151F',
      bgSurfaceHover: '#1E1C2A',
      borderSubtle: 'rgba(255, 255, 255, 0.06)',
      borderFocus: 'rgba(167, 139, 250, 0.35)',
      textPrimary: '#E6E4EE',
      textSecondary: '#9E9AB0',
      textMuted: '#67637A',
      accentPrimary: '#A78BFA',
      accentSoft: 'rgba(167, 139, 250, 0.12)',
      statusSuccess: '#6EE7B7',
      statusWarning: '#FCD34D',
      statusDanger: '#FDA4AF',
      chartPalette: ['#A78BFA', '#2DD4BF', '#F2A65A', '#F472B6', '#60A5FA', '#7BC96F', '#E5C07B', '#94A3B8'],
      heatmapScale: ['#201E2B', '#2E234D', '#4C3585', '#7C5AC2', '#A78BFA'],
      semanticMetrics: {
        proxy: '#A78BFA',
        direct: '#34D399',
        reject: '#FDA4AF',
        download: '#818CF8',
        upload: '#FBBF24',
        actual: '#94A3B8',
        billed: '#A78BFA',
      },
    },
    light: {
      bgPage: '#E9E4DC',
      bgSidebar: '#E0DAD0',
      bgSurface: '#F2EEE7',
      bgSurfaceHover: '#E6E1D8',
      borderSubtle: 'rgba(28, 25, 38, 0.10)',
      borderFocus: 'rgba(109, 40, 217, 0.35)',
      textPrimary: '#24212E',
      textSecondary: '#555066',
      textMuted: '#78728A',
      accentPrimary: '#6D28D9',
      accentSoft: 'rgba(109, 40, 217, 0.10)',
      statusSuccess: '#059669',
      statusWarning: '#C26D0A',
      statusDanger: '#E11D48',
      chartPalette: ['#7C3AED', '#0D9488', '#D97706', '#DB2777', '#2563EB', '#16A34A', '#CA8A04', '#64748B'],
      heatmapScale: ['#E2DDD4', '#DDD6FE', '#C4B5FD', '#8B5CF6', '#6D28D9'],
      semanticMetrics: {
        proxy: '#7C3AED',
        direct: '#059669',
        reject: '#E11D48',
        download: '#4F46E5',
        upload: '#D97706',
        actual: '#64748B',
        billed: '#7C3AED',
      },
    },
  },
}
