import type {
  AppDetailResponse,
  AppsListResponse,
  AuthStatusResponse,
  BackupImportResult,
  BurstsResponse,
  CreateDeviceResponse,
  DeviceInfo,
  DomainDetailResponse,
  DomainsListResponse,
  GroupByDim,
  HeatmapResponse,
  LiveHubSnapshot,
  NodesAnalyticsResponse,
  OverviewResponse,
  SettingsPayload,
  TimeseriesResponse,
  TrafficScope,
} from '../types/api'
import { localTZOffsetMinutes } from '../utils/format'

export interface QueryParams {
  deviceId: string
  scope: TrafficScope
  from: number
  to: number
}

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') {
      u.set(k, String(v))
    }
  }
  return u.toString()
}

async function reqJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
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
  return parsed as unknown as T
}

export const api = {
  authStatus: () => reqJSON<AuthStatusResponse>('/api/v1/auth/status'),
  authSetup: (password: string) =>
    reqJSON<{ ok: boolean }>('/api/v1/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  authLogin: (password: string) =>
    reqJSON<{ ok: boolean }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  authLogout: () => reqJSON<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST' }),
  changePassword: (old_password: string, new_password: string) =>
    reqJSON<{ ok: boolean }>('/api/v1/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ old_password, new_password }),
    }),

  listDevices: () =>
    reqJSON<{ items: DeviceInfo[] }>(`/api/v1/devices?tz_offset=${localTZOffsetMinutes()}`),
  createDevice: (name: string, os: string, icon?: string) =>
    reqJSON<CreateDeviceResponse>('/api/v1/devices', {
      method: 'POST',
      body: JSON.stringify({ name, os, icon }),
    }),
  updateDevice: (id: string, name: string, os: string, icon: string) =>
    reqJSON<DeviceInfo>(`/api/v1/devices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, os, icon }),
    }),
  deleteDevice: (id: string) =>
    reqJSON<{ ok: boolean }>(`/api/v1/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getSettings: () => reqJSON<SettingsPayload>('/api/v1/settings'),
  saveSettings: (payload: SettingsPayload) =>
    reqJSON<SettingsPayload>('/api/v1/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

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
    return parsed as unknown as BackupImportResult
  },

  overview: (q: QueryParams) =>
    reqJSON<OverviewResponse>(
      `/api/v1/analytics/overview?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        tz_offset: localTZOffsetMinutes(),
      })}`,
    ),

  heatmap: (q: Pick<QueryParams, 'deviceId' | 'scope'>) =>
    reqJSON<HeatmapResponse>(
      `/api/v1/analytics/heatmap?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        tz_offset: localTZOffsetMinutes(),
      })}`,
    ),

  timeseries: (q: QueryParams, groupBy: GroupByDim, interval = 'auto') =>
    reqJSON<TimeseriesResponse>(
      `/api/v1/analytics/timeseries?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        group_by: groupBy,
        interval,
        tz_offset: localTZOffsetMinutes(),
      })}`,
    ),

  bursts: (q: QueryParams, limit = 12) =>
    reqJSON<BurstsResponse>(
      `/api/v1/analytics/bursts?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        limit,
        tz_offset: localTZOffsetMinutes(),
      })}`,
    ),

  apps: (q: QueryParams, search = '', limit = 80) =>
    reqJSON<AppsListResponse>(
      `/api/v1/analytics/apps?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        search,
        limit,
        tz_offset: localTZOffsetMinutes(),
      })}`,
    ),

  appDetail: (q: QueryParams, processDisplay: string) =>
    reqJSON<AppDetailResponse>(
      `/api/v1/analytics/apps/${encodeURIComponent(processDisplay)}/detail?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        tz_offset: localTZOffsetMinutes(),
      })}`,
    ),

  domains: (q: QueryParams, search = '', limit = 80) =>
    reqJSON<DomainsListResponse>(
      `/api/v1/analytics/domains?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        search,
        limit,
        tz_offset: localTZOffsetMinutes(),
      })}`,
    ),

  domainDetail: (q: QueryParams, rootDomain: string) =>
    reqJSON<DomainDetailResponse>(
      `/api/v1/analytics/domains/${encodeURIComponent(rootDomain)}/detail?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        tz_offset: localTZOffsetMinutes(),
      })}`,
    ),

  nodes: (q: QueryParams) =>
    reqJSON<NodesAnalyticsResponse>(
      `/api/v1/analytics/nodes?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        tz_offset: localTZOffsetMinutes(),
      })}`,
    ),

  liveSnapshot: () => reqJSON<LiveHubSnapshot>('/api/v1/live/snapshot'),
}
