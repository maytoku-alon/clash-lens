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
      chartPalette: ['#A78BFA', '#818CF8', '#6366F1', '#94A3B8', '#64748B', '#475569'],
      heatmapScale: ['#201E2B', '#2E234D', '#4C3585', '#7C5AC2', '#A78BFA'],
    },
    light: {
      bgPage: '#F7F6F3',
      bgSidebar: '#EFECE6',
      bgSurface: '#FFFFFF',
      bgSurfaceHover: '#F3F1EC',
      borderSubtle: 'rgba(24, 22, 34, 0.08)',
      borderFocus: 'rgba(124, 58, 237, 0.30)',
      textPrimary: '#1C1A26',
      textSecondary: '#5E5A70',
      textMuted: '#8F8BA3',
      accentPrimary: '#7C3AED',
      accentSoft: 'rgba(124, 58, 237, 0.10)',
      statusSuccess: '#059669',
      statusWarning: '#D97706',
      statusDanger: '#E11D48',
      chartPalette: ['#7C3AED', '#6366F1', '#8B5CF6', '#64748B', '#94A3B8', '#CBD5E1'],
      heatmapScale: ['#F0EFF3', '#EDE9FE', '#DDD6FE', '#A78BFA', '#7C3AED'],
    },
  },
}
