export type ClashRuleFormat = 'yaml' | 'verge-js'

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
const IPV4_ANY_RE = /\b((?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))(\/\d{1,2})?\b/g
const IPV6_TOKEN_RE = /([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(\/\d{1,3})?/g
const DOMAIN_INLINE_RE = /\b([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,24}\b/g

export function isIPv4(raw: string): boolean {
  return IPV4_RE.test(raw.trim())
}

export function isIPv6(raw: string): boolean {
  const s = raw.trim().replace(/^\[|\]$/g, '')
  if (!s.includes(':')) return false
  return /^[0-9a-fA-F:]+$/.test(s) && s.split(':').length >= 3
}

export function stripPortAndBrackets(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (s.startsWith('[')) {
    const end = s.indexOf(']')
    if (end > 0) return s.slice(1, end)
  }
  const colonIdx = s.lastIndexOf(':')
  if (colonIdx > 0 && s.indexOf(':') === colonIdx) {
    const portPart = s.slice(colonIdx + 1)
    if (/^\d+$/.test(portPart)) {
      return s.slice(0, colonIdx)
    }
  }
  return s
}

export function maskIp(ip: string): string {
  const cleaned = stripPortAndBrackets(ip)
  if (isIPv4(cleaned)) {
    const parts = cleaned.split('.')
    return `${parts[0]}.${parts[1]}.*.*`
  }
  if (isIPv6(cleaned)) {
    const parts = cleaned.split(':').filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}:*:*`
    }
    return '****:*:*'
  }
  return ip
}

export function maskDomain(domain: string): string {
  const trimmed = stripPortAndBrackets(domain)
  if (!trimmed || trimmed === '*' || !trimmed.includes('.')) {
    return trimmed
  }
  if (isIPv4(trimmed) || isIPv6(trimmed)) {
    return maskIp(trimmed)
  }
  const parts = trimmed.split('.')
  if (parts.length < 2) return trimmed
  const tld = parts[parts.length - 1]
  const label = parts[parts.length - 2]
  const maskedLabel =
    label.length <= 2 ? `${label[0] ?? '*'}*` : `${label[0]}***${label[label.length - 1]}`
  if (parts.length === 2) {
    return `${maskedLabel}.${tld}`
  }
  return `*.${maskedLabel}.${tld}`
}

export function maskHostOrDomain(value: string, enabled: boolean): string {
  if (!enabled || !value) return value
  const s = value.trim()
  if (!s || s === '*' || s === 'DIRECT' || s === 'REJECT' || s === '其他') {
    return value
  }
  if (isIPv4(s) || isIPv6(s)) {
    return maskIp(s)
  }
  if (s.includes('.')) {
    return maskDomain(s)
  }
  return value
}

export function maskRuleText(rule: string, enabled: boolean): string {
  if (!enabled || !rule) return rule
  let out = rule.replace(IPV4_ANY_RE, (_m, ip: string, cidr?: string) => `${maskIp(ip)}${cidr ?? ''}`)
  out = out.replace(IPV6_TOKEN_RE, (m) => {
    const [addr, cidr] = m.split('/')
    return isIPv6(addr) ? `${maskIp(addr)}${cidr ? `/${cidr}` : ''}` : m
  })
  out = out.replace(DOMAIN_INLINE_RE, (dom) => maskDomain(dom))
  return out
}

export function isMatchFallbackRule(rule?: string): boolean {
  if (!rule) return false
  return /^MATCH\b/i.test(rule.trim())
}

export function formatRuleExpr(target: string, action = 'DIRECT'): string {
  const host = stripPortAndBrackets(target)
  if (!host || host === '*') return `MATCH,${action}`
  if (isIPv4(host)) {
    return `IP-CIDR,${host}/32,${action},no-resolve`
  }
  if (isIPv6(host)) {
    return `IP-CIDR6,${host}/128,${action},no-resolve`
  }
  return `DOMAIN,${host},${action}`
}

export function formatClashRule(target: string, format: ClashRuleFormat, action = 'DIRECT'): string {
  const expr = formatRuleExpr(target, action)
  return format === 'verge-js' ? `"${expr}",` : `- ${expr}`
}
