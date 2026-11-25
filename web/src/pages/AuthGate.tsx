import { useState, type FormEvent } from 'react'
import { Activity, ArrowRight, Lock } from 'lucide-react'
import { api } from '../api/client'

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
        await api.authLogin(password)
      } else {
        await api.authSetup(password)
      }
      onAuthenticated()
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b] p-4 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141419] p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-zinc-950">
            <Activity className="h-5 w-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">ClashLens</h1>
            <p className="text-xs text-zinc-400">多设备 Clash 流量透视与分析大屏</p>
          </div>
        </div>

        <div className="mb-5">
          <h2 className="text-base font-semibold">
            {initialized ? '登录管理大屏' : '初始化管理员密码'}
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            {initialized
              ? '输入管理员密码以查看设备流量详情与配置。'
              : '首次启动，请设置 ClashLens Web 控制台登录密码。'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-300">管理员密码</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 4 位字符"
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-[#09090b] py-2.5 pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-500"
              />
            </div>
          </div>

          {!initialized && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">确认密码</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再次输入密码"
                  className="w-full rounded-xl border border-white/10 bg-[#09090b] py-2.5 pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-500"
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
            className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 text-[13px] font-medium tracking-[-0.01em] text-zinc-950 shadow-sm transition hover:bg-white disabled:opacity-50"
          >
            <span>{loading ? '处理中...' : initialized ? '进入大屏' : '完成初始化并进入'}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  )
}
