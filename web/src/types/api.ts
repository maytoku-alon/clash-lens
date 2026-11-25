export type RouteType = 'PROXY' | 'DIRECT' | 'REJECT'
export type InboundMode = 'TUN' | 'PROXY_PORT' | 'INNER'
export type TrafficScope = 'all' | 'proxy' | 'direct'
export type RangePreset = '1h' | '24h' | '7d' | '30d' | '90d' | '1y'
export type GroupByDim = 'process' | 'domain' | 'device' | 'node' | 'direction'

export interface AuthStatusResponse {
  initialized: boolean
  authenticated: boolean
  local_mode?: boolean
  version: string
}

export interface BackupImportResult {
  ok: boolean
  devices_imported: number
  devices_existing: number
  minute_totals_rows: number
  minute_flows_rows: number
  hourly_flows_rows: number
  daily_summary_rows: number
  settings_imported: boolean
}

export interface DeviceInfo {
  id: string
  name: string
  os: string
  icon: string
  token_prefix: string
  created_at: number
  last_seen_at: number
  online: boolean
  mihomo_version: string
  tun_enabled: boolean
  sniffer_enabled: boolean
  find_process_mode: string
  inbound_mode: string
  live_up_bps: number
  live_down_bps: number
  live_conns: number
  today_bytes: number
  today_proxy_bytes: number
  dashboard_url?: string
}

export interface CreateDeviceResponse {
  device: DeviceInfo
  token: string
}

export interface NodeMultiplierRule {
  pattern: string
  multiplier: number
}

export interface DomainAliasRule {
  domain: string
  label: string
}

export interface SettingsPayload {
  monthly_quota_gb: number
  reset_day: number
  burst_threshold_mb: number
  node_multipliers: NodeMultiplierRule[]
  domain_aliases: DomainAliasRule[]
}

export interface DiagnosticWarning {
  code: string
  device_id: string
  device_name: string
  title: string
  message: string
}

export interface TopConsumerSummary {
  process_display: string
  root_domain: string
  service_tag?: string
  total_bytes: number
  proxy_bytes: number
  direct_bytes: number
}

export interface QuotaSummary {
  enabled: boolean
  monthly_quota_gb: number
  reset_day: number
  raw_proxy_bytes: number
  billed_bytes: number
  used_percent: number
  projected_gb: number
  days_remaining: number
  cycle_start_label: string
  cycle_end_label: string
}

export interface OverviewResponse {
  range_bytes: number
  range_proxy_bytes: number
  range_direct_bytes: number
  range_up_bytes: number
  range_down_bytes: number
  range_tun_bytes: number
  today_bytes: number
  today_proxy_bytes: number
  today_direct_bytes: number
  yesterday_bytes: number
  today_delta_pct: number
  month_bytes: number
  month_proxy_bytes: number
  month_direct_bytes: number
  all_time_bytes: number
  online_devices: number
  total_devices: number
  top_consumer?: TopConsumerSummary
  quota: QuotaSummary
  warnings: DiagnosticWarning[]
}

export interface HeatmapDay {
  date: string
  total_bytes: number
  proxy_bytes: number
  direct_bytes: number
  up_bytes: number
  down_bytes: number
  conn_count: number
}

export interface HeatmapResponse {
  days: HeatmapDay[]
  total_bytes: number
  active_days: number
  current_streak: number
  longest_streak: number
  peak_day: string
  peak_bytes: number
  daily_avg_bytes: number
}

export interface TimeseriesSeries {
  name: string
  label?: string
  total: number
  values: number[]
}

export interface TimeseriesResponse {
  interval: 'minute' | 'hour' | 'day'
  group_by: string
  timestamps: number[]
  series: TimeseriesSeries[]
  total_bytes: number
}

export interface BurstEvent {
  bucket_ts: number
  granularity: 'minute' | 'hour'
  device_id: string
  device_name: string
  process_display: string
  root_domain: string
  service_tag?: string
  egress_node: string
  route_type: RouteType
  inbound_mode: InboundMode
  up_bytes: number
  down_bytes: number
  total_bytes: number
}

export interface BurstsResponse {
  items: BurstEvent[]
}

export interface AppDomainBrief {
  root_domain: string
  service_tag?: string
  total_bytes: number
}

export interface AppSummaryItem {
  process_display: string
  process_name: string
  total_bytes: number
  proxy_bytes: number
  direct_bytes: number
  reject_bytes: number
  up_bytes: number
  down_bytes: number
  tun_bytes: number
  proxy_port_bytes: number
  conn_count: number
  domain_count: number
  share_pct: number
  top_domains: AppDomainBrief[]
}

export interface AppsListResponse {
  total_bytes: number
  items: AppSummaryItem[]
}

export interface SankeyNode {
  name: string
  stage: 'app' | 'domain' | 'egress'
}

export interface SankeyLink {
  source: string
  target: string
  value: number
}

export interface SubdomainFlowRow {
  host: string
  egress_node: string
  proxy_group: string
  route_type: RouteType
  inbound_mode: InboundMode
  rule: string
  up_bytes: number
  down_bytes: number
  total_bytes: number
  conn_count: number
}

export interface AppRootDomainGroup {
  root_domain: string
  service_tag?: string
  total_bytes: number
  proxy_bytes: number
  direct_bytes: number
  up_bytes: number
  down_bytes: number
  tun_bytes: number
  conn_count: number
  share_pct: number
  subdomains: SubdomainFlowRow[]
}

export interface AppDetailResponse {
  process_display: string
  summary: AppSummaryItem
  timeline: TimeseriesResponse
  sankey: {
    nodes: SankeyNode[]
    links: SankeyLink[]
  }
  root_domains: AppRootDomainGroup[]
}

export interface DomainAppBrief {
  process_display: string
  total_bytes: number
}

export interface DomainSummaryItem {
  root_domain: string
  service_tag?: string
  total_bytes: number
  proxy_bytes: number
  direct_bytes: number
  up_bytes: number
  down_bytes: number
  tun_bytes: number
  conn_count: number
  app_count: number
  share_pct: number
  top_apps: DomainAppBrief[]
}

export interface DomainsListResponse {
  total_bytes: number
  items: DomainSummaryItem[]
}

export interface DomainAppRow {
  process_display: string
  total_bytes: number
  proxy_bytes: number
  direct_bytes: number
  up_bytes: number
  down_bytes: number
  tun_bytes: number
  conn_count: number
  share_pct: number
  subdomains: SubdomainFlowRow[]
}

export interface DomainDetailResponse {
  root_domain: string
  service_tag?: string
  summary: DomainSummaryItem
  timeline: TimeseriesResponse
  apps: DomainAppRow[]
}

export interface RouteSplitItem {
  route_type: RouteType
  total_bytes: number
  up_bytes: number
  down_bytes: number
  share_pct: number
}

export interface NodeUsageItem {
  egress_node: string
  proxy_group: string
  route_type: RouteType
  multiplier: number
  raw_bytes: number
  billed_bytes: number
  up_bytes: number
  down_bytes: number
  conn_count: number
  share_pct: number
}

export interface RuleUsageItem {
  rule: string
  route_type: RouteType
  total_bytes: number
  conn_count: number
  share_pct: number
}

export interface ProxyAuditItem {
  process_display: string
  root_domain: string
  service_tag?: string
  rule: string
  egress_node: string
  total_bytes: number
  billed_bytes: number
  inbound_mode: InboundMode
}

export interface NodesAnalyticsResponse {
  total_bytes: number
  route_split: RouteSplitItem[]
  nodes: NodeUsageItem[]
  rules: RuleUsageItem[]
  proxy_audit: ProxyAuditItem[]
  quota: QuotaSummary
}

export interface LiveConnectionItem {
  device_id?: string
  device_name?: string
  process_display: string
  root_domain: string
  service_tag?: string
  host: string
  egress_node: string
  route_type: RouteType
  inbound_mode: InboundMode
  rule?: string
  up_bps: number
  down_bps: number
  total_bytes: number
}

export interface LiveDeviceSnapshot {
  device_id: string
  device_name: string
  os: string
  icon: string
  online: boolean
  last_seen_at: number
  up_bps: number
  down_bps: number
  proxy_up_bps: number
  proxy_down_bps: number
  direct_up_bps: number
  direct_down_bps: number
  active_conns: number
  tun_enabled: boolean
  sniffer_enabled: boolean
  find_process_mode: string
  inbound_mode: string
  mihomo_version: string
  dashboard_url?: string
}

export interface LiveHubSnapshot {
  timestamp: number
  total_up_bps: number
  total_down_bps: number
  proxy_up_bps: number
  proxy_down_bps: number
  direct_up_bps: number
  direct_down_bps: number
  active_conns: number
  online_devices: number
  devices: LiveDeviceSnapshot[]
  top_active: LiveConnectionItem[]
}
