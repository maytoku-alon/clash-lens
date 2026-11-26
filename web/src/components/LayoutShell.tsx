import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  AppWindow,
  ExternalLink,
  Laptop,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Minimize2,
  Monitor,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Settings,
  Smartphone,
  Sun,
} from 'lucide-react'
import { useTheme } from '../theme/ThemeProvider'
import type { DeviceInfo, LiveHubSnapshot, RangePreset, TrafficScope } from '../types/api'
import { formatSpeed } from '../utils/format'
import { AppearancePopover } from './AppearancePopover'

export type NavTab = 'overview' | 'apps' | 'nodes' | 'live' | 'devices'

interface LayoutShellProps {
  activeTab: NavTab
  onTabChange: (tab: NavTab) => void
  devices: DeviceInfo[]
  selectedDeviceId: string
  onDeviceChange: (id: string) => void
  scope: TrafficScope
  onScopeChange: (s: TrafficScope) => void
  preset: RangePreset
  onPresetChange: (p: RangePreset) => void
  customDay: string | null
  onClearCustomDay: () => void
  live: LiveHubSnapshot | null
  kiosk: boolean
  onToggleKiosk: () => void
  localMode?: boolean
  onLogout: () => void
  children: ReactNode
}

const NAV_ITEMS: { key: NavTab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'overview', label: '总览大屏', icon: LayoutDashboard },
  { key: 'apps', label: '应用 × 网站', icon: AppWindow },
  { key: 'nodes', label: '节点与套餐', icon: Network },
  { key: 'live', label: '实时监控', icon: Activity },
  { key: 'devices', label: '设备与设置', icon: Settings },
]

const PRESETS: RangePreset[] = ['1h', '24h', '7d', '30d', '90d', '1y']
const SIDEBAR_STORAGE_KEY = 'clashlens_sidebar_collapsed'

function readInitialSidebarCollapsed(): boolean {
  try {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (saved === 'true') return true
    if (saved === 'false') return false
  } catch {
    // ignore storage errors
  }
  return typeof window !== 'undefined' ? window.innerWidth < 1360 : false
}

function DeviceIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'laptop':
      return <Laptop className="h-3.5 w-3.5" strokeWidth={1.6} />
    case 'smartphone':
      return <Smartphone className="h-3.5 w-3.5" strokeWidth={1.6} />
    case 'server':
      return <Server className="h-3.5 w-3.5" strokeWidth={1.6} />
    default:
      return <Monitor className="h-3.5 w-3.5" strokeWidth={1.6} />
  }
}

export function LayoutShell({
  activeTab,
  onTabChange,
  devices,
  selectedDeviceId,
  onDeviceChange,
  scope,
  onScopeChange,
  preset,
  onPresetChange,
  customDay,
  onClearCustomDay,
  live,
  kiosk,
  onToggleKiosk,
  localMode = false,
  onLogout,
  children,
}: LayoutShellProps) {
  const { isDark, toggleColorMode } = useTheme()
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readInitialSidebarCollapsed)
  const showAnalyticsBar = activeTab !== 'devices' && activeTab !== 'live'
  const selectedDevice = selectedDeviceId === 'all' ? undefined : devices.find((d) => d.id === selectedDeviceId)

  useEffect(() => {
    const handleResize = () => {
      try {
        if (localStorage.getItem(SIDEBAR_STORAGE_KEY) === null) {
          setSidebarCollapsed(window.innerWidth < 1360)
        }
      } catch {
        // ignore storage errors
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  return (
    <div className="flex min-h-screen text-[var(--cl-text-primary)]">
      {/* Left Navigation Rail */}
      {!kiosk && (
        <aside
          className={`cl-surface sticky top-0 flex h-screen shrink-0 flex-col justify-between border-r py-5 transition-[width] duration-200 ${
            sidebarCollapsed ? 'w-16 px-2' : 'w-[220px] px-3.5'
          }`}
        >
          <div>
            <div className={`mb-7 flex items-center ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-2'}`}>
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm"
                style={{
                  backgroundColor: 'var(--cl-accent-soft)',
                  color: 'var(--cl-accent-primary)',
                  border: '1px solid var(--cl-border-focus)',
                }}
              >
                <Activity className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0 overflow-hidden whitespace-nowrap">
                  <div className="text-[15px] font-bold tracking-tight">ClashLens</div>
                  <div className="text-xs text-[var(--cl-text-muted)]">
                    {localMode ? '本地独立模式' : '流量透视监控'}
                  </div>
                </div>
              )}
            </div>

            <nav className="space-y-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const active = activeTab === item.key
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => onTabChange(item.key)}
                    title={sidebarCollapsed ? item.label : undefined}
                    aria-label={item.label}
                    className={`flex h-11 w-full cursor-pointer items-center gap-3 rounded-lg text-[15px] font-medium leading-none tracking-[-0.01em] transition ${
                      sidebarCollapsed ? 'justify-center px-2' : 'justify-start px-3.5'
                    } ${
                      active
                        ? 'cl-nav-active'
                        : 'text-[var(--cl-text-secondary)] hover:bg-[var(--cl-bg-surface-hover)] hover:text-[var(--cl-text-primary)]'
                    }`}
                    style={
                      active
                        ? {
                            backgroundColor: 'var(--cl-accent-soft)',
                            color: 'var(--cl-accent-primary)',
                          }
                        : undefined
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                    {!sidebarCollapsed && <span className="truncate whitespace-nowrap">{item.label}</span>}
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="space-y-1 border-t pt-3" style={{ borderColor: 'var(--cl-border-subtle)' }}>
            <button
              type="button"
              data-testid="sidebar-toggle"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏（迷你模式）'}
              aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
              className={`flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg text-[14px] font-medium leading-none tracking-[-0.01em] text-[var(--cl-text-secondary)] transition hover:bg-[var(--cl-bg-surface-hover)] hover:text-[var(--cl-text-primary)] ${
                sidebarCollapsed ? 'justify-center px-2' : 'justify-start px-3.5'
              }`}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              ) : (
                <PanelLeftClose className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              )}
              {!sidebarCollapsed && <span className="truncate whitespace-nowrap">收起侧边栏</span>}
            </button>

            {!localMode && (
              <button
                type="button"
                onClick={onLogout}
                title={sidebarCollapsed ? '退出登录' : undefined}
                aria-label="退出登录"
                className={`flex h-11 w-full cursor-pointer items-center gap-3 rounded-lg text-[14.5px] font-medium leading-none tracking-[-0.01em] text-[var(--cl-text-secondary)] transition hover:bg-rose-500/10 hover:text-rose-400 ${
                  sidebarCollapsed ? 'justify-center px-2' : 'justify-start px-3.5'
                }`}
              >
                <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                {!sidebarCollapsed && <span className="truncate whitespace-nowrap">退出登录</span>}
              </button>
            )}
          </div>
        </aside>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky Top Bar */}
        <header className="cl-surface sticky top-0 z-20 border-b px-4 py-2 backdrop-blur-md sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Device Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {showAnalyticsBar ? (
                <>
                  <button
                    type="button"
                    onClick={() => onDeviceChange('all')}
                    className={`cl-pill ${selectedDeviceId === 'all' ? 'cl-pill-active' : ''}`}
                  >
                    <span>全部设备</span>
                    <span className="font-mono text-[10px] opacity-75">({devices.length})</span>
                  </button>

                  {devices.map((d) => {
                    const liveDev = live?.devices?.find((ld) => ld.device_id === d.id)
                    const online = liveDev?.online ?? d.online
                    const tun = liveDev?.tun_enabled ?? d.tun_enabled
                    const active = selectedDeviceId === d.id
                    return (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => onDeviceChange(d.id)}
                        className={`cl-pill ${active ? 'cl-pill-active' : ''}`}
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: online ? 'var(--cl-status-success)' : 'var(--cl-text-muted)',
                          }}
                        />
                        <DeviceIcon icon={d.icon} />
                        <span>{d.name}</span>
                        {tun && (
                          <span
                            className="rounded px-1 py-0.5 font-mono text-[9px]"
                            style={{
                              backgroundColor: 'var(--cl-accent-soft)',
                              color: 'var(--cl-accent-primary)',
                            }}
                          >
                            TUN
                          </span>
                        )}
                      </button>
                    )
                  })}

                  {selectedDevice?.dashboard_url && (
                    <a
                      href={selectedDevice.dashboard_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cl-pill"
                      style={{
                        borderColor: 'var(--cl-border-focus)',
                        color: 'var(--cl-accent-primary)',
                      }}
                      title={`打开 ${selectedDevice.name} 的 Clash 控制面板`}
                    >
                      <span>管理面板</span>
                      <ExternalLink className="h-3 w-3" strokeWidth={1.6} />
                    </a>
                  )}
                </>
              ) : (
                <div className="text-[13px] font-semibold tracking-tight">
                  {activeTab === 'live' ? '多端实时监控流' : '设备接入与系统设置'}
                </div>
              )}
            </div>

            {/* Right Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {showAnalyticsBar && (
                <>
                  {/* Scope switch */}
                  <div className="cl-segment">
                    {(
                      [
                        { k: 'all', l: '全部出口' },
                        { k: 'proxy', l: '仅代理' },
                        { k: 'direct', l: '仅直连' },
                      ] as const
                    ).map((s) => (
                      <button
                        type="button"
                        key={s.k}
                        onClick={() => onScopeChange(s.k)}
                        className={`cl-segment-item ${scope === s.k ? 'cl-segment-item-active' : ''}`}
                      >
                        {s.l}
                      </button>
                    ))}
                  </div>

                  {/* Range presets or selected day */}
                  {customDay ? (
                    <button
                      type="button"
                      onClick={onClearCustomDay}
                      className="cl-btn-accent font-mono text-[11px]"
                    >
                      <span>{customDay}</span>
                      <span className="text-[10px] opacity-80">× 清除</span>
                    </button>
                  ) : (
                    <div className="cl-segment">
                      {PRESETS.map((p) => (
                        <button
                          type="button"
                          key={p}
                          onClick={() => onPresetChange(p)}
                          className={`cl-segment-item font-mono ${
                            preset === p ? 'cl-segment-item-active' : ''
                          }`}
                          style={preset === p ? { color: 'var(--cl-accent-primary)' } : undefined}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Fixed-width Live rate badge (zero jitter on 2s ticks) */}
              <button
                type="button"
                onClick={() => onTabChange('live')}
                className="hidden h-7 cursor-pointer items-center gap-2 rounded-md border px-2.5 font-mono text-[11px] leading-none tabular-nums transition sm:inline-flex"
                style={{
                  borderColor: 'var(--cl-border-subtle)',
                  backgroundColor: 'var(--cl-bg-sidebar)',
                }}
                title="查看实时流量监控"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full animate-pulse"
                  style={{ backgroundColor: 'var(--cl-status-success)' }}
                />
                <span
                  className="inline-block w-[82px] shrink-0 whitespace-nowrap text-right"
                  style={{ color: 'var(--cl-accent-primary)' }}
                >
                  ↓ {formatSpeed(live?.total_down_bps)}
                </span>
                <span className="h-3 w-px shrink-0" style={{ backgroundColor: 'var(--cl-border-subtle)' }} />
                <span
                  className="inline-block w-[82px] shrink-0 whitespace-nowrap text-right"
                  style={{ color: 'var(--cl-text-secondary)' }}
                >
                  ↑ {formatSpeed(live?.total_up_bps)}
                </span>
              </button>

              <AppearancePopover />

              <button
                type="button"
                onClick={toggleColorMode}
                className="cl-icon-btn"
                title={isDark ? '切换浅色模式' : '切换深色模式'}
              >
                {isDark ? <Sun className="h-3.5 w-3.5" strokeWidth={1.6} /> : <Moon className="h-3.5 w-3.5" strokeWidth={1.6} />}
              </button>

              <button
                type="button"
                onClick={onToggleKiosk}
                className="cl-icon-btn"
                title={kiosk ? '退出全屏大屏模式' : '全屏大屏展示'}
              >
                {kiosk ? (
                  <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                )}
              </button>
            </div>
          </div>
        </header>

        <div className="cl-main-shell w-full flex-1">
          <main className="cl-main-container mx-auto w-full px-4 py-4 md:px-6 md:py-5 2xl:px-8 2xl:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
