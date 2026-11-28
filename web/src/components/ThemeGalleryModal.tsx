import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Moon, Pin, Sparkles, Sun, X } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useTheme } from '../theme/ThemeProvider'
import type { ColorMode, ThemeDefinition } from '../theme/types'

interface ThemeGalleryModalProps {
  open: boolean
  onClose: () => void
}

function ThemeMiniPreview({ theme, mode }: { theme: ThemeDefinition; mode: ColorMode }) {
  const tk = theme.modes[mode]
  const isAurora = theme.id === 'aurora-mesh'
  const isGraphite = theme.id === 'graphite-monolith'
  const isSentinel = theme.id === 'sentinel-hud'
  const isSwiss = theme.id === 'swiss-poster'
  const isPearl = theme.id === 'liquid-pearl'

  const swissInk = mode === 'dark' ? '#F2EFE6' : '#141414'
  const swissPaper = mode === 'dark' ? '#0C0C0B' : '#F7F5EF'
  const hudBracket = mode === 'dark' ? '#C6F432' : '#11160F'
  const pearlEdge = mode === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.82)'

  const backdropGradient = isAurora
    ? mode === 'dark'
      ? 'radial-gradient(circle at 18% 60%, rgba(34,211,238,0.28), transparent 62%), radial-gradient(circle at 78% 20%, rgba(139,92,246,0.32), transparent 60%), radial-gradient(circle at 82% 85%, rgba(192,132,252,0.20), transparent 55%)'
      : 'radial-gradient(circle at 18% 60%, rgba(14,165,233,0.24), transparent 62%), radial-gradient(circle at 78% 20%, rgba(139,92,246,0.22), transparent 60%), radial-gradient(circle at 82% 85%, rgba(6,182,212,0.18), transparent 55%)'
    : isPearl
      ? mode === 'dark'
        ? 'radial-gradient(circle at 18% 22%, rgba(255,92,147,0.36), transparent 58%), radial-gradient(circle at 80% 18%, rgba(142,107,255,0.34), transparent 56%), radial-gradient(circle at 26% 84%, rgba(255,160,80,0.24), transparent 56%), radial-gradient(circle at 84% 80%, rgba(88,110,255,0.26), transparent 56%)'
        : 'radial-gradient(circle at 18% 22%, rgba(255,184,156,0.78), transparent 58%), radial-gradient(circle at 80% 18%, rgba(190,170,255,0.72), transparent 56%), radial-gradient(circle at 26% 84%, rgba(160,238,214,0.66), transparent 56%), radial-gradient(circle at 84% 80%, rgba(160,208,255,0.72), transparent 56%)'
      : isSentinel
        ? mode === 'dark'
          ? 'radial-gradient(ellipse 60% 50% at 86% 0%, rgba(198,244,50,0.16), transparent 65%), linear-gradient(rgba(198,244,50,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(198,244,50,0.06) 1px, transparent 1px)'
          : 'linear-gradient(rgba(17,22,15,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(17,22,15,0.08) 1px, transparent 1px)'
        : undefined

  const backdropSize = isSentinel ? (mode === 'dark' ? 'auto, 14px 14px, 14px 14px' : '14px 14px, 14px 14px') : undefined

  const navActiveBg = isAurora
    ? mode === 'dark'
      ? 'linear-gradient(90deg, rgba(56,189,248,0.28), rgba(139,92,246,0.28))'
      : 'linear-gradient(90deg, rgba(2,132,199,0.22), rgba(124,58,237,0.20))'
    : isSentinel
      ? mode === 'dark'
        ? '#C6F432'
        : '#11160F'
      : isSwiss
        ? swissInk
        : tk.accentSoft

  const outerRadius = isSwiss ? 0 : isSentinel ? 2 : isPearl ? 12 : 8
  const cardRadius = isSwiss ? 0 : isSentinel ? 2 : isPearl ? 9 : 4
  const pillRadius = isSwiss ? 0 : isSentinel ? 2 : isPearl ? 999 : 3

  const barHeights = [
    [16, 10, 6],
    [24, 14, 8],
    [12, 8, 5],
    [30, 16, 10],
    [20, 12, 7],
    [14, 9, 5],
  ]

  const heatMatrix = [
    [0, 1, 2, 1, 0, 2, 3, 2, 1, 0, 2, 1],
    [1, 2, 3, 2, 1, 0, 1, 4, 3, 2, 1, 2],
    [0, 1, 4, 3, 2, 1, 2, 3, 4, 2, 1, 0],
    [2, 3, 2, 1, 0, 1, 2, 2, 3, 4, 3, 2],
  ]

  return (
    <div
      className="relative flex h-[152px] w-full overflow-hidden border select-none"
      style={{
        borderRadius: outerRadius,
        backgroundColor: tk.bgPage,
        backgroundImage: backdropGradient,
        backgroundSize: backdropSize,
        borderColor: isSwiss ? swissInk : tk.borderSubtle,
      }}
    >
      {/* Mini Sidebar (hidden for floating-Dock Liquid Pearl) */}
      {!isPearl && (
        <div
          className="flex w-[44px] shrink-0 flex-col justify-between p-2"
          style={{
            backgroundColor: tk.bgSidebar,
            borderRight: isSwiss ? `2px solid ${swissInk}` : `1px solid ${tk.borderSubtle}`,
          }}
        >
          <div className="space-y-1.5">
            <div className="mb-2 flex items-center gap-1">
              <span
                className="h-2.5 w-2.5"
                style={{
                  borderRadius: isSwiss ? 0 : isSentinel ? 1 : 4,
                  backgroundColor: tk.accentPrimary,
                  clipPath: isSentinel
                    ? 'polygon(0 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 3px 100%, 0 calc(100% - 3px))'
                    : undefined,
                }}
              />
              <span
                className="h-1.5 w-4 opacity-85"
                style={{ borderRadius: isSwiss ? 0 : 2, backgroundColor: tk.textPrimary }}
              />
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex h-3 items-center px-1"
                style={{
                  borderRadius: isSwiss ? 0 : isSentinel ? 1 : 4,
                  background: i === 0 ? navActiveBg : 'transparent',
                  clipPath:
                    i === 0 && isSentinel
                      ? 'polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)'
                      : undefined,
                  boxShadow:
                    i === 0 && isGraphite ? `inset 2px 0 0 ${tk.accentPrimary}` : undefined,
                  border: i === 0 && isAurora ? `1px solid ${tk.borderFocus}` : undefined,
                }}
              >
                <span
                  className="h-1 w-full"
                  style={{
                    borderRadius: isSwiss ? 0 : 999,
                    backgroundColor:
                      i === 0
                        ? isSentinel
                          ? mode === 'dark'
                            ? '#06080A'
                            : '#C6F432'
                          : isSwiss
                            ? swissPaper
                            : tk.accentPrimary
                        : tk.textMuted,
                    opacity: i === 0 ? 0.95 : 0.4,
                  }}
                />
              </div>
            ))}
          </div>
          <div
            className="h-1 w-5 opacity-35"
            style={{ borderRadius: isSwiss ? 0 : 999, backgroundColor: tk.textMuted }}
          />
        </div>
      )}

      {/* Mini Main Canvas */}
      <div className={`flex min-w-0 flex-1 flex-col gap-1.5 p-2 ${isPearl ? 'pb-5' : ''}`}>
        {/* Mini Topbar */}
        <div
          className="flex h-4 items-center justify-between px-1.5"
          style={{
            borderRadius: isPearl ? 999 : isSwiss ? 0 : cardRadius,
            backgroundColor: isSwiss ? tk.bgPage : tk.bgSidebar,
            border: isPearl ? `1px solid ${pearlEdge}` : `1px solid ${isSwiss ? swissInk : tk.borderSubtle}`,
            borderBottom: isSwiss ? `2px solid ${swissInk}` : undefined,
            boxShadow: isPearl ? '0 4px 12px rgba(40,30,80,0.12)' : undefined,
          }}
        >
          <div className="flex items-center gap-1">
            <span
              className="h-2 w-6"
              style={{
                borderRadius: pillRadius,
                backgroundColor: isSwiss ? swissInk : tk.accentSoft,
                border: `1px solid ${isSwiss ? swissInk : tk.borderFocus}`,
              }}
            />
            <span
              className="h-2 w-4 opacity-50"
              style={{
                borderRadius: pillRadius,
                backgroundColor: tk.bgSurfaceHover,
                border: isSwiss ? `1px solid ${swissInk}` : undefined,
              }}
            />
          </div>
          <div className="flex items-center gap-1">
            <span
              className="h-2 w-5"
              style={{
                borderRadius: pillRadius,
                background: isSwiss ? swissInk : navActiveBg,
                boxShadow: !isSwiss ? `inset 0 0 0 1px ${tk.borderFocus}` : undefined,
              }}
            />
            <span
              className="h-2 w-2"
              style={{
                borderRadius: isSwiss ? 0 : 999,
                backgroundColor: tk.accentPrimary,
              }}
            />
          </div>
        </div>

        {/* Mini KPI Strip */}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { dot: tk.accentPrimary, a: tk.semanticMetrics.proxy, b: tk.semanticMetrics.direct },
            { dot: tk.semanticMetrics.billed, a: tk.semanticMetrics.actual, b: tk.semanticMetrics.billed },
            { dot: tk.semanticMetrics.download, a: tk.semanticMetrics.download, b: tk.semanticMetrics.upload },
          ].map((card, idx) => (
            <div
              key={idx}
              className="border p-1.5"
              style={{
                borderRadius: cardRadius,
                backgroundColor: tk.bgSurface,
                borderColor: isPearl ? pearlEdge : isSentinel && mode === 'light' ? 'rgba(17,22,15,0.26)' : tk.borderSubtle,
                borderTop: isSwiss
                  ? `2.5px solid ${idx === 0 ? tk.accentPrimary : swissInk}`
                  : undefined,
                backgroundImage: isSentinel
                  ? `linear-gradient(${hudBracket}, ${hudBracket}), linear-gradient(${hudBracket}, ${hudBracket}), linear-gradient(${hudBracket}, ${hudBracket}), linear-gradient(${hudBracket}, ${hudBracket}), linear-gradient(${hudBracket}, ${hudBracket}), linear-gradient(${hudBracket}, ${hudBracket}), linear-gradient(${hudBracket}, ${hudBracket}), linear-gradient(${hudBracket}, ${hudBracket})`
                  : undefined,
                backgroundRepeat: isSentinel ? 'no-repeat' : undefined,
                backgroundSize: isSentinel
                  ? '5px 1px, 1px 5px, 5px 1px, 1px 5px, 5px 1px, 1px 5px, 5px 1px, 1px 5px'
                  : undefined,
                backgroundPosition: isSentinel
                  ? '0 0, 0 0, 100% 0, 100% 0, 0 100%, 0 100%, 100% 100%, 100% 100%'
                  : undefined,
                boxShadow: isGraphite
                  ? mode === 'dark'
                    ? 'inset 0 1px 0 rgba(205,220,235,0.08)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.65)'
                  : isPearl
                    ? '0 6px 14px -4px rgba(40,30,80,0.18), inset 0 1px 0 rgba(255,255,255,0.45)'
                    : undefined,
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="h-1 w-5 opacity-50"
                  style={{ borderRadius: isSwiss ? 0 : 999, backgroundColor: tk.textMuted }}
                />
                <span
                  className="h-1.5 w-1.5"
                  style={{ borderRadius: isSwiss ? 0 : 999, backgroundColor: card.dot }}
                />
              </div>
              <div
                className={`mt-1.5 ${isSwiss ? 'h-2.5 w-10' : 'h-2 w-9'}`}
                style={{
                  borderRadius: isSwiss ? 0 : 2,
                  backgroundColor: tk.textPrimary,
                  opacity: isSwiss ? 0.92 : 0.85,
                  boxShadow: isSentinel && mode === 'dark' ? '0 0 8px rgba(198,244,50,0.35)' : undefined,
                }}
              />
              <div
                className="mt-1.5 flex h-1 overflow-hidden"
                style={{
                  borderRadius: isSwiss || isSentinel ? 0 : 999,
                  backgroundColor: tk.borderSubtle,
                }}
              >
                <span
                  className="h-full w-3/5"
                  style={{
                    background: isSentinel
                      ? `repeating-linear-gradient(90deg, ${hudBracket} 0 2px, transparent 2px 3px)`
                      : isPearl
                        ? 'linear-gradient(90deg, #FF8E6B, #FF6B9D)'
                        : card.a,
                  }}
                />
                {!isSentinel && <span className="h-full w-2/5" style={{ backgroundColor: card.b }} />}
              </div>
            </div>
          ))}
        </div>

        {/* Mini Chart + Heatmap Row */}
        <div className="grid min-h-0 flex-1 grid-cols-12 gap-1.5">
          {/* Mini Stacked Bars */}
          <div
            className="col-span-7 flex items-end justify-around border px-1.5 pb-1.5 pt-2"
            style={{
              borderRadius: cardRadius,
              backgroundColor: tk.bgSurface,
              borderColor: isPearl ? pearlEdge : tk.borderSubtle,
              borderTop: isSwiss ? `2.5px solid ${swissInk}` : undefined,
            }}
          >
            {barHeights.map((stack, i) => (
              <div
                key={i}
                className="flex w-2.5 flex-col-reverse gap-[1px] overflow-hidden"
                style={{ borderTopLeftRadius: isSwiss || isSentinel ? 0 : 2, borderTopRightRadius: isSwiss || isSentinel ? 0 : 2 }}
              >
                <span style={{ height: `${stack[0]}px`, backgroundColor: tk.chartPalette[0] }} />
                <span style={{ height: `${stack[1]}px`, backgroundColor: tk.chartPalette[1] }} />
                <span style={{ height: `${stack[2]}px`, backgroundColor: tk.chartPalette[2] }} />
              </div>
            ))}
          </div>

          {/* Mini Heatmap */}
          <div
            className="col-span-5 flex flex-col justify-center gap-[2px] border p-1.5"
            style={{
              borderRadius: cardRadius,
              backgroundColor: tk.bgSurface,
              borderColor: isPearl ? pearlEdge : tk.borderSubtle,
              borderTop: isSwiss ? `2.5px solid ${swissInk}` : undefined,
            }}
          >
            {heatMatrix.map((row, rIdx) => (
              <div key={rIdx} className="grid grid-cols-12 gap-[2px]">
                {row.map((lvl, cIdx) => (
                  <span
                    key={cIdx}
                    className="aspect-square"
                    style={{
                      borderRadius: isSwiss ? 0 : 1,
                      backgroundColor: tk.heatmapScale[lvl],
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mini Floating Bottom Dock for Liquid Pearl */}
      {isPearl && (
        <div
          className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 px-2.5 py-1"
          style={{
            borderRadius: 999,
            backgroundColor: mode === 'dark' ? 'rgba(34,27,44,0.88)' : 'rgba(255,255,255,0.86)',
            border: `1px solid ${pearlEdge}`,
            boxShadow: '0 6px 16px -4px rgba(40,30,80,0.35), inset 0 1px 0 rgba(255,255,255,0.4)',
          }}
        >
          <span
            className="h-2.5 w-2.5"
            style={{
              borderRadius: 4,
              backgroundImage: 'linear-gradient(135deg, #FF8E6B, #E0408C 55%, #8E6BFF)',
            }}
          />
          <span className="h-3 w-[1px] opacity-25" style={{ backgroundColor: tk.textMuted }} />
          {[0, 1, 2, 3, 4].map((idx) => (
            <div key={idx} className="relative flex items-center justify-center">
              <span
                className="h-2.5 w-2.5"
                style={{
                  borderRadius: 4,
                  backgroundColor: idx === 0 ? tk.accentSoft : 'transparent',
                  border: idx === 0 ? `1px solid ${tk.borderFocus}` : undefined,
                }}
              />
              {idx === 0 && (
                <span
                  className="absolute -bottom-[3px] h-[2px] w-[2px]"
                  style={{ borderRadius: 999, backgroundColor: tk.accentPrimary }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ThemeGalleryModal({ open, onClose }: ThemeGalleryModalProps) {
  const { themeId, colorMode, availableThemes, setThemeId, isThemePinned, togglePinnedTheme } = useTheme()
  const { m } = useI18n()
  const [previewMode, setPreviewMode] = useState<ColorMode>(colorMode)

  useEffect(() => {
    if (open) {
      setPreviewMode(colorMode)
    }
  }, [open, colorMode])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const modal = (
    <div
      data-testid="theme-gallery-modal"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="cl-popover flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl">
        {/* Modal Header */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--cl-border-subtle)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg border"
              style={{
                backgroundColor: 'var(--cl-accent-soft)',
                borderColor: 'var(--cl-border-focus)',
                color: 'var(--cl-accent-primary)',
              }}
            >
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">{m.appearance.galleryTitle}</h2>
              <p className="text-xs text-[var(--cl-text-muted)]">{m.appearance.gallerySubtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="cl-segment">
              <button
                type="button"
                data-testid="gallery-preview-dark"
                onClick={() => setPreviewMode('dark')}
                className={`cl-segment-item ${previewMode === 'dark' ? 'cl-segment-item-active' : ''}`}
              >
                <Moon className="h-3 w-3" />
                {m.appearance.previewDark}
              </button>
              <button
                type="button"
                data-testid="gallery-preview-light"
                onClick={() => setPreviewMode('light')}
                className={`cl-segment-item ${previewMode === 'light' ? 'cl-segment-item-active' : ''}`}
              >
                <Sun className="h-3 w-3" />
                {m.appearance.previewLight}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="cl-icon-btn"
              aria-label={m.common.close}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Theme Grid */}
        <div className="cl-thin-scroll flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            {availableThemes.map((t) => {
              const active = t.id === themeId
              const pinned = isThemePinned(t.id)
              const localized = m.appearance.themes[t.id]
              return (
                <div
                  key={t.id}
                  data-testid={`gallery-theme-card-${t.id}`}
                  className="flex flex-col justify-between gap-3 rounded-xl border p-3.5 transition"
                  style={{
                    borderColor: active ? 'var(--cl-border-focus)' : 'var(--cl-border-subtle)',
                    backgroundColor: active ? 'var(--cl-accent-soft)' : 'var(--cl-bg-sidebar)',
                  }}
                >
                  <div className="space-y-2.5">
                    <ThemeMiniPreview theme={t} mode={previewMode} />

                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="truncate text-sm font-semibold"
                            style={{ color: active ? 'var(--cl-accent-primary)' : 'var(--cl-text-primary)' }}
                          >
                            {localized?.name ?? t.name}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 font-mono text-[10px] uppercase text-[var(--cl-text-muted)]"
                            style={{ backgroundColor: 'var(--cl-bg-surface)' }}
                          >
                            {t.defaultLayout}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--cl-text-muted)]">
                          {localized?.description ?? t.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      data-testid={`pin-theme-${t.id}`}
                      onClick={() => togglePinnedTheme(t.id)}
                      className={pinned ? 'cl-btn-accent !h-7 !px-2.5 !text-[11px]' : 'cl-btn-secondary !h-7 !px-2.5 !text-[11px]'}
                    >
                      <Pin className="h-3 w-3" />
                      {pinned ? m.appearance.pinned : m.appearance.pinQuick}
                    </button>

                    <button
                      type="button"
                      data-testid={`apply-theme-${t.id}`}
                      onClick={() => setThemeId(t.id)}
                      className={active ? 'cl-btn-secondary !h-7 !px-3 !text-[11px]' : 'cl-btn-primary !h-7 !px-3 !text-[11px]'}
                    >
                      {active && <Check className="h-3 w-3" style={{ color: 'var(--cl-accent-primary)' }} />}
                      {active ? m.appearance.inUse : m.appearance.applyTheme}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className="flex items-center justify-between border-t px-5 py-3 text-xs text-[var(--cl-text-muted)]"
          style={{ borderColor: 'var(--cl-border-subtle)' }}
        >
          <span>{m.appearance.pinnedCountHint}</span>
          <button type="button" onClick={onClose} className="cl-btn-secondary !h-7 !px-3 !text-[11px]">
            {m.common.close}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
