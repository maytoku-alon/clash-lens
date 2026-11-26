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
      semanticMetrics: {
        proxy: '#6366F1',
        direct: '#10B981',
        reject: '#F43F5E',
        download: '#38BDF8',
        upload: '#F59E0B',
        actual: '#38BDF8',
        billed: '#A78BFA',
      },
    },
    light: {
      bgPage: '#E7EAEE',
      bgSidebar: '#DFE3E9',
      bgSurface: '#F1F3F6',
      bgSurfaceHover: '#E5E9F0',
      borderSubtle: 'rgba(15, 23, 42, 0.10)',
      borderFocus: 'rgba(5, 150, 105, 0.45)',
      textPrimary: '#1E293B',
      textSecondary: '#475569',
      textMuted: '#64748B',
      accentPrimary: '#059669',
      accentSoft: 'rgba(5, 150, 105, 0.12)',
      statusSuccess: '#059669',
      statusWarning: '#D97706',
      statusDanger: '#E11D48',
      chartPalette: ['#059669', '#0284C7', '#7C3AED', '#D97706', '#DB2777', '#4F46E5', '#0D9488', '#64748B'],
      heatmapScale: ['#DFE4EB', '#A7F3D0', '#34D399', '#059669', '#047857'],
      semanticMetrics: {
        proxy: '#4F46E5',
        direct: '#059669',
        reject: '#E11D48',
        download: '#0284C7',
        upload: '#D97706',
        actual: '#0284C7',
        billed: '#7C3AED',
      },
    },
  },
}
