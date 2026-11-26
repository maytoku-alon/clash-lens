import { useEffect, useRef, useState } from 'react'
import { Check, EyeOff, LayoutGrid, Palette, Rows3 } from 'lucide-react'
import { useTheme } from '../theme/ThemeProvider'

export function AppearancePopover() {
  const { themeId, availableThemes, setThemeId, layout, setLayout, privacyMode, togglePrivacyMode } = useTheme()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`cl-icon-btn ${open ? 'border-[var(--cl-border-focus)] text-[var(--cl-accent-primary)]' : ''}`}
        title="外观主题与布局"
        aria-expanded={open}
      >
        <Palette className="h-3.5 w-3.5" strokeWidth={1.6} />
      </button>

      {open && (
        <div className="cl-popover absolute right-0 top-9 z-40 w-72 rounded-xl border p-3 shadow-xl">
          <div className="mb-2 text-[11px] font-semibold tracking-tight text-[var(--cl-text-muted)]">
            主题风格
          </div>
          <div className="space-y-1">
            {availableThemes.map((t) => {
              const active = t.id === themeId
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setThemeId(t.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition"
                  style={{
                    borderColor: active ? 'var(--cl-border-focus)' : 'transparent',
                    backgroundColor: active ? 'var(--cl-accent-soft)' : 'transparent',
                  }}
                >
                  <div className="min-w-0">
                    <div
                      className="text-xs font-medium"
                      style={{ color: active ? 'var(--cl-accent-primary)' : 'var(--cl-text-primary)' }}
                    >
                      {t.name}
                    </div>
                    <div className="truncate text-[10px] text-[var(--cl-text-muted)]">{t.description}</div>
                  </div>
                  {active && (
                    <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--cl-accent-primary)' }} />
                  )}
                </button>
              )
            })}
          </div>

          <div
            className="my-2.5 border-t"
            style={{ borderColor: 'var(--cl-border-subtle)' }}
          />

          <div className="mb-1.5 text-[11px] font-semibold tracking-tight text-[var(--cl-text-muted)]">
            总览大屏布局
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setLayout('classic')}
              className="flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1.5 text-[11px] font-medium transition"
              style={{
                borderColor: layout === 'classic' ? 'var(--cl-border-focus)' : 'var(--cl-border-subtle)',
                backgroundColor: layout === 'classic' ? 'var(--cl-accent-soft)' : 'var(--cl-bg-sidebar)',
                color: layout === 'classic' ? 'var(--cl-accent-primary)' : 'var(--cl-text-muted)',
              }}
            >
              <Rows3 className="h-3 w-3" />
              经典布局
            </button>
            <button
              type="button"
              onClick={() => setLayout('bento')}
              className="flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1.5 text-[11px] font-medium transition"
              style={{
                borderColor: layout === 'bento' ? 'var(--cl-border-focus)' : 'var(--cl-border-subtle)',
                backgroundColor: layout === 'bento' ? 'var(--cl-accent-soft)' : 'var(--cl-bg-sidebar)',
                color: layout === 'bento' ? 'var(--cl-accent-primary)' : 'var(--cl-text-muted)',
              }}
            >
              <LayoutGrid className="h-3 w-3" />
              Bento 宽屏
            </button>
          </div>

          <div
            className="my-2.5 border-t"
            style={{ borderColor: 'var(--cl-border-subtle)' }}
          />

          <button
            type="button"
            onClick={togglePrivacyMode}
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition"
            style={{
              borderColor: privacyMode ? 'var(--cl-border-focus)' : 'var(--cl-border-subtle)',
              backgroundColor: privacyMode ? 'var(--cl-accent-soft)' : 'var(--cl-bg-sidebar)',
            }}
          >
            <div className="flex items-center gap-2">
              <EyeOff
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: privacyMode ? 'var(--cl-accent-primary)' : 'var(--cl-text-muted)' }}
              />
              <div>
                <div
                  className="text-[11px] font-medium"
                  style={{ color: privacyMode ? 'var(--cl-accent-primary)' : 'var(--cl-text-primary)' }}
                >
                  隐私脱敏模式
                </div>
                <div className="text-[10px] text-[var(--cl-text-muted)]">演示时隐藏域名与 IP 明文</div>
              </div>
            </div>
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
              style={{
                backgroundColor: privacyMode ? 'var(--cl-accent-primary)' : 'var(--cl-border-subtle)',
                color: privacyMode ? '#ffffff' : 'var(--cl-text-muted)',
              }}
            >
              {privacyMode ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
