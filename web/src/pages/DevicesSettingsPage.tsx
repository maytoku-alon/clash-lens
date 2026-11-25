import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Check, Copy, Database, Download, KeyRound, Plus, Save, Trash2, Upload, X } from 'lucide-react'
import { api } from '../api/client'
import type { DeviceInfo, SettingsPayload } from '../types/api'
import { formatBytes, formatRelativeTime } from '../utils/format'

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
  const [subTab, setSubTab] = useState<'devices' | 'settings'>(initialSubTab)

  // Add device form
  const [newName, setNewName] = useState('')
  const [newOS, setNewOS] = useState('windows')
  const [creating, setCreating] = useState(false)
  const [mintedToken, setMintedToken] = useState<{ name: string; os: string; token: string } | null>(null)
  const [copiedKey, setCopiedKey] = useState('')

  // Rename device state
  const [editingId, setEditingId] = useState('')
  const [editingName, setEditingName] = useState('')

  // Settings state
  const [settings, setSettings] = useState<SettingsPayload>({
    monthly_quota_gb: 0,
    reset_day: 1,
    burst_threshold_mb: 200,
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

  useEffect(() => {
    setSubTab(initialSubTab)
  }, [initialSubTab])

  useEffect(() => {
    api
      .getSettings()
      .then((s) => setSettings(s))
      .catch(() => {})
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
    try {
      const res = await api.createDevice(name, newOS)
      setMintedToken({ name: res.device.name, os: res.device.os, token: res.token })
      setNewName('')
      onDevicesChanged()
    } finally {
      setCreating(false)
    }
  }

  const handleRename = async (d: DeviceInfo) => {
    const trimmed = editingName.trim()
    if (!trimmed) return
    await api.updateDevice(d.id, trimmed, d.os, d.icon)
    setEditingId('')
    onDevicesChanged()
  }

  const handleDelete = async (d: DeviceInfo) => {
    if (!window.confirm(`确定删除设备「${d.name}」及其全部历史流量数据吗？`)) return
    await api.deleteDevice(d.id)
    onDevicesChanged()
  }

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault()
    setSavingSettings(true)
    setSettingsNotice('')
    try {
      const saved = await api.saveSettings(settings)
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
      await api.changePassword(oldPwd, newPwd)
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
      const res = await api.importBackup(file, mergeSettings)
      setBackupNotice({
        ok: true,
        text: `合并成功：新增设备 ${res.devices_imported} 台、已有设备 ${res.devices_existing} 台、导入分钟统计 ${res.minute_totals_rows} 条、明细 ${res.minute_flows_rows + res.hourly_flows_rows} 条${res.settings_imported ? '（已同步套餐设置）' : ''}。`,
      })
      onDevicesChanged()
      if (res.settings_imported) {
        api.getSettings().then((s) => setSettings(s)).catch(() => {})
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

  const sampleYAML = mintedToken
    ? `server_url: "${serverOrigin}"\ndevice_token: "${mintedToken.token}"\nclash_endpoint: "auto"\nsanitize_paths: true\nsanitize_mode: "mask"\nflush_interval_sec: 60\nupload_interval_sec: 15\nlive_push_interval_sec: 2`
    : ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="cl-segment">
          <button
            type="button"
            onClick={() => setSubTab('devices')}
            className={`cl-segment-item ${
              subTab === 'devices' ? 'cl-segment-item-active !text-emerald-400' : ''
            }`}
          >
            设备接入管理 ({devices.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('settings')}
            className={`cl-segment-item ${
              subTab === 'settings' ? 'cl-segment-item-active !text-emerald-400' : ''
            }`}
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
            <p className="mt-0.5 text-xs text-[var(--cl-muted)]">
              为每台电脑、笔记本或服务器签发独立 Device Token，多端流量汇总展示。
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="设备名称（如：主力台式机、轻薄笔记本、Linux 服务器）"
                className="cl-input min-w-[240px] flex-1"
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
          </form>

          {/* Newly Minted Token Banner */}
          {mintedToken && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-emerald-400">
                    设备「{mintedToken.name}」创建成功（Token 仅展示这一次）
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--cl-muted)]">
                    请复制以下 `agent.yaml` 配置到本机 `%APPDATA%\ClashLens\agent.yaml`（或与 `clashlens-agent.exe` 同目录）。
                  </p>
                </div>
                <button
                  onClick={() => setMintedToken(null)}
                  className="rounded p-1 text-[var(--cl-muted)] hover:text-[var(--cl-text)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 space-y-2.5">
                <div className="relative rounded-lg border border-white/10 bg-[#09090b] p-3 font-mono text-xs text-zinc-200">
                  <pre className="overflow-x-auto whitespace-pre-wrap pr-44 select-all">{sampleYAML}</pre>
                  <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
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
                      {copiedKey === 'yaml' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      {copiedKey === 'yaml' ? '已复制' : copiedKey === 'yaml:err' ? '复制失败' : '复制 agent.yaml'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#09090b] px-3 py-2 font-mono text-[11px] text-zinc-300">
                  <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap select-all">
                    .\clashlens-agent-windows-amd64.exe --server {serverOrigin} --token {mintedToken.token}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(
                        'cmd',
                        `.\\clashlens-agent-windows-amd64.exe --server ${serverOrigin} --token ${mintedToken.token}`,
                      )
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
            <div className="border-b border-[var(--cl-border)] px-4 py-3">
              <h3 className="text-sm font-semibold">已注册设备列表</h3>
            </div>
            <div className="divide-y divide-[var(--cl-border)]">
              {devices.length === 0 ? (
                <div className="py-10 text-center text-xs text-[var(--cl-muted)]">
                  尚未添加任何设备，请在上方创建首个设备 Token
                </div>
              ) : (
                devices.map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            d.online ? 'bg-emerald-400' : 'bg-zinc-500'
                          }`}
                        />
                        {editingId === d.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="rounded border border-emerald-500 bg-[var(--cl-bg)] px-2 py-0.5 text-xs outline-none"
                            />
                            <button
                              onClick={() => handleRename(d)}
                              className="rounded bg-emerald-500 px-2 py-0.5 text-[11px] font-medium text-zinc-950"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingId('')}
                              className="text-[11px] text-[var(--cl-muted)]"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingId(d.id)
                              setEditingName(d.name)
                            }}
                            className="text-sm font-semibold hover:text-emerald-400"
                            title="点击重命名"
                          >
                            {d.name}
                          </button>
                        )}
                        <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-[var(--cl-muted)]">
                          {d.os}
                        </span>
                        {d.tun_enabled && (
                          <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] text-cyan-400">
                            TUN
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 font-mono text-[11px] text-[var(--cl-muted)]">
                        <span>Token: {d.token_prefix}...</span>
                        <span>内核: {d.mihomo_version || '-'}</span>
                        <span>Sniffer: {d.sniffer_enabled ? '开启' : '关闭'}</span>
                        <span>最后心跳: {formatRelativeTime(d.last_seen_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right font-mono tabular-nums">
                        <div className="text-xs font-semibold text-emerald-400">
                          今日 {formatBytes(d.today_bytes)}
                        </div>
                        <div className="text-[10px] text-[var(--cl-muted)]">
                          代理 {formatBytes(d.today_proxy_bytes)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(d)}
                        className="rounded-lg border border-[var(--cl-border)] p-1.5 text-[var(--cl-muted)] transition hover:border-rose-500/40 hover:text-rose-400"
                        title="删除设备"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
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
                <label className="mb-1 block text-xs text-[var(--cl-muted)]">月度套餐总量 (GB, 0=不限)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={settings.monthly_quota_gb}
                  onChange={(e) =>
                    setSettings({ ...settings, monthly_quota_gb: Number(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg border border-[var(--cl-border)] bg-[var(--cl-bg)] px-3 py-1.5 font-mono text-xs outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--cl-muted)]">月度重置日 (1-28)</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={settings.reset_day}
                  onChange={(e) =>
                    setSettings({ ...settings, reset_day: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })
                  }
                  className="w-full rounded-lg border border-[var(--cl-border)] bg-[var(--cl-bg)] px-3 py-1.5 font-mono text-xs outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--cl-muted)]">突发告警阈值 (MB)</label>
                <input
                  type="number"
                  min="10"
                  value={settings.burst_threshold_mb}
                  onChange={(e) =>
                    setSettings({ ...settings, burst_threshold_mb: Number(e.target.value) || 200 })
                  }
                  className="w-full rounded-lg border border-[var(--cl-border)] bg-[var(--cl-bg)] px-3 py-1.5 font-mono text-xs outline-none focus:border-emerald-500"
                />
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
                  className="text-xs text-emerald-400 hover:underline"
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
                      className="flex-1 rounded-lg border border-[var(--cl-border)] bg-[var(--cl-bg)] px-2.5 py-1.5 font-mono text-xs outline-none"
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
                      className="w-24 rounded-lg border border-[var(--cl-border)] bg-[var(--cl-bg)] px-2.5 py-1.5 font-mono text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          node_multipliers: settings.node_multipliers.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-1 text-[var(--cl-muted)] hover:text-rose-400"
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
                  className="text-xs text-cyan-400 hover:underline"
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
                      className="flex-1 rounded-lg border border-[var(--cl-border)] bg-[var(--cl-bg)] px-2.5 py-1.5 font-mono text-xs outline-none"
                    />
                    <input
                      value={a.label}
                      onChange={(e) => {
                        const next = [...settings.domain_aliases]
                        next[idx] = { ...next[idx], label: e.target.value }
                        setSettings({ ...settings, domain_aliases: next })
                      }}
                      placeholder="显示名称"
                      className="flex-1 rounded-lg border border-[var(--cl-border)] bg-[var(--cl-bg)] px-2.5 py-1.5 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          domain_aliases: settings.domain_aliases.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-1 text-[var(--cl-muted)] hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {settingsNotice && <div className="text-xs text-emerald-400">{settingsNotice}</div>}

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
                <Database className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-semibold">数据备份与迁移（本地 / 跨机合并）</h2>
              </div>
              <p className="text-xs leading-relaxed text-[var(--cl-muted)]">
                导出 <code className="font-mono">.json.gz</code> 完整流量备份（不含管理员密码与设备 Token）；导入时按设备与时间桶幂等合并，可安全用于换机迁移或多台本地设备数据汇总，不会重复累计。
              </p>

              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--cl-muted)]">
                <input
                  type="checkbox"
                  checked={mergeSettings}
                  onChange={(e) => setMergeSettings(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[var(--cl-border)] accent-emerald-500"
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
                  href={api.exportBackupUrl()}
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
                <div className={`text-xs ${backupNotice.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {backupNotice.text}
                </div>
              )}
            </div>

            {/* Security Password Card */}
            {!localMode && (
              <form onSubmit={handleChangePwd} className="cl-card h-fit space-y-3 rounded-xl p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold">修改管理员登录密码</h2>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--cl-muted)]">原密码</label>
                  <input
                    type="password"
                    value={oldPwd}
                    onChange={(e) => setOldPwd(e.target.value)}
                    className="cl-input w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--cl-muted)]">新密码</label>
                  <input
                    type="password"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    className="cl-input w-full"
                  />
                </div>
                {pwdMsg && <div className="text-xs text-emerald-400">{pwdMsg}</div>}
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
    </div>
  )
}
