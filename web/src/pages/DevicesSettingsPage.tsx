import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Plus,
  Save,
  Shield,
  Terminal,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { authApi } from '../api/authApi'
import { deviceApi } from '../api/deviceApi'
import { useI18n } from '../i18n/I18nProvider'
import { useTheme } from '../theme/ThemeProvider'
import type {
  DeviceInfo,
  SettingsPayload,
  StorageCompactResponse,
  StoragePruneResponse,
  StorageStatsResponse,
} from '../types/api'
import { formatBytes, formatFullTime, formatRelativeTime } from '../utils/format'

interface DevicesSettingsPageProps {
  devices: DeviceInfo[]
  onDevicesChanged: () => void
  initialSubTab?: 'devices' | 'settings'
  localMode?: boolean
}

export function DevicesSettingsPage({
  devices,
  onDevicesChanged,
  initialSubTab = 'devices',
  localMode = false,
}: DevicesSettingsPageProps) {
  const { privacyMode, togglePrivacyMode } = useTheme()
  const { lang, m } = useI18n()
  const [subTab, setSubTab] = useState<'devices' | 'settings'>(initialSubTab)

  // Add device form
  const [newName, setNewName] = useState('')
  const [newOS, setNewOS] = useState('windows')
  const [newDashboardURL, setNewDashboardURL] = useState('')
  const [deviceFormErr, setDeviceFormErr] = useState('')
  const [creating, setCreating] = useState(false)
  const [mintedToken, setMintedToken] = useState<{ name: string; os: string; token: string } | null>(null)
  const [revealMintedToken, setRevealMintedToken] = useState(false)
  const [expandedCmdId, setExpandedCmdId] = useState('')
  const [copiedKey, setCopiedKey] = useState('')

  // Rename / edit device state
  const [editingId, setEditingId] = useState('')
  const [editingName, setEditingName] = useState('')
  const [editingDashboardURL, setEditingDashboardURL] = useState('')

  // Settings state
  const [settings, setSettings] = useState<SettingsPayload>({
    monthly_quota_gb: 0,
    reset_day: 1,
    burst_threshold_mb: 200,
    minute_retention_days: 7,
    hourly_retention_days: 30,
    node_multipliers: [],
    domain_aliases: [],
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsNotice, setSettingsNotice] = useState('')

  // Password change
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')

  // Backup export & cross-machine import merge
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [mergeSettings, setMergeSettings] = useState(false)
  const [importingBackup, setImportingBackup] = useState(false)
  const [backupNotice, setBackupNotice] = useState<{ ok: boolean; text: string } | null>(null)

  // Storage stats, tiered compaction & prune state
  const [storageStats, setStorageStats] = useState<StorageStatsResponse | null>(null)
  const [storageLoading, setStorageLoading] = useState(false)
  const [retainDays, setRetainDays] = useState(30)
  const [pruneVacuum, setPruneVacuum] = useState(true)
  const [preserveSummary, setPreserveSummary] = useState(true)
  const [compacting, setCompacting] = useState(false)
  const [compactNotice, setCompactNotice] = useState<{
    ok: boolean
    text: string
    detail?: StorageCompactResponse
  } | null>(null)
  const [confirmPruneOpen, setConfirmPruneOpen] = useState(false)
  const [pruning, setPruning] = useState(false)
  const [pruneNotice, setPruneNotice] = useState<{ ok: boolean; text: string; detail?: StoragePruneResponse } | null>(null)

  useEffect(() => {
    setSubTab(initialSubTab)
  }, [initialSubTab])

  const loadStorageStats = async () => {
    setStorageLoading(true)
    try {
      const s = await deviceApi.getStorageStats()
      setStorageStats(s)
    } catch {
      // ignore
    } finally {
      setStorageLoading(false)
    }
  }

  useEffect(() => {
    deviceApi
      .getSettings()
      .then((s) => setSettings(s))
      .catch(() => {})
    void loadStorageStats()
  }, [])

  const serverOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8080'

  const copyText = async (key: string, text: string) => {
    let ok = false
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text)
        ok = true
      } catch {
        ok = false
      }
    }
    if (!ok) {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.readOnly = true
      ta.style.position = 'fixed'
      ta.style.top = '-9999px'
      ta.style.left = '-9999px'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      ta.setSelectionRange(0, text.length)
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false
      } finally {
        document.body.removeChild(ta)
      }
    }
    setCopiedKey(ok ? key : `${key}:err`)
    setTimeout(() => setCopiedKey(''), 1800)
  }

  const downloadYAML = (text: string) => {
    const blob = new Blob([text], { type: 'text/yaml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'agent.yaml'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCreateDevice = async (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setDeviceFormErr('')
    try {
      const res = await deviceApi.create(name, newOS, undefined, newDashboardURL.trim() || undefined)
      setMintedToken({ name: res.device.name, os: res.device.os, token: res.token })
      setRevealMintedToken(false)
      setNewName('')
      setNewDashboardURL('')
      onDevicesChanged()
    } catch (err) {
      setDeviceFormErr(err instanceof Error ? err.message : m.devices.createDeviceErr)
    } finally {
      setCreating(false)
    }
  }

  const handleRename = async (d: DeviceInfo) => {
    const trimmed = editingName.trim()
    if (!trimmed) return
    await deviceApi.update(d.id, trimmed, d.os, d.icon, editingDashboardURL.trim())
    setEditingId('')
    onDevicesChanged()
  }

  const handleDelete = async (d: DeviceInfo) => {
    if (!window.confirm(m.devices.confirmDeleteDevice(d.name))) return
    await deviceApi.delete(d.id)
    onDevicesChanged()
  }

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault()
    setSavingSettings(true)
    setSettingsNotice('')
    try {
      const saved = await deviceApi.saveSettings(settings)
      setSettings(saved)
      setSettingsNotice(m.devices.settingsSaved)
    } catch (err) {
      setSettingsNotice(err instanceof Error ? err.message : m.devices.settingsSaveFailed)
    } finally {
      setSavingSettings(false)
    }
  }

  const handleChangePwd = async (e: FormEvent) => {
    e.preventDefault()
    setPwdMsg('')
    try {
      await authApi.changePassword(oldPwd, newPwd)
      setOldPwd('')
      setNewPwd('')
      setPwdMsg(m.devices.passwordUpdated)
    } catch (err) {
      setPwdMsg(err instanceof Error ? err.message : m.devices.passwordUpdateFailed)
    }
  }

  const handleImportFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportingBackup(true)
    setBackupNotice(null)
    try {
      const res = await deviceApi.importBackup(file, mergeSettings)
      setBackupNotice({
        ok: true,
        text: m.devices.importSuccess(
          res.devices_imported,
          res.devices_existing,
          res.minute_totals_rows,
          res.minute_flows_rows + res.hourly_flows_rows + (res.daily_flows_rows ?? 0),
          res.settings_imported,
        ),
      })
      onDevicesChanged()
      void loadStorageStats()
      if (res.settings_imported) {
        deviceApi.getSettings({ force: true }).then((s) => setSettings(s)).catch(() => {})
      }
    } catch (err) {
      setBackupNotice({
        ok: false,
        text: err instanceof Error ? err.message : m.devices.importFailed,
      })
    } finally {
      setImportingBackup(false)
    }
  }

  const handleCompactStorage = async () => {
    setCompacting(true)
    setCompactNotice(null)
    try {
      const minDays = settings.minute_retention_days ?? 7
      const hourDays = settings.hourly_retention_days ?? 30
      const res = await deviceApi.compactStorage({
        minute_retain_days: minDays,
        hourly_retain_days: hourDays,
        vacuum: pruneVacuum,
      })
      setCompactNotice({
        ok: true,
        text: m.devices.compactSuccess(
          res.pruned_minute_rows,
          res.archived_hourly_rows,
          res.daily_flows_upserted,
          formatBytes(res.before_bytes),
          formatBytes(res.after_bytes),
        ),
        detail: res,
      })
      onDevicesChanged()
      void loadStorageStats()
    } catch (err) {
      setCompactNotice({
        ok: false,
        text: err instanceof Error ? err.message : m.devices.compactFailed,
      })
    } finally {
      setCompacting(false)
    }
  }

  const handleConfirmPrune = async () => {
    const safeDays = Math.max(7, Math.floor(retainDays || 30))
    setPruning(true)
    setPruneNotice(null)
    try {
      const res = await deviceApi.pruneStorage({
        retain_days: safeDays,
        vacuum: pruneVacuum,
        preserve_summary: preserveSummary,
      })
      setPruneNotice({
        ok: true,
        text: m.devices.pruneSuccess(
          res.total_deleted_rows,
          formatBytes(res.before_bytes),
          formatBytes(res.after_bytes),
        ),
        detail: res,
      })
      setConfirmPruneOpen(false)
      onDevicesChanged()
      void loadStorageStats()
    } catch (err) {
      setPruneNotice({
        ok: false,
        text: err instanceof Error ? err.message : m.devices.pruneFailed,
      })
      setConfirmPruneOpen(false)
    } finally {
      setPruning(false)
    }
  }

  const buildStarterCommand = (osName: string, tokenVal: string) => {
    if (osName === 'linux' || osName === 'darwin') {
      const bin = osName === 'darwin' ? './clashlens-agent-darwin-arm64' : './clashlens-agent-linux-amd64'
      return `${bin} --server ${serverOrigin} --token ${tokenVal}`
    }
    return `.\\clashlens-agent-windows-amd64.exe --server ${serverOrigin} --token ${tokenVal}`
  }

  const sampleYAML = mintedToken
    ? `server_url: "${serverOrigin}"\ndevice_token: "${mintedToken.token}"\nclash_endpoint: "auto"\nsanitize_paths: true\nsanitize_mode: "mask"\nflush_interval_sec: 60\nupload_interval_sec: 15\nlive_push_interval_sec: 2`
    : ''
  const previewYAML = mintedToken
    ? `server_url: "${serverOrigin}"\ndevice_token: "${revealMintedToken ? mintedToken.token : `${mintedToken.token.slice(0, 6)}••••••••••••`}"\nclash_endpoint: "auto"\nsanitize_paths: true\nsanitize_mode: "mask"\nflush_interval_sec: 60\nupload_interval_sec: 15\nlive_push_interval_sec: 2`
    : ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="cl-segment">
          <button
            type="button"
            onClick={() => setSubTab('devices')}
            className={`cl-segment-item ${subTab === 'devices' ? 'cl-segment-item-active' : ''}`}
            style={subTab === 'devices' ? { color: 'var(--cl-accent-primary)' } : undefined}
          >
            {m.devices.subTabDevices(devices.length)}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('settings')}
            className={`cl-segment-item ${subTab === 'settings' ? 'cl-segment-item-active' : ''}`}
            style={subTab === 'settings' ? { color: 'var(--cl-accent-primary)' } : undefined}
          >
            {m.devices.subTabSettings}
          </button>
        </div>
      </div>

      {subTab === 'devices' ? (
        <div className="space-y-4">
          {/* Create Device Form */}
          <form onSubmit={handleCreateDevice} className="cl-card rounded-xl p-4">
            <h2 className="text-sm font-semibold tracking-tight">{m.devices.addDeviceTitle}</h2>
            <p className="mt-0.5 text-xs text-[var(--cl-text-muted)]">{m.devices.addDeviceDesc}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={m.devices.deviceNamePlaceholder}
                className="cl-input min-w-[200px] flex-1"
              />
              <input
                type="url"
                value={newDashboardURL}
                onChange={(e) => setNewDashboardURL(e.target.value)}
                placeholder={m.devices.dashboardUrlPlaceholder}
                className="cl-input min-w-[200px] flex-1 font-mono"
              />
              <select
                value={newOS}
                onChange={(e) => setNewOS(e.target.value)}
                className="cl-input"
              >
                <option value="windows">{m.devices.osDesktop}</option>
                <option value="laptop">{m.devices.osLaptop}</option>
                <option value="darwin">macOS</option>
                <option value="linux">{m.devices.osLinux}</option>
                <option value="android">Android (Clash For Android)</option>
              </select>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="cl-btn-primary !h-8"
              >
                <Plus className="h-3.5 w-3.5" />
                {m.devices.createTokenBtn}
              </button>
            </div>
            {deviceFormErr && (
              <div className="mt-2 text-xs" style={{ color: 'var(--cl-status-danger)' }}>
                {deviceFormErr}
              </div>
            )}
          </form>

          {/* Newly Minted Token Banner */}
          {mintedToken && (
            <div
              className="rounded-xl border p-4"
              style={{
                borderColor: 'var(--cl-border-focus)',
                backgroundColor: 'var(--cl-accent-soft)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--cl-accent-primary)' }}>
                    {m.devices.tokenMintedTitle(mintedToken.name)}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--cl-text-muted)]">
                    {m.devices.tokenMintedHint}
                  </p>
                </div>
                <button
                  onClick={() => setMintedToken(null)}
                  className="rounded p-1 text-[var(--cl-text-muted)] hover:text-[var(--cl-text-primary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 space-y-2.5">
                <div
                  className="relative rounded-lg border p-3 font-mono text-xs"
                  style={{
                    borderColor: 'var(--cl-border-subtle)',
                    backgroundColor: 'var(--cl-bg-page)',
                    color: 'var(--cl-text-primary)',
                  }}
                >
                  <pre className="overflow-x-auto whitespace-pre-wrap pr-56 select-all">{previewYAML}</pre>
                  <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRevealMintedToken((v) => !v)}
                      className="cl-btn-secondary !h-6 !px-2 !text-[11px]"
                      title={revealMintedToken ? m.devices.hideTokenTitle : m.devices.showTokenTitle}
                    >
                      {revealMintedToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {revealMintedToken ? m.devices.hideToken : m.devices.showToken}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadYAML(sampleYAML)}
                      className="cl-btn-secondary !h-6 !px-2 !text-[11px]"
                    >
                      <Download className="h-3 w-3" />
                      {m.devices.download}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText('yaml', sampleYAML)}
                      className="cl-btn-secondary !h-6 !px-2 !text-[11px]"
                    >
                      {copiedKey === 'yaml' ? (
                        <Check className="h-3 w-3" style={{ color: 'var(--cl-status-success)' }} />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copiedKey === 'yaml'
                        ? m.common.copied
                        : copiedKey === 'yaml:err'
                          ? m.common.copyFailed
                          : m.devices.copyYaml}
                    </button>
                  </div>
                </div>

                <div
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 font-mono text-[11px]"
                  style={{
                    borderColor: 'var(--cl-border-subtle)',
                    backgroundColor: 'var(--cl-bg-page)',
                    color: 'var(--cl-text-secondary)',
                  }}
                >
                  <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap select-all">
                    {buildStarterCommand(
                      mintedToken.os,
                      revealMintedToken ? mintedToken.token : `${mintedToken.token.slice(0, 6)}••••••••••••`,
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void copyText('cmd', buildStarterCommand(mintedToken.os, mintedToken.token))
                    }
                    className="cl-btn-secondary !h-6 shrink-0 !px-2 !text-[11px]"
                  >
                    {copiedKey === 'cmd'
                      ? m.devices.copiedCmd
                      : copiedKey === 'cmd:err'
                        ? m.common.copyFailed
                        : m.devices.copyCmd}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Device List */}
          <div className="cl-card overflow-hidden rounded-xl">
            <div
              className="border-b px-4 py-3"
              style={{ borderColor: 'var(--cl-border-subtle)' }}
            >
              <h3 className="text-sm font-semibold">{m.devices.registeredDevicesTitle}</h3>
            </div>
            <div className="divide-y divide-[var(--cl-border-subtle)]">
              {devices.length === 0 ? (
                <div className="py-10 text-center text-xs text-[var(--cl-text-muted)]">
                  {m.devices.noDevicesYet}
                </div>
              ) : (
                devices.map((d) => {
                  const cmdOpen = expandedCmdId === d.id
                  const starterTemplate = buildStarterCommand(d.os, `<YOUR_TOKEN_${d.token_prefix}>`)
                  const diagAlerts: string[] = []
                  if (d.tun_enabled && !d.sniffer_enabled) {
                    diagAlerts.push(m.devices.diagTunNoSniffer)
                  }
                  if (!d.online && d.last_seen_at > 0) {
                    diagAlerts.push(m.devices.diagOffline(formatRelativeTime(d.last_seen_at, lang)))
                  }
                  return (
                    <div key={d.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{
                                backgroundColor: d.online ? 'var(--cl-status-success)' : 'var(--cl-text-muted)',
                              }}
                            />
                            {editingId === d.id ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <input
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  className="cl-input !h-6 !px-2 text-xs"
                                  placeholder={m.devices.deviceNameShort}
                                />
                                <input
                                  type="url"
                                  value={editingDashboardURL}
                                  onChange={(e) => setEditingDashboardURL(e.target.value)}
                                  className="cl-input !h-6 min-w-[200px] !px-2 font-mono text-xs"
                                  placeholder={m.devices.dashboardUrlShort}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRename(d)}
                                  className="cl-btn-primary !h-6 !px-2 !text-[11px]"
                                >
                                  {m.common.save}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId('')}
                                  className="text-[11px] text-[var(--cl-text-muted)]"
                                >
                                  {m.common.cancel}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(d.id)
                                  setEditingName(d.name)
                                  setEditingDashboardURL(d.dashboard_url || '')
                                }}
                                className="cursor-pointer text-sm font-semibold hover:underline"
                                style={{ color: 'var(--cl-text-primary)' }}
                                title={m.devices.editDeviceTitle}
                              >
                                {d.name}
                              </button>
                            )}
                            <span
                              className="rounded px-1.5 py-0.5 font-mono text-[10px] text-[var(--cl-text-muted)]"
                              style={{ backgroundColor: 'var(--cl-bg-surface-hover)' }}
                            >
                              {d.os}
                            </span>
                            {d.tun_enabled && (
                              <span
                                className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                                style={{
                                  backgroundColor: 'var(--cl-accent-soft)',
                                  color: 'var(--cl-accent-primary)',
                                }}
                              >
                                TUN
                              </span>
                            )}
                            {d.dashboard_url && editingId !== d.id && (
                              <a
                                href={d.dashboard_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition hover:opacity-90"
                                style={{
                                  backgroundColor: 'var(--cl-accent-soft)',
                                  color: 'var(--cl-accent-primary)',
                                }}
                                title={m.devices.openPanelTitle(d.name)}
                              >
                                {m.devices.adminPanel}
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 font-mono text-[11px] text-[var(--cl-text-muted)]">
                            <span>Token: {d.token_prefix}••••••••</span>
                            <span>{m.devices.coreLabel(d.mihomo_version || '-')}</span>
                            <span>{m.devices.snifferLabel(d.sniffer_enabled)}</span>
                            <span>{m.devices.lastHeartbeatLabel(formatRelativeTime(d.last_seen_at, lang))}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <div className="mr-1 text-right font-mono tabular-nums">
                            <div className="text-xs font-semibold" style={{ color: 'var(--cl-accent-primary)' }}>
                              {m.devices.todayTotal(formatBytes(d.today_bytes))}
                            </div>
                            <div className="text-[10px] text-[var(--cl-text-muted)]">
                              {m.devices.todayProxy(formatBytes(d.today_proxy_bytes))}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedCmdId(cmdOpen ? '' : d.id)}
                            className="cl-btn-secondary !h-7 !px-2 !text-[11px]"
                            title={m.devices.toggleCmdTitle}
                          >
                            {cmdOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            <Terminal className="h-3 w-3" />
                            {m.devices.startCmdBtn}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(d)}
                            className="rounded-lg border p-1.5 text-[var(--cl-text-muted)] transition hover:border-rose-500/40 hover:text-rose-400"
                            style={{ borderColor: 'var(--cl-border-subtle)' }}
                            title={m.devices.deleteDeviceTitle}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {diagAlerts.length > 0 && (
                        <div
                          className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px]"
                          style={{
                            borderColor: 'rgba(245, 158, 11, 0.30)',
                            backgroundColor: 'rgba(245, 158, 11, 0.08)',
                            color: 'var(--cl-status-warning)',
                          }}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>{diagAlerts.join(lang === 'en' ? '; ' : '；')}</span>
                        </div>
                      )}

                      {cmdOpen && (
                        <div
                          className="mt-2.5 space-y-1.5 rounded-lg border p-3 text-[11px]"
                          style={{
                            borderColor: 'var(--cl-border-subtle)',
                            backgroundColor: 'var(--cl-bg-sidebar)',
                          }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--cl-text-muted)]">
                            <span>
                              {m.devices.tokenHashNoticePrefix}
                              <code className="font-mono text-[var(--cl-text-primary)]">{d.token_prefix}</code>
                              {lang === 'en' ? '):' : '）：'}
                            </span>
                            <button
                              type="button"
                              onClick={() => void copyText(`cmd:${d.id}`, starterTemplate)}
                              className="cl-btn-secondary !h-6 !px-2 !text-[10px]"
                            >
                              {copiedKey === `cmd:${d.id}` ? (
                                <Check className="h-3 w-3" style={{ color: 'var(--cl-status-success)' }} />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              {copiedKey === `cmd:${d.id}` ? m.devices.copiedTemplate : m.devices.copyCmdTemplate}
                            </button>
                          </div>
                          <div
                            className="overflow-x-auto whitespace-nowrap rounded border px-2.5 py-1.5 font-mono"
                            style={{
                              borderColor: 'var(--cl-border-subtle)',
                              backgroundColor: 'var(--cl-bg-page)',
                              color: 'var(--cl-text-secondary)',
                            }}
                          >
                            {starterTemplate}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Quota & Multipliers & Aliases */}
          <form onSubmit={handleSaveSettings} className="cl-card space-y-4 rounded-xl p-4 sm:p-5">
            <h2 className="text-sm font-semibold">{m.devices.settingsTitle}</h2>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">{m.devices.quotaGbLabel}</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={settings.monthly_quota_gb}
                  onChange={(e) =>
                    setSettings({ ...settings, monthly_quota_gb: Number(e.target.value) || 0 })
                  }
                  className="cl-input w-full font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">{m.devices.resetDayLabel}</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={settings.reset_day}
                  onChange={(e) =>
                    setSettings({ ...settings, reset_day: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })
                  }
                  className="cl-input w-full font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">{m.devices.burstMbLabel}</label>
                <input
                  type="number"
                  min="10"
                  value={settings.burst_threshold_mb}
                  onChange={(e) =>
                    setSettings({ ...settings, burst_threshold_mb: Number(e.target.value) || 200 })
                  }
                  className="cl-input w-full font-mono"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">{m.devices.minuteRetentionLabel}</label>
                <select
                  value={settings.minute_retention_days ?? 7}
                  onChange={(e) => {
                    const minDays = Number(e.target.value) || 7
                    const h = Math.max(minDays, settings.hourly_retention_days ?? 30)
                    setSettings({ ...settings, minute_retention_days: minDays, hourly_retention_days: h })
                  }}
                  className="cl-input w-full font-mono"
                >
                  <option value={3}>{m.devices.minuteRetention3}</option>
                  <option value={7}>{m.devices.minuteRetention7}</option>
                  <option value={14}>{m.common.daysSuffix(14)}</option>
                  <option value={30}>{m.common.daysSuffix(30)}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">{m.devices.hourlyRetentionLabel}</label>
                <select
                  value={settings.hourly_retention_days ?? 30}
                  onChange={(e) =>
                    setSettings({ ...settings, hourly_retention_days: Number(e.target.value) || 30 })
                  }
                  className="cl-input w-full font-mono"
                >
                  <option value={14}>{m.common.daysSuffix(14)}</option>
                  <option value={30}>{m.devices.hourlyRetention30}</option>
                  <option value={60}>{m.common.daysSuffix(60)}</option>
                  <option value={90}>{m.common.daysSuffix(90)}</option>
                  <option value={180}>{m.common.daysSuffix(180)}</option>
                </select>
              </div>
            </div>

            {/* Multipliers */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium">{m.devices.multiplierRulesLabel}</label>
                <button
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      node_multipliers: [...settings.node_multipliers, { pattern: '', multiplier: 1.0 }],
                    })
                  }
                  className="cursor-pointer text-xs hover:underline"
                  style={{ color: 'var(--cl-accent-primary)' }}
                >
                  {m.devices.addRuleBtn}
                </button>
              </div>
              <div className="space-y-2">
                {settings.node_multipliers.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      value={r.pattern}
                      onChange={(e) => {
                        const next = [...settings.node_multipliers]
                        next[idx] = { ...next[idx], pattern: e.target.value }
                        setSettings({ ...settings, node_multipliers: next })
                      }}
                      placeholder={m.devices.nodePatternPlaceholder}
                      className="cl-input flex-1 font-mono"
                    />
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={r.multiplier}
                      onChange={(e) => {
                        const next = [...settings.node_multipliers]
                        next[idx] = { ...next[idx], multiplier: Number(e.target.value) || 0 }
                        setSettings({ ...settings, node_multipliers: next })
                      }}
                      className="cl-input w-24 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          node_multipliers: settings.node_multipliers.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-1 text-[var(--cl-text-muted)] hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Domain Aliases */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium">{m.devices.customDomainAliasLabel}</label>
                <button
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      domain_aliases: [...settings.domain_aliases, { domain: '', label: '' }],
                    })
                  }
                  className="cursor-pointer text-xs hover:underline"
                  style={{ color: 'var(--cl-accent-primary)' }}
                >
                  {m.devices.addAliasBtn}
                </button>
              </div>
              <div className="space-y-2">
                {settings.domain_aliases.map((a, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      value={a.domain}
                      onChange={(e) => {
                        const next = [...settings.domain_aliases]
                        next[idx] = { ...next[idx], domain: e.target.value }
                        setSettings({ ...settings, domain_aliases: next })
                      }}
                      placeholder={m.devices.domainPlaceholder}
                      className="cl-input flex-1 font-mono"
                    />
                    <input
                      value={a.label}
                      onChange={(e) => {
                        const next = [...settings.domain_aliases]
                        next[idx] = { ...next[idx], label: e.target.value }
                        setSettings({ ...settings, domain_aliases: next })
                      }}
                      placeholder={m.devices.aliasPlaceholder}
                      className="cl-input flex-1"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          domain_aliases: settings.domain_aliases.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-1 text-[var(--cl-text-muted)] hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {settingsNotice && (
              <div className="text-xs" style={{ color: 'var(--cl-status-success)' }}>
                {settingsNotice}
              </div>
            )}

            <button
              type="submit"
              disabled={savingSettings}
              className="cl-btn-primary !h-8"
            >
              <Save className="h-3.5 w-3.5" />
              {savingSettings ? m.devices.savingSettings : m.devices.saveSettings}
            </button>
          </form>

          <div className="space-y-4">
            {/* Backup Export / Cross-Machine Import Card */}
            <div className="cl-card space-y-3 rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4" style={{ color: 'var(--cl-accent-primary)' }} />
                <h2 className="text-sm font-semibold">{m.devices.backupTitle}</h2>
              </div>
              <p className="text-xs leading-relaxed text-[var(--cl-text-muted)]">{m.devices.backupDesc}</p>

              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--cl-text-muted)]">
                <input
                  type="checkbox"
                  checked={mergeSettings}
                  onChange={(e) => setMergeSettings(e.target.checked)}
                  className="h-3.5 w-3.5 rounded"
                  style={{ accentColor: 'var(--cl-accent-primary)' }}
                />
                <span>{m.devices.importOverwriteSettings}</span>
              </label>

              <input
                ref={importInputRef}
                type="file"
                accept=".gz,.json,application/gzip,application/json"
                onChange={(e) => void handleImportFileChange(e)}
                className="hidden"
              />

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={deviceApi.exportBackupUrl()}
                  download
                  className="cl-btn-secondary !h-8"
                >
                  <Download className="h-3.5 w-3.5" />
                  {m.devices.exportBackupBtn}
                </a>
                <button
                  type="button"
                  disabled={importingBackup}
                  onClick={() => importInputRef.current?.click()}
                  className="cl-btn-primary !h-8"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {importingBackup ? m.devices.importingBackup : m.devices.importBackupBtn}
                </button>
              </div>

              {backupNotice && (
                <div
                  className="text-xs"
                  style={{ color: backupNotice.ok ? 'var(--cl-status-success)' : 'var(--cl-status-danger)' }}
                >
                  {backupNotice.text}
                </div>
              )}
            </div>

            {/* Privacy Mask Mode Card */}
            <div className="cl-card flex items-center justify-between gap-3 rounded-xl p-4 sm:p-5">
              <div className="flex items-start gap-2.5">
                <Shield className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--cl-accent-primary)' }} />
                <div>
                  <h2 className="text-sm font-semibold">{m.devices.privacyTitle}</h2>
                  <p className="mt-0.5 text-xs text-[var(--cl-text-muted)]">{m.devices.privacyDesc}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={togglePrivacyMode}
                className={privacyMode ? 'cl-btn-accent !h-8 shrink-0' : 'cl-btn-secondary !h-8 shrink-0'}
              >
                {privacyMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {privacyMode ? m.devices.privacyEnabledBtn : m.devices.privacyEnableBtn}
              </button>
            </div>

            {/* Storage Stats, Lossless Archival & Prune Card */}
            <div className="cl-card space-y-3 rounded-xl p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4" style={{ color: 'var(--cl-accent-primary)' }} />
                  <h2 className="text-sm font-semibold">{m.devices.storageTitle}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void loadStorageStats()}
                  disabled={storageLoading}
                  className="cl-btn-secondary !h-6 !px-2 !text-[11px]"
                >
                  {storageLoading ? m.devices.refreshingStats : m.devices.refreshStats}
                </button>
              </div>

              {storageStats ? (
                <div className="grid grid-cols-2 gap-2.5 font-mono text-xs sm:grid-cols-3">
                  <div
                    className="rounded-lg border p-2.5"
                    style={{ borderColor: 'var(--cl-border-subtle)', backgroundColor: 'var(--cl-bg-sidebar)' }}
                  >
                    <div className="font-sans text-[11px] text-[var(--cl-text-muted)]">{m.devices.storageTotalSize}</div>
                    <div className="mt-1 text-sm font-bold tabular-nums" style={{ color: 'var(--cl-accent-primary)' }}>
                      {formatBytes(storageStats.total_size_bytes)}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--cl-text-muted)] tabular-nums">
                      {m.devices.storageDbDetail(formatBytes(storageStats.db_size_bytes), formatBytes(storageStats.wal_size_bytes))}
                    </div>
                  </div>
                  <div
                    className="rounded-lg border p-2.5"
                    style={{ borderColor: 'var(--cl-border-subtle)', backgroundColor: 'var(--cl-bg-sidebar)' }}
                  >
                    <div className="font-sans text-[11px] text-[var(--cl-text-muted)]">{m.devices.storageRowCount}</div>
                    <div className="mt-1 text-sm font-bold tabular-nums">
                      {m.devices.storageRowsUnit(
                        storageStats.minute_flows_rows + storageStats.hourly_flows_rows + storageStats.daily_flows_rows,
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--cl-text-muted)] tabular-nums">
                      {m.devices.storageTierDetail(
                        storageStats.minute_flows_rows,
                        storageStats.hourly_flows_rows,
                        storageStats.daily_flows_rows,
                      )}
                    </div>
                  </div>
                  <div
                    className="rounded-lg border p-2.5 col-span-2 sm:col-span-1"
                    style={{ borderColor: 'var(--cl-border-subtle)', backgroundColor: 'var(--cl-bg-sidebar)' }}
                  >
                    <div className="font-sans text-[11px] text-[var(--cl-text-muted)]">{m.devices.storageTimeSpan}</div>
                    <div className="mt-1 truncate text-[11px] font-semibold tabular-nums">
                      {storageStats.oldest_timestamp > 0 ? formatFullTime(storageStats.oldest_timestamp, lang).slice(0, 10) : '-'}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-[var(--cl-text-muted)] tabular-nums">
                      {m.devices.storageToDate(
                        storageStats.newest_timestamp > 0 ? formatFullTime(storageStats.newest_timestamp, lang).slice(0, 10) : '-',
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[var(--cl-text-muted)]">{m.devices.storageLoading}</div>
              )}

              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5"
                style={{ borderColor: 'var(--cl-border-subtle)', backgroundColor: 'var(--cl-bg-sidebar)' }}
              >
                <div className="min-w-0 flex-1 text-[11px] text-[var(--cl-text-muted)]">
                  {m.devices.compactDesc(settings.minute_retention_days ?? 7, settings.hourly_retention_days ?? 30)}
                </div>
                <button
                  type="button"
                  data-testid="compact-storage-btn"
                  onClick={() => void handleCompactStorage()}
                  disabled={compacting}
                  className="cl-btn-accent !h-7 shrink-0"
                >
                  <Archive className="h-3 w-3" />
                  {compacting ? m.devices.compacting : m.devices.compactNowBtn}
                </button>
              </div>

              {compactNotice && (
                <div
                  data-testid="compact-storage-notice"
                  className="text-xs"
                  style={{ color: compactNotice.ok ? 'var(--cl-status-success)' : 'var(--cl-status-danger)' }}
                >
                  {compactNotice.text}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5 border-t pt-2.5" style={{ borderColor: 'var(--cl-border-subtle)' }}>
                <label className="flex items-center gap-1.5 text-xs text-[var(--cl-text-muted)]">
                  <span>{m.devices.retainRecentPrefix}</span>
                  <select
                    value={retainDays}
                    onChange={(e) => setRetainDays(Math.max(7, Number(e.target.value) || 30))}
                    className="cl-input !h-7 px-2 font-mono text-xs"
                  >
                    <option value={7}>{m.common.daysSuffix(7)}</option>
                    <option value={14}>{m.common.daysSuffix(14)}</option>
                    <option value={30}>{m.common.daysSuffix(30)}</option>
                    <option value={90}>{m.common.daysSuffix(90)}</option>
                    <option value={180}>{m.common.daysSuffix(180)}</option>
                    <option value={365}>{m.common.daysSuffix(365)}</option>
                  </select>
                </label>

                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--cl-text-muted)]">
                  <input
                    type="checkbox"
                    checked={preserveSummary}
                    onChange={(e) => setPreserveSummary(e.target.checked)}
                    className="h-3.5 w-3.5 rounded"
                    style={{ accentColor: 'var(--cl-accent-primary)' }}
                  />
                  <span>{m.devices.preserveSummaryLabel}</span>
                </label>

                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--cl-text-muted)]">
                  <input
                    type="checkbox"
                    checked={pruneVacuum}
                    onChange={(e) => setPruneVacuum(e.target.checked)}
                    className="h-3.5 w-3.5 rounded"
                    style={{ accentColor: 'var(--cl-accent-primary)' }}
                  />
                  <span>{m.devices.vacuumLabel}</span>
                </label>

                <button
                  type="button"
                  onClick={() => setConfirmPruneOpen(true)}
                  disabled={pruning}
                  className="cl-btn-secondary !h-7 hover:border-rose-500/40 hover:text-rose-400"
                >
                  <Trash2 className="h-3 w-3" />
                  {m.devices.pruneExpiredBtn}
                </button>
              </div>

              {pruneNotice && (
                <div
                  className="text-xs"
                  style={{ color: pruneNotice.ok ? 'var(--cl-status-success)' : 'var(--cl-status-danger)' }}
                >
                  {pruneNotice.text}
                </div>
              )}
            </div>

            {/* Security Password Card */}
            {!localMode && (
              <form onSubmit={handleChangePwd} className="cl-card h-fit space-y-3 rounded-xl p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" style={{ color: 'var(--cl-accent-primary)' }} />
                  <h2 className="text-sm font-semibold">{m.devices.passwordTitle}</h2>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">{m.devices.oldPasswordLabel}</label>
                  <input
                    type="password"
                    value={oldPwd}
                    onChange={(e) => setOldPwd(e.target.value)}
                    className="cl-input w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">{m.devices.newPasswordLabel}</label>
                  <input
                    type="password"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    className="cl-input w-full"
                  />
                </div>
                {pwdMsg && (
                  <div className="text-xs" style={{ color: 'var(--cl-status-success)' }}>
                    {pwdMsg}
                  </div>
                )}
                <button
                  type="submit"
                  className="cl-btn-secondary !h-8"
                >
                  {m.devices.updatePasswordBtn}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Two-step Prune Confirmation Modal */}
      {confirmPruneOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <div className="cl-popover w-full max-w-md rounded-xl border p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--cl-status-warning)' }} />
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{m.devices.pruneConfirmTitle}</h3>
                <p className="text-xs leading-relaxed text-[var(--cl-text-muted)]">
                  {m.devices.pruneConfirmDesc(retainDays, preserveSummary, pruneVacuum)}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pruning}
                onClick={() => setConfirmPruneOpen(false)}
                className="cl-btn-secondary !h-8"
              >
                {m.common.cancel}
              </button>
              <button
                type="button"
                disabled={pruning}
                onClick={() => void handleConfirmPrune()}
                className="cl-btn-primary !h-8"
              >
                {pruning ? m.devices.pruning : m.devices.confirmPruneBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
