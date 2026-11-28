import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, EyeOff, Languages, LayoutGrid, Palette, Rows3, Sparkles } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useTheme } from '../theme/ThemeProvider'
import { ThemeGalleryModal } from './ThemeGalleryModal'

export function AppearancePopover() {
  const {
    themeId,
    availableThemes,
    pinnedThemeIds,
    setThemeId,
    layout,
    setLayout,
    privacyMode,
    togglePrivacyMode,
  } = useTheme()
  const { lang, setLang, m } = useI18n()
  const [open, setOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const quickThemes = useMemo(
    () => availableThemes.filter((t) => pinnedThemeIds.includes(t.id) || t.id === themeId),
    [availableThemes, pinnedThemeIds, themeId],
  )

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
        title={m.appearance.buttonTitle}
        aria-expanded={open}
      >
        <Palette className="h-3.5 w-3.5" strokeWidth={1.6} />
      </button>

      {open && (
        <div className="cl-popover cl-thin-scroll absolute right-0 top-9 z-40 max-h-[calc(100vh-56px)] w-72 overflow-y-auto rounded-xl border p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-tight text-[var(--cl-text-muted)]">
            <span>{m.appearance.themeStyle}</span>
            <span className="font-mono text-[10px] opacity-80">
              {quickThemes.length}/{availableThemes.length}
            </span>
          </div>
          <div className="space-y-1">
            {quickThemes.map((t) => {
              const active = t.id === themeId
              const localized = m.appearance.themes[t.id]
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
                      {localized?.name ?? t.name}
                    </div>
                    <div className="truncate text-[10px] text-[var(--cl-text-muted)]">
                      {localized?.description ?? t.description}
                    </div>
                  </div>
                  {active && (
                    <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--cl-accent-primary)' }} />
                  )}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            data-testid="open-theme-gallery-btn"
            onClick={() => {
              setOpen(false)
              setGalleryOpen(true)
            }}
            className="cl-btn-secondary mt-2 !h-7 w-full justify-between !px-2.5 !text-[11px]"
          >
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" style={{ color: 'var(--cl-accent-primary)' }} />
              {m.appearance.openGallery}
            </span>
            <span className="font-mono text-[10px] text-[var(--cl-text-muted)]">
              {availableThemes.length}
            </span>
          </button>

          <div
            className="my-2.5 border-t"
            style={{ borderColor: 'var(--cl-border-subtle)' }}
          />

          <div className="mb-1.5 text-[11px] font-semibold tracking-tight text-[var(--cl-text-muted)]">
            {m.appearance.overviewLayout}
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
              {m.appearance.classicLayout}
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
              {m.appearance.bentoLayout}
            </button>
          </div>

          <div
            className="my-2.5 border-t"
            style={{ borderColor: 'var(--cl-border-subtle)' }}
          />

          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-tight text-[var(--cl-text-muted)]">
            <Languages className="h-3 w-3" />
            {m.appearance.languageSection}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setLang('zh')}
              className="flex cursor-pointer items-center justify-center rounded-md border px-2 py-1.5 text-[11px] font-medium transition"
              style={{
                borderColor: lang === 'zh' ? 'var(--cl-border-focus)' : 'var(--cl-border-subtle)',
                backgroundColor: lang === 'zh' ? 'var(--cl-accent-soft)' : 'var(--cl-bg-sidebar)',
                color: lang === 'zh' ? 'var(--cl-accent-primary)' : 'var(--cl-text-muted)',
              }}
            >
              {m.appearance.langZh}
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className="flex cursor-pointer items-center justify-center rounded-md border px-2 py-1.5 text-[11px] font-medium transition"
              style={{
                borderColor: lang === 'en' ? 'var(--cl-border-focus)' : 'var(--cl-border-subtle)',
                backgroundColor: lang === 'en' ? 'var(--cl-accent-soft)' : 'var(--cl-bg-sidebar)',
                color: lang === 'en' ? 'var(--cl-accent-primary)' : 'var(--cl-text-muted)',
              }}
            >
              {m.appearance.langEn}
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
                  {m.appearance.privacyMode}
                </div>
                <div className="text-[10px] text-[var(--cl-text-muted)]">{m.appearance.privacyDesc}</div>
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

      <ThemeGalleryModal open={galleryOpen} onClose={() => setGalleryOpen(false)} />
    </div>
  )
}
