import type {
  AppDetailResponse,
  AppsListResponse,
  BurstsResponse,
  DomainDetailResponse,
  DomainsListResponse,
  GroupByDim,
  HeatmapResponse,
  LiveHubSnapshot,
  OverviewResponse,
  TimeseriesResponse,
  TrafficScope,
} from '../types/api'
import { localTZOffsetMinutes } from '../utils/format'
import { cachedGetJSON, qs, reqJSON, type FetchOptions } from './http'

export interface QueryParams {
  deviceId: string
  scope: TrafficScope
  from: number
  to: number
}

export const trafficApi = {
  overview: (q: QueryParams, opts?: FetchOptions) =>
    cachedGetJSON<OverviewResponse>(
      `/api/v1/analytics/overview?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        tz_offset: localTZOffsetMinutes(),
      })}`,
      opts,
    ),

  heatmap: (q: Pick<QueryParams, 'deviceId' | 'scope'>, opts?: FetchOptions) =>
    cachedGetJSON<HeatmapResponse>(
      `/api/v1/analytics/heatmap?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        tz_offset: localTZOffsetMinutes(),
      })}`,
      opts,
    ),

  timeseries: (q: QueryParams, groupBy: GroupByDim, interval = 'auto', opts?: FetchOptions) =>
    cachedGetJSON<TimeseriesResponse>(
      `/api/v1/analytics/timeseries?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        group_by: groupBy,
        interval,
        tz_offset: localTZOffsetMinutes(),
      })}`,
      opts,
    ),

  bursts: (q: QueryParams, limit = 12, opts?: FetchOptions) =>
    cachedGetJSON<BurstsResponse>(
      `/api/v1/analytics/bursts?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        limit,
        tz_offset: localTZOffsetMinutes(),
      })}`,
      opts,
    ),

  apps: (q: QueryParams, search = '', limit = 80, opts?: FetchOptions) =>
    cachedGetJSON<AppsListResponse>(
      `/api/v1/analytics/apps?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        search,
        limit,
        tz_offset: localTZOffsetMinutes(),
      })}`,
      opts,
    ),

  appDetail: (q: QueryParams, processDisplay: string, opts?: FetchOptions) =>
    cachedGetJSON<AppDetailResponse>(
      `/api/v1/analytics/apps/${encodeURIComponent(processDisplay)}/detail?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        tz_offset: localTZOffsetMinutes(),
      })}`,
      opts,
    ),

  domains: (q: QueryParams, search = '', limit = 80, opts?: FetchOptions) =>
    cachedGetJSON<DomainsListResponse>(
      `/api/v1/analytics/domains?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        search,
        limit,
        tz_offset: localTZOffsetMinutes(),
      })}`,
      opts,
    ),

  domainDetail: (q: QueryParams, rootDomain: string, opts?: FetchOptions) =>
    cachedGetJSON<DomainDetailResponse>(
      `/api/v1/analytics/domains/${encodeURIComponent(rootDomain)}/detail?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        tz_offset: localTZOffsetMinutes(),
      })}`,
      opts,
    ),

  // Live telemetry is explicitly uncached
  liveSnapshot: () => reqJSON<LiveHubSnapshot>('/api/v1/live/snapshot'),
}
