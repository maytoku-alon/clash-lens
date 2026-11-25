import { useCallback, useEffect, useState } from 'react'
import { nodeApi } from '../api/nodeApi'
import { trafficApi, type QueryParams } from '../api/trafficApi'
import type {
  AppDetailResponse,
  AppsListResponse,
  BurstsResponse,
  DomainDetailResponse,
  DomainsListResponse,
  GroupByDim,
  HeatmapResponse,
  NodesAnalyticsResponse,
  OverviewResponse,
  TimeseriesResponse,
} from '../types/api'

export function useOverviewData(query: QueryParams, groupBy: GroupByDim) {
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null)
  const [timeseries, setTimeseries] = useState<TimeseriesResponse | null>(null)
  const [bursts, setBursts] = useState<BurstsResponse | null>(null)
  const [apps, setApps] = useState<AppsListResponse | null>(null)
  const [domains, setDomains] = useState<DomainsListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshSeq, setRefreshSeq] = useState(0)

  const refresh = useCallback(() => {
    setRefreshSeq((n) => n + 1)
  }, [])

  useEffect(() => {
    let alive = true
    const force = refreshSeq > 0
    setLoading(true)
    Promise.all([
      trafficApi.overview(query, { force }),
      trafficApi.heatmap({ deviceId: query.deviceId, scope: query.scope }, { force }),
      trafficApi.timeseries(query, groupBy, 'auto', { force }),
      trafficApi.bursts(query, 8, { force }),
      trafficApi.apps(query, '', 8, { force }),
      trafficApi.domains(query, '', 8, { force }),
    ])
      .then(([ov, hm, ts, bu, ap, dm]) => {
        if (!alive) return
        setOverview(ov)
        setHeatmap(hm)
        setTimeseries(ts)
        setBursts(bu)
        setApps(ap)
        setDomains(dm)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.deviceId, query.scope, query.from, query.to, groupBy, refreshSeq])

  return {
    overview,
    heatmap,
    timeseries,
    bursts,
    apps,
    domains,
    loading,
    refresh,
  }
}

export function useNodesData(query: QueryParams) {
  const [data, setData] = useState<NodesAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshSeq, setRefreshSeq] = useState(0)

  const refresh = useCallback(() => {
    setRefreshSeq((n) => n + 1)
  }, [])

  useEffect(() => {
    let alive = true
    const force = refreshSeq > 0
    setLoading(true)
    nodeApi
      .nodes(query, { force })
      .then((res) => {
        if (alive) setData(res)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.deviceId, query.scope, query.from, query.to, refreshSeq])

  return { data, loading, refresh }
}

export function useAppsExplorerData(
  query: QueryParams,
  initialMode: 'app' | 'domain',
  initialTarget: string,
) {
  const [mode, setMode] = useState<'app' | 'domain'>(initialMode)
  const [search, setSearch] = useState('')
  const [appsList, setAppsList] = useState<AppsListResponse | null>(null)
  const [domainsList, setDomainsList] = useState<DomainsListResponse | null>(null)
  const [selectedApp, setSelectedApp] = useState(initialMode === 'app' ? initialTarget : '')
  const [selectedDomain, setSelectedDomain] = useState(initialMode === 'domain' ? initialTarget : '')
  const [appDetail, setAppDetail] = useState<AppDetailResponse | null>(null)
  const [domainDetail, setDomainDetail] = useState<DomainDetailResponse | null>(null)

  useEffect(() => {
    setMode(initialMode)
    if (initialMode === 'app' && initialTarget) setSelectedApp(initialTarget)
    if (initialMode === 'domain' && initialTarget) setSelectedDomain(initialTarget)
  }, [initialMode, initialTarget])

  // Load master list
  useEffect(() => {
    let alive = true
    if (mode === 'app') {
      trafficApi
        .apps(query, search, 80)
        .then((res) => {
          if (!alive) return
          setAppsList(res)
          if (res.items.length > 0) {
            setSelectedApp((prev) =>
              prev && res.items.some((x) => x.process_display === prev)
                ? prev
                : res.items[0].process_display,
            )
          } else {
            setSelectedApp('')
            setAppDetail(null)
          }
        })
        .catch(() => {})
    } else {
      trafficApi
        .domains(query, search, 80)
        .then((res) => {
          if (!alive) return
          setDomainsList(res)
          if (res.items.length > 0) {
            setSelectedDomain((prev) =>
              prev && res.items.some((x) => x.root_domain === prev)
                ? prev
                : res.items[0].root_domain,
            )
          } else {
            setSelectedDomain('')
            setDomainDetail(null)
          }
        })
        .catch(() => {})
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, search, query.deviceId, query.scope, query.from, query.to])

  // Load detail pane
  useEffect(() => {
    let alive = true
    if (mode === 'app' && selectedApp) {
      trafficApi
        .appDetail(query, selectedApp)
        .then((d) => {
          if (alive) setAppDetail(d)
        })
        .catch(() => {})
    } else if (mode === 'domain' && selectedDomain) {
      trafficApi
        .domainDetail(query, selectedDomain)
        .then((d) => {
          if (alive) setDomainDetail(d)
        })
        .catch(() => {})
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedApp, selectedDomain, query.deviceId, query.scope, query.from, query.to])

  return {
    mode,
    setMode,
    search,
    setSearch,
    appsList,
    domainsList,
    selectedApp,
    setSelectedApp,
    selectedDomain,
    setSelectedDomain,
    appDetail,
    domainDetail,
  }
}
