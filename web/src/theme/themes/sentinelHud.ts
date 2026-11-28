import type { ThemeDefinition } from '../types'

const SANS_STACK =
  '"Inter", "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", sans-serif'
const MONO_STACK =
  '"JetBrains Mono", "IBM Plex Mono", "Cascadia Code", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export const sentinelHudTheme: ThemeDefinition = {
  id: 'sentinel-hud',
  name: 'Sentinel HUD',
  description: '战术雷达 HUD · 炭黑底板、酸绿刻度角标、LED 分段进度与扫描光束',
  defaultLayout: 'classic',
  typography: {
    fontSans: SANS_STACK,
    fontMono: MONO_STACK,
    baseSize: '14px',
  },
  chartEffects: {
    barGradient: false,
    areaGradient: true,
    lineGlow: true,
    tooltipBg: {
      dark: 'rgba(8, 11, 9, 0.96)',
      light: 'rgba(236, 239, 232, 0.97)',
    },
    heatmapBorderColor: {
      dark: 'rgba(6, 8, 7, 0.70)',
      light: 'rgba(221, 225, 218, 0.80)',
    },
  },
  modes: {
    dark: {
      bgPage: '#060807',
      bgSidebar: '#0A0D0B',
      bgSurface: '#0E1210',
      bgSurfaceHover: '#161C18',
      borderSubtle: 'rgba(198, 244, 50, 0.14)',
      borderFocus: 'rgba(198, 244, 50, 0.65)',
      textPrimary: '#E6EDE0',
      textSecondary: '#A9B5A0',
      textMuted: '#7E8B75',
      accentPrimary: '#C6F432',
      accentSoft: 'rgba(198, 244, 50, 0.11)',
      statusSuccess: '#3DDC97',
      statusWarning: '#FFB020',
      statusDanger: '#FF4D4D',
      chartPalette: ['#C6F432', '#35C7E8', '#FF8A3D', '#FF4F8B', '#8F7CFF', '#3DDC97', '#FFD23F', '#8A968A'],
      heatmapScale: ['#111612', '#1F2D12', '#3B5A14', '#7FB01E', '#C6F432'],
      semanticMetrics: {
        proxy: '#C6F432',
        direct: '#35C7E8',
        reject: '#FF4D4D',
        download: '#5EE6A8',
        upload: '#FF8A3D',
        actual: '#4FA3FF',
        billed: '#FF4F8B',
      },
    },
    light: {
      bgPage: '#DDE1DA',
      bgSidebar: '#CFD4CB',
      bgSurface: '#ECEFE8',
      bgSurfaceHover: '#E0E4DB',
      borderSubtle: 'rgba(17, 22, 15, 0.18)',
      borderFocus: 'rgba(17, 22, 15, 0.75)',
      textPrimary: '#11160F',
      textSecondary: '#3B4636',
      textMuted: '#566150',
      accentPrimary: '#425D00',
      accentSoft: 'rgba(66, 93, 0, 0.11)',
      statusSuccess: '#1F7A4D',
      statusWarning: '#9A5A00',
      statusDanger: '#C62828',
      chartPalette: ['#425D00', '#0F7C99', '#C45A12', '#C2185B', '#5B4BD6', '#1F7A4D', '#A67C00', '#5A6554'],
      heatmapScale: ['#D5DACE', '#E3EDB5', '#C6DE5A', '#8FB300', '#425D00'],
      semanticMetrics: {
        proxy: '#5E8000',
        direct: '#0F7C99',
        reject: '#C62828',
        download: '#1F7A4D',
        upload: '#C45A12',
        actual: '#1F63C9',
        billed: '#C2185B',
      },
    },
  },
}
