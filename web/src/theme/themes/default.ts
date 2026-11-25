import type { ThemeDefinition } from '../types'

const SANS_STACK =
  '"Inter", "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", sans-serif'
const MONO_STACK =
  '"JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export const defaultTheme: ThemeDefinition = {
  id: 'default',
  name: '经典默认',
  description: '原版高对比极简仪表盘风格（翡翠绿点缀）',
  defaultLayout: 'classic',
  typography: {
    fontSans: SANS_STACK,
    fontMono: MONO_STACK,
    baseSize: '14px',
  },
  modes: {
    dark: {
      bgPage: '#09090b',
      bgSidebar: '#0f0f13',
      bgSurface: '#141419',
      bgSurfaceHover: '#1c1c23',
      borderSubtle: 'rgba(255, 255, 255, 0.08)',
      borderFocus: 'rgba(16, 185, 129, 0.45)',
      textPrimary: '#fafafa',
      textSecondary: '#d4d4d8',
      textMuted: '#a1a1aa',
      accentPrimary: '#10b981',
      accentSoft: 'rgba(16, 185, 129, 0.12)',
      statusSuccess: '#34d399',
      statusWarning: '#f59e0b',
      statusDanger: '#f43f5e',
      chartPalette: ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#71717a'],
      heatmapScale: ['#18181f', '#064e3b', '#047857', '#10b981', '#34d399'],
    },
    light: {
      bgPage: '#f8fafc',
      bgSidebar: '#ffffff',
      bgSurface: '#ffffff',
      bgSurfaceHover: '#f1f5f9',
      borderSubtle: 'rgba(15, 23, 42, 0.09)',
      borderFocus: 'rgba(16, 185, 129, 0.5)',
      textPrimary: '#0f172a',
      textSecondary: '#334155',
      textMuted: '#64748b',
      accentPrimary: '#10b981',
      accentSoft: 'rgba(16, 185, 129, 0.12)',
      statusSuccess: '#059669',
      statusWarning: '#d97706',
      statusDanger: '#e11d48',
      chartPalette: ['#10b981', '#0891b2', '#7c3aed', '#d97706', '#db2777', '#4f46e5', '#0d9488', '#64748b'],
      heatmapScale: ['#eef2f6', '#bbf7d0', '#4ade80', '#16a34a', '#15803d'],
    },
  },
}
