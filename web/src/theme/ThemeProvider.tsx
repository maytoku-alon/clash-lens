import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { themeRegistry } from './registry'
import type { ColorMode, LayoutPreset, ThemeDefinition, ThemeTokens } from './types'

const STORAGE_THEME_ID = 'clashlens_theme_id'
const STORAGE_COLOR_MODE = 'clashlens_color_mode'
const STORAGE_LAYOUT = 'clashlens_layout'
const STORAGE_PRIVACY_MODE = 'clashlens_privacy_mode'
const LEGACY_COLOR_MODE_KEY = 'clashlens_theme'

interface ThemeContextValue {
  themeId: string
  theme: ThemeDefinition
  colorMode: ColorMode
  isDark: boolean
  layout: LayoutPreset
  privacyMode: boolean
  tokens: ThemeTokens
  availableThemes: ThemeDefinition[]
  setThemeId: (id: string) => void
  setColorMode: (mode: ColorMode) => void
  toggleColorMode: () => void
  setLayout: (layout: LayoutPreset) => void
  setPrivacyMode: (enabled: boolean) => void
  togglePrivacyMode: () => void
}

function readInitialPrivacyMode(): boolean {
  try {
    return localStorage.getItem(STORAGE_PRIVACY_MODE) === 'true'
  } catch {
    return false
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readInitialThemeId(): string {
  try {
    const saved = localStorage.getItem(STORAGE_THEME_ID)
    if (saved && themeRegistry.has(saved)) {
      return saved
    }
  } catch {
    // ignore storage errors
  }
  return themeRegistry.getDefault().id
}

function readInitialColorMode(): ColorMode {
  try {
    const saved = localStorage.getItem(STORAGE_COLOR_MODE)
    if (saved === 'light' || saved === 'dark') {
      return saved
    }
    const legacy = localStorage.getItem(LEGACY_COLOR_MODE_KEY)
    if (legacy === 'light' || legacy === 'dark') {
      localStorage.setItem(STORAGE_COLOR_MODE, legacy)
      return legacy
    }
  } catch {
    // ignore storage errors
  }
  return 'dark'
}

function readInitialLayout(themeId: string): LayoutPreset {
  try {
    const saved = localStorage.getItem(STORAGE_LAYOUT)
    if (saved === 'classic' || saved === 'bento') {
      return saved
    }
  } catch {
    // ignore storage errors
  }
  return themeRegistry.get(themeId).defaultLayout
}

function applyThemeToDOM(theme: ThemeDefinition, mode: ColorMode, layout: LayoutPreset): void {
  const root = document.documentElement
  const tokens = theme.modes[mode]

  root.setAttribute('data-theme', theme.id)
  root.setAttribute('data-mode', mode)
  root.setAttribute('data-layout', layout)
  root.style.colorScheme = mode
  if (mode === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  const vars: Record<string, string> = {
    '--cl-bg-page': tokens.bgPage,
    '--cl-bg-sidebar': tokens.bgSidebar,
    '--cl-bg-surface': tokens.bgSurface,
    '--cl-bg-surface-hover': tokens.bgSurfaceHover,
    '--cl-border-subtle': tokens.borderSubtle,
    '--cl-border-focus': tokens.borderFocus,
    '--cl-text-primary': tokens.textPrimary,
    '--cl-text-secondary': tokens.textSecondary,
    '--cl-text-muted': tokens.textMuted,
    '--cl-accent-primary': tokens.accentPrimary,
    '--cl-accent-soft': tokens.accentSoft,
    '--cl-status-success': tokens.statusSuccess,
    '--cl-status-warning': tokens.statusWarning,
    '--cl-status-danger': tokens.statusDanger,
    '--cl-metric-proxy': tokens.semanticMetrics.proxy,
    '--cl-metric-direct': tokens.semanticMetrics.direct,
    '--cl-metric-reject': tokens.semanticMetrics.reject,
    '--cl-metric-download': tokens.semanticMetrics.download,
    '--cl-metric-upload': tokens.semanticMetrics.upload,
    '--cl-metric-actual': tokens.semanticMetrics.actual,
    '--cl-metric-billed': tokens.semanticMetrics.billed,
    '--cl-font-sans': theme.typography.fontSans,
    '--cl-font-mono': theme.typography.fontMono,
    '--cl-font-size-base': theme.typography.baseSize,
    // Compatibility aliases for existing utility rules and components
    '--cl-bg': tokens.bgPage,
    '--cl-surface': tokens.bgSidebar,
    '--cl-card': tokens.bgSurface,
    '--cl-hover': tokens.bgSurfaceHover,
    '--cl-border': tokens.borderSubtle,
    '--cl-text': tokens.textPrimary,
    '--cl-muted': tokens.textMuted,
  }

  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v)
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(() => readInitialThemeId())
  const [colorMode, setColorModeState] = useState<ColorMode>(() => readInitialColorMode())
  const [layout, setLayoutState] = useState<LayoutPreset>(() => readInitialLayout(themeId))
  const [privacyMode, setPrivacyModeState] = useState<boolean>(() => readInitialPrivacyMode())

  const theme = useMemo(() => themeRegistry.get(themeId), [themeId])
  const tokens = useMemo(() => theme.modes[colorMode], [theme, colorMode])
  const availableThemes = useMemo(() => themeRegistry.list(), [])

  useEffect(() => {
    applyThemeToDOM(theme, colorMode, layout)
    try {
      localStorage.setItem(STORAGE_THEME_ID, theme.id)
      localStorage.setItem(STORAGE_COLOR_MODE, colorMode)
      localStorage.setItem(LEGACY_COLOR_MODE_KEY, colorMode)
      localStorage.setItem(STORAGE_LAYOUT, layout)
    } catch {
      // ignore storage errors
    }
  }, [theme, colorMode, layout])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PRIVACY_MODE, privacyMode ? 'true' : 'false')
    } catch {
      // ignore storage errors
    }
  }, [privacyMode])

  const setThemeId = useCallback((id: string) => {
    if (themeRegistry.has(id)) {
      setThemeIdState(id)
    }
  }, [])

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode)
  }, [])

  const toggleColorMode = useCallback(() => {
    setColorModeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const setLayout = useCallback((nextLayout: LayoutPreset) => {
    setLayoutState(nextLayout)
  }, [])

  const setPrivacyMode = useCallback((enabled: boolean) => {
    setPrivacyModeState(enabled)
  }, [])

  const togglePrivacyMode = useCallback(() => {
    setPrivacyModeState((prev) => !prev)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId: theme.id,
      theme,
      colorMode,
      isDark: colorMode === 'dark',
      layout,
      privacyMode,
      tokens,
      availableThemes,
      setThemeId,
      setColorMode,
      toggleColorMode,
      setLayout,
      setPrivacyMode,
      togglePrivacyMode,
    }),
    [
      theme,
      colorMode,
      layout,
      privacyMode,
      tokens,
      availableThemes,
      setThemeId,
      setColorMode,
      toggleColorMode,
      setLayout,
      setPrivacyMode,
      togglePrivacyMode,
    ],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }
  return ctx
}
