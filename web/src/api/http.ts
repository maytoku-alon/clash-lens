export const DEFAULT_CACHE_TTL_MS = 15_000

export interface FetchOptions {
  force?: boolean
  ttlMs?: number
}

interface CacheEntry<T> {
  expiresAt: number
  value?: T
  inFlight?: Promise<T>
}

const getCache = new Map<string, CacheEntry<unknown>>()

export function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') {
      u.set(k, String(v))
    }
  }
  return u.toString()
}

export async function reqJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  })
  const text = await res.text()
  let parsed: Record<string, unknown> = {}
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = {}
    }
  }
  if (!res.ok) {
    const msg = typeof parsed.error === 'string' ? parsed.error : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return parsed as unknown as T
}

export async function cachedGetJSON<T>(url: string, opts?: FetchOptions): Promise<T> {
  const ttlMs = opts?.ttlMs ?? DEFAULT_CACHE_TTL_MS
  const force = Boolean(opts?.force)
  const now = Date.now()
  const existing = getCache.get(url) as CacheEntry<T> | undefined

  if (!force && existing) {
    if (existing.inFlight) {
      return existing.inFlight
    }
    if (existing.value !== undefined && existing.expiresAt > now) {
      return existing.value
    }
  }

  const inFlight = reqJSON<T>(url)
    .then((data) => {
      getCache.set(url, {
        value: data,
        expiresAt: Date.now() + ttlMs,
      })
      return data
    })
    .catch((err) => {
      if (getCache.get(url)?.inFlight === inFlight) {
        getCache.delete(url)
      }
      throw err
    })

  getCache.set(url, {
    value: existing?.value,
    expiresAt: existing?.expiresAt ?? 0,
    inFlight,
  })

  return inFlight
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    getCache.clear()
    return
  }
  for (const key of getCache.keys()) {
    if (key.startsWith(prefix)) {
      getCache.delete(key)
    }
  }
}
