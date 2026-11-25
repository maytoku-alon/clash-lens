import type { RangePreset } from '../types/api'

export function formatBytes(bytes: number | undefined | null, decimals = 2): string {
  const b = Number(bytes || 0)
  if (!Number.isFinite(b) || b <= 0) return '0 B'
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), units.length - 1)
  const val = b / Math.pow(k, i)
  const digits = i === 0 ? 0 : val >= 100 ? 1 : decimals
  return `${val.toFixed(digits)} ${units[i]}`
}

export function formatSpeed(bps: number | undefined | null): string {
  return `${formatBytes(bps, 1)}/s`
}

export function formatNumber(n: number | undefined | null): string {
  return Number(n || 0).toLocaleString('en-US')
}

export function formatTimeBucket(unixSec: number, interval: 'minute' | 'hour' | 'day'): string {
  const d = new Date(unixSec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (interval === 'minute') {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  if (interval === 'hour') {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatFullTime(unixSec: number): string {
  if (!unixSec) return '从未'
  const d = new Date(unixSec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatRelativeTime(unixSec: number): string {
  if (!unixSec) return '从未上报'
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSec)
  if (diff < 10) return '刚刚'
  if (diff < 60) return `${diff} 秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return `${Math.floor(diff / 86400)} 天前`
}

export function presetToRange(preset: RangePreset): { from: number; to: number } {
  const now = Math.floor(Date.now() / 1000)
  const map: Record<RangePreset, number> = {
    '1h': 3600,
    '24h': 86400,
    '7d': 7 * 86400,
    '30d': 30 * 86400,
    '90d': 90 * 86400,
    '1y': 365 * 86400,
  }
  return { from: now - map[preset], to: now }
}

export function dayDateToRange(dayDate: string): { from: number; to: number } {
  const start = new Date(`${dayDate}T00:00:00`).getTime()
  const from = Math.floor(start / 1000)
  return { from, to: from + 86399 }
}

export function localTZOffsetMinutes(): number {
  return -new Date().getTimezoneOffset()
}
