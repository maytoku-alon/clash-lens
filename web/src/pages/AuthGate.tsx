import { useState, type FormEvent } from 'react'
import { Activity, ArrowRight, Lock } from 'lucide-react'
import { authApi } from '../api/authApi'

interface AuthGateProps {
  initialized: boolean
  onAuthenticated: () => void
}

export function AuthGate({ initialized, onAuthenticated }: AuthGateProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 4) {
      setError('密码长度至少需要 4 位')
      return
    }
    if (!initialized && password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    try {
      if (initialized) {
        await authApi.login(password)
      } else {
        await authApi.setup(password)
      }
      onAuthenticated()
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        backgroundColor: 'var(--cl-bg-page)',
        color: 'var(--cl-text-primary)',
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-7 shadow-2xl"
        style={{
          backgroundColor: 'var(--cl-bg-surface)',
          borderColor: 'var(--cl-border-subtle)',
        }}
      >
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl border"
            style={{
              backgroundColor: 'var(--cl-accent-soft)',
              borderColor: 'var(--cl-border-focus)',
              color: 'var(--cl-accent-primary)',
            }}
          >
            <Activity className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">ClashLens</h1>
            <p className="text-xs text-[var(--cl-text-muted)]">多设备 Clash 流量透视与分析大屏</p>
          </div>
        </div>

        <div className="mb-5">
          <h2 className="text-base font-semibold">
            {initialized ? '登录管理大屏' : '初始化管理员密码'}
          </h2>
          <p className="mt-1 text-xs text-[var(--cl-text-muted)]">
            {initialized
              ? '输入管理员密码以查看设备流量详情与配置。'
              : '首次启动，请设置 ClashLens Web 控制台登录密码。'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--cl-text-secondary)]">
              管理员密码
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cl-text-muted)]" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 4 位字符"
                autoFocus
                className="cl-input !h-10 w-full !rounded-xl pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          {!initialized && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--cl-text-secondary)]">
                确认密码
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cl-text-muted)]" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再次输入密码"
                  className="cl-input !h-10 w-full !rounded-xl pl-9 pr-3 text-sm"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="cl-btn-primary !h-9 w-full !rounded-lg text-[13px]"
          >
            <span>{loading ? '处理中...' : initialized ? '进入大屏' : '完成初始化并进入'}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  )
}
