import { useState, type FormEvent } from 'react'
import { Activity, ArrowRight, Languages, Lock } from 'lucide-react'
import { authApi } from '../api/authApi'
import { useI18n } from '../i18n/I18nProvider'

interface AuthGateProps {
  initialized: boolean
  onAuthenticated: () => void
}

export function AuthGate({ initialized, onAuthenticated }: AuthGateProps) {
  const { m, toggleLang } = useI18n()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 4) {
      setError(m.auth.errMinLength)
      return
    }
    if (!initialized && password !== confirm) {
      setError(m.auth.errMismatch)
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
      setError(err instanceof Error ? err.message : m.auth.errLoginFailed)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        color: 'var(--cl-text-primary)',
      }}
    >
      <div className="cl-card w-full max-w-md rounded-2xl p-7 shadow-2xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
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
              <p className="text-xs text-[var(--cl-text-muted)]">{m.auth.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleLang}
            className="cl-btn-secondary !h-7 shrink-0 !px-2 !text-[11px]"
            title={m.topbar.toggleLangTitle}
          >
            <Languages className="h-3.5 w-3.5" />
            <span className="font-mono">{m.topbar.langShort}</span>
          </button>
        </div>

        <div className="mb-5">
          <h2 className="text-base font-semibold">
            {initialized ? m.auth.loginTitle : m.auth.setupTitle}
          </h2>
          <p className="mt-1 text-xs text-[var(--cl-text-muted)]">
            {initialized ? m.auth.loginDesc : m.auth.setupDesc}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--cl-text-secondary)]">
              {m.auth.passwordLabel}
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cl-text-muted)]" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={m.auth.passwordPlaceholder}
                autoFocus
                className="cl-input !h-10 w-full !rounded-xl pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          {!initialized && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--cl-text-secondary)]">
                {m.auth.confirmLabel}
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cl-text-muted)]" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={m.auth.confirmPlaceholder}
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
            <span>
              {loading
                ? m.auth.submitting
                : initialized
                  ? m.auth.enterDashboard
                  : m.auth.completeSetup}
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  )
}
