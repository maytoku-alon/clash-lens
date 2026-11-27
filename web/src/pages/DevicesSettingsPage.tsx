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
      setDeviceFormErr(err instanceof Error ? err.message : '创建设备失败')
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
    if (!window.confirm(`确定删除设备「${d.name}」及其全部历史流量数据吗？`)) return
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
      setSettingsNotice('设置已保存并立即生效')
    } catch (err) {
      setSettingsNotice(err instanceof Error ? err.message : '保存失败')
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
      setPwdMsg('管理员密码修改成功')
    } catch (err) {
      setPwdMsg(err instanceof Error ? err.message : '修改失败')
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
        text: `合并成功：新增设备 ${res.devices_imported} 台、已有设备 ${res.devices_existing} 台、导入分钟统计 ${res.minute_totals_rows} 条、明细 ${res.minute_flows_rows + res.hourly_flows_rows} 条${res.settings_imported ? '（已同步套餐设置）' : ''}。`,
      })
      onDevicesChanged()
      void loadStorageStats()
      if (res.settings_imported) {
        deviceApi.getSettings({ force: true }).then((s) => setSettings(s)).catch(() => {})
      }
    } catch (err) {
      setBackupNotice({
        ok: false,
        text: err instanceof Error ? err.message : '导入失败',
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
        text: `无损归档完成：已清理 ${res.pruned_minute_rows} 条过期分钟明细，将 ${res.archived_hourly_rows} 条小时明细按天归档（生成 ${res.daily_flows_upserted} 条冷层日记录），占用 ${formatBytes(res.before_bytes)} → ${formatBytes(res.after_bytes)}。`,
        detail: res,
      })
      onDevicesChanged()
      void loadStorageStats()
    } catch (err) {
      setCompactNotice({
        ok: false,
        text: err instanceof Error ? err.message : '归档失败',
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
        text: `已清理 ${res.total_deleted_rows} 条过期记录（空间 ${formatBytes(res.before_bytes)} → ${formatBytes(res.after_bytes)}）。`,
        detail: res,
      })
      setConfirmPruneOpen(false)
      onDevicesChanged()
      void loadStorageStats()
    } catch (err) {
      setPruneNotice({
        ok: false,
        text: err instanceof Error ? err.message : '清理失败',
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
            设备接入管理 ({devices.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('settings')}
            className={`cl-segment-item ${subTab === 'settings' ? 'cl-segment-item-active' : ''}`}
            style={subTab === 'settings' ? { color: 'var(--cl-accent-primary)' } : undefined}
          >
            套餐倍率 · 别名 · 安全
          </button>
        </div>
      </div>

      {subTab === 'devices' ? (
        <div className="space-y-4">
          {/* Create Device Form */}
          <form onSubmit={handleCreateDevice} className="cl-card rounded-xl p-4">
            <h2 className="text-sm font-semibold tracking-tight">添加监控设备</h2>
            <p className="mt-0.5 text-xs text-[var(--cl-text-muted)]">
              为每台电脑、笔记本或服务器签发独立 Device Token，多端流量汇总展示；可选填写该主机原生 Clash 控制面板链接以快速跳转。
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="设备名称（如：主力台式机、轻薄笔记本、Linux 服务器）"
                className="cl-input min-w-[200px] flex-1"
              />
              <input
                type="url"
                value={newDashboardURL}
                onChange={(e) => setNewDashboardURL(e.target.value)}
                placeholder="可选：Clash 面板 URL (http://...)"
                className="cl-input min-w-[200px] flex-1 font-mono"
              />
              <select
                value={newOS}
                onChange={(e) => setNewOS(e.target.value)}
                className="cl-input"
              >
                <option value="windows">Windows (Clash Verge Rev)</option>
                <option value="laptop">Windows 笔记本</option>
                <option value="darwin">macOS</option>
                <option value="linux">Linux 服务器 / 软路由</option>
                <option value="android">Android (Clash For Android)</option>
              </select>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="cl-btn-primary !h-8"
              >
                <Plus className="h-3.5 w-3.5" />
                生成设备 Token
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
                    设备「{mintedToken.name}」创建成功（Token 仅展示这一次）
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--cl-text-muted)]">
                    请复制以下 `agent.yaml` 配置到本机 `%APPDATA%\ClashLens\agent.yaml`（或与 `clashlens-agent.exe` 同目录）。
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
                      title={revealMintedToken ? '隐藏明文 Token' : '显示明文 Token'}
                    >
                      {revealMintedToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {revealMintedToken ? '隐藏' : '显示'}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadYAML(sampleYAML)}
                      className="cl-btn-secondary !h-6 !px-2 !text-[11px]"
                    >
                      <Download className="h-3 w-3" />
                      下载
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
                      {copiedKey === 'yaml' ? '已复制' : copiedKey === 'yaml:err' ? '复制失败' : '复制 agent.yaml'}
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
                    {copiedKey === 'cmd' ? '已复制命令' : copiedKey === 'cmd:err' ? '复制失败' : '复制启动命令'}
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
              <h3 className="text-sm font-semibold">已注册设备列表</h3>
            </div>
            <div className="divide-y divide-[var(--cl-border-subtle)]">
              {devices.length === 0 ? (
                <div className="py-10 text-center text-xs text-[var(--cl-text-muted)]">
                  尚未添加任何设备，请在上方创建首个设备 Token
                </div>
              ) : (
                devices.map((d) => {
                  const cmdOpen = expandedCmdId === d.id
                  const starterTemplate = buildStarterCommand(d.os, `<YOUR_TOKEN_${d.token_prefix}>`)
                  const diagAlerts: string[] = []
                  if (d.tun_enabled && !d.sniffer_enabled) {
                    diagAlerts.push('TUN 已开启但域名嗅探 (Sniffer) 未开启，部分连接可能仅显示 IP')
                  }
                  if (!d.online && d.last_seen_at > 0) {
                    diagAlerts.push(`心跳已离线（最后上报 ${formatRelativeTime(d.last_seen_at)}），请确认采集端正在运行`)
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
                                  placeholder="设备名称"
                                />
                                <input
                                  type="url"
                                  value={editingDashboardURL}
                                  onChange={(e) => setEditingDashboardURL(e.target.value)}
                                  className="cl-input !h-6 min-w-[200px] !px-2 font-mono text-xs"
                                  placeholder="Clash 面板 URL（可选）"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRename(d)}
                                  className="cl-btn-primary !h-6 !px-2 !text-[11px]"
                                >
                                  保存
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId('')}
                                  className="text-[11px] text-[var(--cl-text-muted)]"
                                >
                                  取消
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
                                title="点击编辑设备名称与面板链接"
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
                                title={`打开 ${d.name} 的 Clash 控制面板`}
                              >
                                管理面板
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 font-mono text-[11px] text-[var(--cl-text-muted)]">
                            <span>Token: {d.token_prefix}••••••••</span>
                            <span>内核: {d.mihomo_version || '-'}</span>
                            <span>Sniffer: {d.sniffer_enabled ? '开启' : '关闭'}</span>
                            <span>最后心跳: {formatRelativeTime(d.last_seen_at)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <div className="mr-1 text-right font-mono tabular-nums">
                            <div className="text-xs font-semibold" style={{ color: 'var(--cl-accent-primary)' }}>
                              今日 {formatBytes(d.today_bytes)}
                            </div>
                            <div className="text-[10px] text-[var(--cl-text-muted)]">
                              代理 {formatBytes(d.today_proxy_bytes)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedCmdId(cmdOpen ? '' : d.id)}
                            className="cl-btn-secondary !h-7 !px-2 !text-[11px]"
                            title="展开一键启动命令模板"
                          >
                            {cmdOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            <Terminal className="h-3 w-3" />
                            启动命令
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(d)}
                            className="rounded-lg border p-1.5 text-[var(--cl-text-muted)] transition hover:border-rose-500/40 hover:text-rose-400"
                            style={{ borderColor: 'var(--cl-border-subtle)' }}
                            title="删除设备"
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
                          <span>{diagAlerts.join('；')}</span>
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
                              服务端仅存储 Token 哈希不保存明文；请将下方占位符替换为创建时保存的密钥（前缀{' '}
                              <code className="font-mono text-[var(--cl-text-primary)]">{d.token_prefix}</code>）：
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
                              {copiedKey === `cmd:${d.id}` ? '已复制模板' : '复制命令模板'}
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
            <h2 className="text-sm font-semibold">机场套餐、节点倍率与域名别名</h2>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">月度套餐总量 (GB, 0=不限)</label>
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
                <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">月度重置日 (1-28)</label>
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
                <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">突发告警阈值 (MB)</label>
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
                <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">分钟明细热层保留 (天)</label>
                <select
                  value={settings.minute_retention_days ?? 7}
                  onChange={(e) => {
                    const m = Number(e.target.value) || 7
                    const h = Math.max(m, settings.hourly_retention_days ?? 30)
                    setSettings({ ...settings, minute_retention_days: m, hourly_retention_days: h })
                  }}
                  className="cl-input w-full font-mono"
                >
                  <option value={3}>3 天（极简占用）</option>
                  <option value={7}>7 天（默认推荐）</option>
                  <option value={14}>14 天</option>
                  <option value={30}>30 天</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">小时明细温层保留（超期自动按天归档）</label>
                <select
                  value={settings.hourly_retention_days ?? 30}
                  onChange={(e) =>
                    setSettings({ ...settings, hourly_retention_days: Number(e.target.value) || 30 })
                  }
                  className="cl-input w-full font-mono"
                >
                  <option value={14}>14 天</option>
                  <option value={30}>30 天（默认推荐）</option>
                  <option value={60}>60 天</option>
                  <option value={90}>90 天</option>
                  <option value={180}>180 天</option>
                </select>
              </div>
            </div>

            {/* Multipliers */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium">节点倍率规则（支持关键字或 * 通配符）</label>
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
                  + 添加规则
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
                      placeholder="节点关键词如 HK-IPLC 或 *2x*"
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
                <label className="text-xs font-medium">自定义域名中文别名</label>
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
                  + 添加别名
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
                      placeholder="主域名如 cdn.example.com"
                      className="cl-input flex-1 font-mono"
                    />
                    <input
                      value={a.label}
                      onChange={(e) => {
                        const next = [...settings.domain_aliases]
                        next[idx] = { ...next[idx], label: e.target.value }
                        setSettings({ ...settings, domain_aliases: next })
                      }}
                      placeholder="显示名称"
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
              {savingSettings ? '保存中...' : '保存配置'}
            </button>
          </form>

          <div className="space-y-4">
            {/* Backup Export / Cross-Machine Import Card */}
            <div className="cl-card space-y-3 rounded-xl p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4" style={{ color: 'var(--cl-accent-primary)' }} />
                <h2 className="text-sm font-semibold">数据备份与迁移（本地 / 跨机合并）</h2>
              </div>
              <p className="text-xs leading-relaxed text-[var(--cl-text-muted)]">
                导出 <code className="font-mono">.json.gz</code> 完整流量备份（不含管理员密码与设备 Token）；导入时按设备与时间桶幂等合并，可安全用于换机迁移或多台本地设备数据汇总，不会重复累计。
              </p>

              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--cl-text-muted)]">
                <input
                  type="checkbox"
                  checked={mergeSettings}
                  onChange={(e) => setMergeSettings(e.target.checked)}
                  className="h-3.5 w-3.5 rounded"
                  style={{ accentColor: 'var(--cl-accent-primary)' }}
                />
                <span>导入时同时覆盖套餐倍率与域名别名设置</span>
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
                  导出备份 (.json.gz)
                </a>
                <button
                  type="button"
                  disabled={importingBackup}
                  onClick={() => importInputRef.current?.click()}
                  className="cl-btn-primary !h-8"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {importingBackup ? '导入合并中...' : '导入并合并备份'}
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
                  <h2 className="text-sm font-semibold">全局隐私脱敏模式（演示模式）</h2>
                  <p className="mt-0.5 text-xs text-[var(--cl-text-muted)]">
                    开启后所有表格、列表、KPI 副标题、桑基图及图表 Tooltip 中的域名与 IP 将自动打码（不影响复制真实规则），配置持久化保存于浏览器本地。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={togglePrivacyMode}
                className={privacyMode ? 'cl-btn-accent !h-8 shrink-0' : 'cl-btn-secondary !h-8 shrink-0'}
              >
                {privacyMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {privacyMode ? '已开启脱敏' : '开启脱敏'}
              </button>
            </div>

            {/* Storage Stats, Lossless Archival & Prune Card */}
            <div className="cl-card space-y-3 rounded-xl p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4" style={{ color: 'var(--cl-accent-primary)' }} />
                  <h2 className="text-sm font-semibold">数据库冷热分级存储与维护</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void loadStorageStats()}
                  disabled={storageLoading}
                  className="cl-btn-secondary !h-6 !px-2 !text-[11px]"
                >
                  {storageLoading ? '统计中...' : '刷新体积'}
                </button>
              </div>

              {storageStats ? (
                <div className="grid grid-cols-2 gap-2.5 font-mono text-xs sm:grid-cols-3">
                  <div
                    className="rounded-lg border p-2.5"
                    style={{ borderColor: 'var(--cl-border-subtle)', backgroundColor: 'var(--cl-bg-sidebar)' }}
                  >
                    <div className="font-sans text-[11px] text-[var(--cl-text-muted)]">数据库总占用</div>
                    <div className="mt-1 text-sm font-bold tabular-nums" style={{ color: 'var(--cl-accent-primary)' }}>
                      {formatBytes(storageStats.total_size_bytes)}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--cl-text-muted)] tabular-nums">
                      主库 {formatBytes(storageStats.db_size_bytes)} · WAL {formatBytes(storageStats.wal_size_bytes)}
                    </div>
                  </div>
                  <div
                    className="rounded-lg border p-2.5"
                    style={{ borderColor: 'var(--cl-border-subtle)', backgroundColor: 'var(--cl-bg-sidebar)' }}
                  >
                    <div className="font-sans text-[11px] text-[var(--cl-text-muted)]">分级记录数</div>
                    <div className="mt-1 text-sm font-bold tabular-nums">
                      {storageStats.minute_flows_rows + storageStats.hourly_flows_rows + storageStats.daily_flows_rows} 行
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--cl-text-muted)] tabular-nums">
                      分钟 {storageStats.minute_flows_rows} · 小时 {storageStats.hourly_flows_rows} · 日归档 {storageStats.daily_flows_rows}
                    </div>
                  </div>
                  <div
                    className="rounded-lg border p-2.5 col-span-2 sm:col-span-1"
                    style={{ borderColor: 'var(--cl-border-subtle)', backgroundColor: 'var(--cl-bg-sidebar)' }}
                  >
                    <div className="font-sans text-[11px] text-[var(--cl-text-muted)]">数据时间跨度</div>
                    <div className="mt-1 truncate text-[11px] font-semibold tabular-nums">
                      {storageStats.oldest_timestamp > 0 ? formatFullTime(storageStats.oldest_timestamp).slice(0, 10) : '-'}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-[var(--cl-text-muted)] tabular-nums">
                      至 {storageStats.newest_timestamp > 0 ? formatFullTime(storageStats.newest_timestamp).slice(0, 10) : '-'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[var(--cl-text-muted)]">正在获取存储占用...</div>
              )}

              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5"
                style={{ borderColor: 'var(--cl-border-subtle)', backgroundColor: 'var(--cl-bg-sidebar)' }}
              >
                <div className="min-w-0 flex-1 text-[11px] text-[var(--cl-text-muted)]">
                  将超过 <span className="font-mono font-semibold text-[var(--cl-text-primary)]">{settings.minute_retention_days ?? 7}</span> 天的分钟明细与超过{' '}
                  <span className="font-mono font-semibold text-[var(--cl-text-primary)]">{settings.hourly_retention_days ?? 30}</span> 天的小时明细无损合并为按天归档（保留 365 天热力图与应用/域名/节点排行）。
                </div>
                <button
                  type="button"
                  data-testid="compact-storage-btn"
                  onClick={() => void handleCompactStorage()}
                  disabled={compacting}
                  className="cl-btn-accent !h-7 shrink-0"
                >
                  <Archive className="h-3 w-3" />
                  {compacting ? '归档压缩中...' : '立即无损归档压缩'}
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
                  <span>仅保留最近</span>
                  <select
                    value={retainDays}
                    onChange={(e) => setRetainDays(Math.max(7, Number(e.target.value) || 30))}
                    className="cl-input !h-7 px-2 font-mono text-xs"
                  >
                    <option value={7}>7 天</option>
                    <option value={14}>14 天</option>
                    <option value={30}>30 天</option>
                    <option value={90}>90 天</option>
                    <option value={180}>180 天</option>
                    <option value={365}>365 天</option>
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
                  <span>保留 365 天热力图与按天汇总</span>
                </label>

                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--cl-text-muted)]">
                  <input
                    type="checkbox"
                    checked={pruneVacuum}
                    onChange={(e) => setPruneVacuum(e.target.checked)}
                    className="h-3.5 w-3.5 rounded"
                    style={{ accentColor: 'var(--cl-accent-primary)' }}
                  />
                  <span>VACUUM 收缩磁盘</span>
                </label>

                <button
                  type="button"
                  onClick={() => setConfirmPruneOpen(true)}
                  disabled={pruning}
                  className="cl-btn-secondary !h-7 hover:border-rose-500/40 hover:text-rose-400"
                >
                  <Trash2 className="h-3 w-3" />
                  清理过期数据
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
                  <h2 className="text-sm font-semibold">修改管理员登录密码</h2>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">原密码</label>
                  <input
                    type="password"
                    value={oldPwd}
                    onChange={(e) => setOldPwd(e.target.value)}
                    className="cl-input w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--cl-text-muted)]">新密码</label>
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
                  更新密码
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Two-step Prune Confirmation Modal */}
      {confirmPruneOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <div className="cl-popover w-full max-w-md rounded-xl border p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--cl-status-warning)' }} />
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">确认清理过期历史流量数据？</h3>
                <p className="text-xs leading-relaxed text-[var(--cl-text-muted)]">
                  即将永久删除 <span className="font-mono font-semibold text-[var(--cl-text-primary)]">{retainDays}</span> 天前的分钟级与小时级明细记录
                  {preserveSummary ? '（保留 365 天热力图与按天归档汇总）' : '，并一并清除每日汇总与按天归档记录'}
                  {pruneVacuum ? '，清理后执行 WAL 截断与 VACUUM 空间压缩' : '，并执行 WAL 截断'}。建议操作前先导出 `.json.gz` 备份。
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
                取消
              </button>
              <button
                type="button"
                disabled={pruning}
                onClick={() => void handleConfirmPrune()}
                className="cl-btn-primary !h-8"
              >
                {pruning ? '清理中...' : '确认永久清理'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
