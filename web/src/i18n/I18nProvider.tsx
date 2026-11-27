import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cachedGetJSON } from '../api/http'
import type { DiagnosticWarning } from '../types/api'
import { enMessages } from './en'
import type { Language, ServiceCatalog, TranslationMessages } from './types'
import { zhMessages } from './zh'

const LANG_STORAGE_KEY = 'clashlens_lang'

interface I18nContextValue {
  lang: Language
  setLang: (lang: Language) => void
  toggleLang: () => void
  m: TranslationMessages
  ensureCatalogLoaded: () => void
  resolveServiceTag: (existingTag?: string | null, rootDomain?: string | null, host?: string | null) => string
  resolveProcessName: (processDisplay?: string | null, processName?: string | null) => string
  translateWarning: (w: DiagnosticWarning) => { title: string; message: string }
}

const I18nContext = createContext<I18nContextValue | null>(null)

function readInitialLang(): Language {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY)
    if (saved === 'en') return 'en'
    if (saved === 'zh') return 'zh'
  } catch {
    // ignore storage errors
  }
  return 'zh'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(readInitialLang)
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null)
  const catalogFetchStartedRef = useRef(false)

  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'
  }, [lang])

  const setLang = useCallback((next: Language) => {
    setLangState(next)
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next)
    } catch {
      // ignore storage errors
    }
  }, [])

  const toggleLang = useCallback(() => {
    setLang(lang === 'zh' ? 'en' : 'zh')
  }, [lang, setLang])

  const ensureCatalogLoaded = useCallback(() => {
    if (catalogFetchStartedRef.current) return
    catalogFetchStartedRef.current = true
    cachedGetJSON<ServiceCatalog>('/api/v1/catalog', { ttlMs: 300_000 })
      .then((res) => {
        setCatalog(res)
      })
      .catch(() => {
        catalogFetchStartedRef.current = false
      })
  }, [])

  const reverseLookups = useMemo(() => {
    const procZhToEn = new Map<string, string>()
    const procKeyToEntry = new Map<string, { zh: string; en: string }>()
    if (catalog?.process_aliases) {
      for (const [key, entry] of Object.entries(catalog.process_aliases)) {
        procKeyToEntry.set(key.toLowerCase(), entry)
        if (entry.zh && entry.en) {
          procZhToEn.set(entry.zh, entry.en)
        }
      }
    }
    return { procZhToEn, procKeyToEntry }
  }, [catalog])

  const messages = lang === 'en' ? enMessages : zhMessages

  const resolveServiceTag = useCallback(
    (existingTag?: string | null, rootDomain?: string | null, host?: string | null): string => {
      const existing = (existingTag ?? '').trim()
      const cleanHost = (host ?? '').trim().toLowerCase()
      const cleanRoot = (rootDomain ?? '').trim().toLowerCase()

      const entry =
        (cleanHost && catalog?.exact_hosts?.[cleanHost]) ||
        (cleanRoot && catalog?.root_domains?.[cleanRoot]) ||
        null

      if (lang === 'en') {
        if (entry) {
          // Preserve custom user domain aliases (where existing differs from built-in zh label)
          if (!existing || existing === entry.zh || existing === entry.en) {
            return entry.en
          }
        }
        return existing
      }

      if (existing) return existing
      return entry?.zh ?? ''
    },
    [catalog, lang],
  )

  const resolveProcessName = useCallback(
    (processDisplay?: string | null, processName?: string | null): string => {
      const disp = (processDisplay ?? '').trim()
      const raw = (processName ?? '').trim().toLowerCase()
      const rawNoExe = raw.endsWith('.exe') ? raw.slice(0, -4) : raw

      if (lang === 'en') {
        if (disp === '未知进程' || disp === 'unknown') {
          return enMessages.common.unknownProcess
        }
        if (disp === '其他') {
          return enMessages.common.other
        }
        if (disp === '其他网站') {
          return 'Other Domains'
        }
        const byKey =
          (raw && reverseLookups.procKeyToEntry.get(raw)) ||
          (rawNoExe && reverseLookups.procKeyToEntry.get(rawNoExe))
        if (byKey && (!disp || disp === byKey.zh || disp === byKey.en)) {
          return byKey.en
        }
        if (disp && reverseLookups.procZhToEn.has(disp)) {
          return reverseLookups.procZhToEn.get(disp) || disp
        }
        return disp || (processName ?? '').trim() || enMessages.common.unknownProcess
      }

      if (disp) return disp
      const byKey =
        (raw ? reverseLookups.procKeyToEntry.get(raw) : undefined) ||
        (rawNoExe ? reverseLookups.procKeyToEntry.get(rawNoExe) : undefined)
      return byKey?.zh || (processName ?? '').trim() || zhMessages.common.unknownProcess
    },
    [lang, reverseLookups],
  )

  const translateWarning = useCallback(
    (w: DiagnosticWarning): { title: string; message: string } => {
      if (lang === 'en' && w.code === 'TUN_SNIFFER_OFF') {
        return {
          title: enMessages.overview.tunSnifferTitle,
          message: enMessages.overview.tunSnifferMessage(w.device_name || w.device_id),
        }
      }
      return { title: w.title, message: w.message }
    },
    [lang],
  )

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      toggleLang,
      m: messages,
      ensureCatalogLoaded,
      resolveServiceTag,
      resolveProcessName,
      translateWarning,
    }),
    [lang, setLang, toggleLang, messages, ensureCatalogLoaded, resolveServiceTag, resolveProcessName, translateWarning],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return ctx
}
