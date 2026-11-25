import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api/client'
import { LayoutShell, type NavTab } from './components/LayoutShell'
import { AppsExplorerPage } from './pages/AppsExplorerPage'
import { AuthGate } from './pages/AuthGate'
import { DevicesSettingsPage } from './pages/DevicesSettingsPage'
import { LiveMonitorPage } from './pages/LiveMonitorPage'
import { NodesQuotaPage } from './pages/NodesQuotaPage'
import { OverviewPage } from './pages/OverviewPage'
import type {
  AuthStatusResponse,
  DeviceInfo,
  LiveHubSnapshot,
  RangePreset,
  TrafficScope,
} from './types/api'
import { dayDateToRange, presetToRange } from './utils/format'

export function App() {
  const [auth, setAuth] = useState<AuthStatusResponse | null>(null)
  const [activeTab, setActiveTab] = useState<NavTab>('overview')
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('all')
  const [scope, setScope] = useState<TrafficScope>('all')
  const [preset, setPreset] = useState<RangePreset>('24h')
  const [customDay, setCustomDay] = useState<string | null>(null)
  const [tickNow, setTickNow] = useState(() => Math.floor(Date.now() / 1000))

  // Cross-page deep link into AppsExplorer
  const [explorerMode, setExplorerMode] = useState<'app' | 'domain'>('app')
  const [explorerTarget, setExplorerTarget] = useState('')
  const [settingsSubTab, setSettingsSubTab] = useState<'devices' | 'settings'>('devices')

  // Theme & Kiosk
  const [isDark, setIsDark] = useState(() => localStorage.getItem('clashlens_theme') !== 'light')
  const [kiosk, setKiosk] = useState(false)

  // Real-time WebSocket stream state
  const [live, setLive] = useState<LiveHubSnapshot | null>(null)
  const [rateHistory, setRateHistory] = useState<{ time: string; down: number; up: number }[]>([])

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
      localStorage.setItem('clashlens_theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('clashlens_theme', 'light')
    }
  }, [isDark])

  useEffect(() => {
    const onFs = () => setKiosk(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const status = await api.authStatus()
      setAuth(status)
    } catch {
      setAuth({ initialized: true, authenticated: false, version: '' })
    }
  }, [])

  useEffect(() => {
    void checkAuth()
  }, [checkAuth])

  const loadDevices = useCallback(async () => {
    try {
      const res = await api.listDevices()
      setDevices(res.items || [])
    } catch {
      // ignore
    }
  }, [])

  // Refresh devices and clock periodically while authenticated
  useEffect(() => {
    if (!auth?.authenticated) return
    void loadDevices()
    const timer = setInterval(() => {
      setTickNow(Math.floor(Date.now() / 1000))
      void loadDevices()
    }, 30000)
    return () => clearInterval(timer)
  }, [auth?.authenticated, loadDevices])

  // WebSocket live connection with automatic reconnect
  useEffect(() => {
    if (!auth?.authenticated) return
    let closed = false
    let ws: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const pushSample = (snap: LiveHubSnapshot) => {
      setLive(snap)
      const d = new Date((snap.timestamp || Math.floor(Date.now() / 1000)) * 1000)
      const label = d.toTimeString().slice(0, 8)
      setRateHistory((prev) => [...prev.slice(-59), { time: label, down: snap.total_down_bps, up: snap.total_up_bps }])
    }

    api.liveSnapshot().then(pushSample).catch(() => {})

    const connect = () => {
      if (closed) return
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${proto}//${window.location.host}/api/v1/ws/live`)
      ws.onmessage = (ev) => {
        try {
          const snap = JSON.parse(ev.data) as LiveHubSnapshot
          pushSample(snap)
        } catch {
          // ignore malformed frame
        }
      }
      ws.onclose = () => {
        if (!closed) {
          retryTimer = setTimeout(connect, 3000)
        }
      }
    }
    connect()

    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    }
  }, [auth?.authenticated])

  const query = useMemo(() => {
    if (customDay) {
      const r = dayDateToRange(customDay)
      return { deviceId: selectedDeviceId, scope, from: r.from, to: r.to }
    }
    const r = presetToRange(preset)
    // Keep stable `to` driven by tickNow/preset switches so child effects don't jitter every second
    void tickNow
    return { deviceId: selectedDeviceId, scope, from: r.from, to: r.to }
  }, [selectedDeviceId, scope, preset, customDay, tickNow])

  const handleToggleKiosk = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => setKiosk(true))
    } else {
      document.exitFullscreen?.().catch(() => setKiosk(false))
    }
  }

  const handleLogout = async () => {
    await api.authLogout().catch(() => {})
    await checkAuth()
  }

  const openAppDetail = (proc: string) => {
    setExplorerMode('app')
    setExplorerTarget(proc)
    setActiveTab('apps')
  }

  const openDomainDetail = (dom: string) => {
    setExplorerMode('domain')
    setExplorerTarget(dom)
    setActiveTab('apps')
  }

  if (!auth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-xs text-zinc-400">
        正在加载 ClashLens...
      </div>
    )
  }

  if (!auth.authenticated) {
    return <AuthGate initialized={auth.initialized} onAuthenticated={() => void checkAuth()} />
  }

  return (
    <LayoutShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      devices={devices}
      selectedDeviceId={selectedDeviceId}
      onDeviceChange={setSelectedDeviceId}
      scope={scope}
      onScopeChange={setScope}
      preset={preset}
      onPresetChange={(p) => {
        setCustomDay(null)
        setPreset(p)
      }}
      customDay={customDay}
      onClearCustomDay={() => setCustomDay(null)}
      live={live}
      isDark={isDark}
      onToggleTheme={() => setIsDark((d) => !d)}
      kiosk={kiosk}
      onToggleKiosk={handleToggleKiosk}
      localMode={Boolean(auth.local_mode)}
      onLogout={handleLogout}
    >
      {activeTab === 'overview' && (
        <OverviewPage
          query={query}
          live={live}
          rateHistory={rateHistory}
          isDark={isDark}
          onSelectDay={(dateStr) => setCustomDay(dateStr)}
          onOpenApp={openAppDetail}
          onOpenDomain={openDomainDetail}
        />
      )}
      {activeTab === 'apps' && (
        <AppsExplorerPage
          query={query}
          initialMode={explorerMode}
          initialTarget={explorerTarget}
          isDark={isDark}
        />
      )}
      {activeTab === 'nodes' && (
        <NodesQuotaPage
          query={query}
          isDark={isDark}
          onOpenSettings={() => {
            setSettingsSubTab('settings')
            setActiveTab('devices')
          }}
          onOpenApp={openAppDetail}
        />
      )}
      {activeTab === 'live' && (
        <LiveMonitorPage
          live={live}
          rateHistory={rateHistory}
          isDark={isDark}
          onOpenApp={openAppDetail}
        />
      )}
      {activeTab === 'devices' && (
        <DevicesSettingsPage
          devices={devices}
          onDevicesChanged={() => void loadDevices()}
          initialSubTab={settingsSubTab}
          localMode={Boolean(auth.local_mode)}
        />
      )}
    </LayoutShell>
  )
}

export default App
