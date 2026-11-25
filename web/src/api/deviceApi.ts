import type {
  BackupImportResult,
  CreateDeviceResponse,
  DeviceInfo,
  SettingsPayload,
} from '../types/api'
import { localTZOffsetMinutes } from '../utils/format'
import { cachedGetJSON, invalidateCache, reqJSON, type FetchOptions } from './http'

export const deviceApi = {
  list: (opts?: FetchOptions) =>
    cachedGetJSON<{ items: DeviceInfo[] }>(`/api/v1/devices?tz_offset=${localTZOffsetMinutes()}`, opts),
  create: async (name: string, os: string, icon?: string, dashboard_url?: string) => {
    const res = await reqJSON<CreateDeviceResponse>('/api/v1/devices', {
      method: 'POST',
      body: JSON.stringify({ name, os, icon, dashboard_url }),
    })
    invalidateCache()
    return res
  },
  update: async (id: string, name: string, os: string, icon: string, dashboard_url?: string) => {
    const res = await reqJSON<DeviceInfo>(`/api/v1/devices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, os, icon, dashboard_url }),
    })
    invalidateCache()
    return res
  },
  delete: async (id: string) => {
    const res = await reqJSON<{ ok: boolean }>(`/api/v1/devices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    invalidateCache()
    return res
  },

  getSettings: (opts?: FetchOptions) => cachedGetJSON<SettingsPayload>('/api/v1/settings', opts),
  saveSettings: async (payload: SettingsPayload) => {
    const res = await reqJSON<SettingsPayload>('/api/v1/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
    invalidateCache()
    return res
  },

  exportBackupUrl: () => '/api/v1/backup/export',
  importBackup: async (file: File, mergeSettings = false): Promise<BackupImportResult> => {
    const res = await fetch(`/api/v1/backup/import?merge_settings=${mergeSettings ? 'true' : 'false'}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    })
    const text = await res.text()
    let parsed: Record<string, unknown> = {}
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = {}
      }
    }
    if (!res.ok) {
      const msg = typeof parsed.error === 'string' ? parsed.error : `HTTP ${res.status}`
      throw new Error(msg)
    }
    invalidateCache()
    return parsed as unknown as BackupImportResult
  },
}
