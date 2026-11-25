import type { NodesAnalyticsResponse } from '../types/api'
import { localTZOffsetMinutes } from '../utils/format'
import { cachedGetJSON, qs, type FetchOptions } from './http'
import type { QueryParams } from './trafficApi'

export const nodeApi = {
  nodes: (q: QueryParams, opts?: FetchOptions) =>
    cachedGetJSON<NodesAnalyticsResponse>(
      `/api/v1/analytics/nodes?${qs({
        device_id: q.deviceId,
        scope: q.scope,
        from: q.from,
        to: q.to,
        tz_offset: localTZOffsetMinutes(),
      })}`,
      opts,
    ),
}
