package protocol

// Route type constants for connection egress classification.
const (
	RouteProxy  = "PROXY"
	RouteDirect = "DIRECT"
	RouteReject = "REJECT"
)

// Inbound mode constants for connection ingress classification.
const (
	InboundTUN       = "TUN"
	InboundProxyPort = "PROXY_PORT"
	InboundInner     = "INNER"
)

// DeviceRuntimeMeta captures current Mihomo configuration and runtime traits reported by an agent.
type DeviceRuntimeMeta struct {
	MihomoVersion   string `json:"mihomo_version"`
	OS              string `json:"os"`
	TunEnabled      bool   `json:"tun_enabled"`
	SnifferEnabled  bool   `json:"sniffer_enabled"`
	FindProcessMode string `json:"find_process_mode"`
	Mode            string `json:"mode"`
	InboundMode     string `json:"inbound_mode"`
}

// MinuteTotalRecord tracks aggregate per-minute byte totals including unattributed short-connection gaps.
type MinuteTotalRecord struct {
	BucketTS         int64 `json:"bucket_ts"`
	ProxyUp          int64 `json:"proxy_up"`
	ProxyDown        int64 `json:"proxy_down"`
	DirectUp         int64 `json:"direct_up"`
	DirectDown       int64 `json:"direct_down"`
	RejectBytes      int64 `json:"reject_bytes"`
	UnattributedUp   int64 `json:"unattributed_up"`
	UnattributedDown int64 `json:"unattributed_down"`
	ConnCount        int64 `json:"conn_count"`
	TunBytes         int64 `json:"tun_bytes"`
	ProxyPortBytes   int64 `json:"proxy_port_bytes"`
}

// FlowRecord represents aggregated traffic for one (bucket, process, root_domain, host, egress, route, inbound) tuple.
type FlowRecord struct {
	BucketTS       int64  `json:"bucket_ts"`
	ProcessName    string `json:"process_name"`
	ProcessPath    string `json:"process_path,omitempty"`
	ProcessDisplay string `json:"process_display"`
	RootDomain     string `json:"root_domain"`
	ServiceTag     string `json:"service_tag,omitempty"`
	Host           string `json:"host"`
	EgressNode     string `json:"egress_node"`
	ProxyGroup     string `json:"proxy_group"`
	RouteType      string `json:"route_type"`
	InboundMode    string `json:"inbound_mode"`
	Rule           string `json:"rule,omitempty"`
	UpBytes        int64  `json:"up_bytes"`
	DownBytes      int64  `json:"down_bytes"`
	ConnCount      int64  `json:"conn_count"`
}

// IngestBatchRequest is sent by an agent to upload finalized minute and hourly buckets idempotently.
type IngestBatchRequest struct {
	BatchID      string              `json:"batch_id"`
	DeviceMeta   DeviceRuntimeMeta   `json:"device_meta"`
	MinuteTotals []MinuteTotalRecord `json:"minute_totals"`
	MinuteFlows  []FlowRecord        `json:"minute_flows"`
	HourlyFlows  []FlowRecord        `json:"hourly_flows"`
}

// IngestBatchResponse acknowledges batch receipt or duplicate skip.
type IngestBatchResponse struct {
	OK         bool  `json:"ok"`
	Duplicate  bool  `json:"duplicate,omitempty"`
	ReceivedAt int64 `json:"received_at"`
}

// LiveConnectionItem represents one currently active high-throughput connection on a device.
type LiveConnectionItem struct {
	DeviceID       string `json:"device_id,omitempty"`
	DeviceName     string `json:"device_name,omitempty"`
	ProcessDisplay string `json:"process_display"`
	RootDomain     string `json:"root_domain"`
	ServiceTag     string `json:"service_tag,omitempty"`
	Host           string `json:"host"`
	EgressNode     string `json:"egress_node"`
	RouteType      string `json:"route_type"`
	InboundMode    string `json:"inbound_mode"`
	Rule           string `json:"rule,omitempty"`
	UpBps          int64  `json:"up_bps"`
	DownBps        int64  `json:"down_bps"`
	TotalBytes     int64  `json:"total_bytes"`
}

// LivePushRequest is pushed every ~2s by an agent for real-time dashboard rate display.
type LivePushRequest struct {
	Timestamp    int64                `json:"timestamp"`
	UpBps        int64                `json:"up_bps"`
	DownBps      int64                `json:"down_bps"`
	ProxyUpBps   int64                `json:"proxy_up_bps"`
	ProxyDownBps int64                `json:"proxy_down_bps"`
	DirectUpBps  int64                `json:"direct_up_bps"`
	DirectDownBps int64               `json:"direct_down_bps"`
	ActiveConns  int                  `json:"active_conns"`
	DeviceMeta   DeviceRuntimeMeta    `json:"device_meta"`
	TopActive    []LiveConnectionItem `json:"top_active"`
}

// AuthStatusResponse reports server initialization and current login state.
type AuthStatusResponse struct {
	Initialized   bool   `json:"initialized"`
	Authenticated bool   `json:"authenticated"`
	LocalMode     bool   `json:"local_mode,omitempty"`
	Version       string `json:"version"`
}

// DeviceInfo describes a registered monitoring device and its latest status.
type DeviceInfo struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	OS              string `json:"os"`
	Icon            string `json:"icon"`
	TokenPrefix     string `json:"token_prefix"`
	CreatedAt       int64  `json:"created_at"`
	LastSeenAt      int64  `json:"last_seen_at"`
	Online          bool   `json:"online"`
	MihomoVersion   string `json:"mihomo_version"`
	TunEnabled      bool   `json:"tun_enabled"`
	SnifferEnabled  bool   `json:"sniffer_enabled"`
	FindProcessMode string `json:"find_process_mode"`
	InboundMode     string `json:"inbound_mode"`
	LiveUpBps       int64  `json:"live_up_bps"`
	LiveDownBps     int64  `json:"live_down_bps"`
	LiveConns       int    `json:"live_conns"`
	TodayBytes      int64  `json:"today_bytes"`
	TodayProxyBytes int64  `json:"today_proxy_bytes"`
}

// CreateDeviceRequest creates a new monitoring device.
type CreateDeviceRequest struct {
	Name string `json:"name"`
	OS   string `json:"os"`
	Icon string `json:"icon"`
}

// CreateDeviceResponse returns the created device and its one-time plaintext token.
type CreateDeviceResponse struct {
	Device DeviceInfo `json:"device"`
	Token  string     `json:"token"`
}

// UpdateDeviceRequest updates device display metadata.
type UpdateDeviceRequest struct {
	Name string `json:"name"`
	OS   string `json:"os"`
	Icon string `json:"icon"`
}

// NodeMultiplierRule assigns a billing multiplier to matching egress node names.
type NodeMultiplierRule struct {
	Pattern    string  `json:"pattern"`
	Multiplier float64 `json:"multiplier"`
}

// DomainAliasRule maps a root domain to a user-defined friendly label.
type DomainAliasRule struct {
	Domain string `json:"domain"`
	Label  string `json:"label"`
}

// SettingsPayload stores user-configurable quota, multiplier, alias, and burst alert settings.
type SettingsPayload struct {
	MonthlyQuotaGB   float64              `json:"monthly_quota_gb"`
	ResetDay         int                  `json:"reset_day"`
	BurstThresholdMB int64                `json:"burst_threshold_mb"`
	NodeMultipliers  []NodeMultiplierRule `json:"node_multipliers"`
	DomainAliases    []DomainAliasRule    `json:"domain_aliases"`
}

// DiagnosticWarning highlights environment traits such as TUN enabled without domain sniffing.
type DiagnosticWarning struct {
	Code       string `json:"code"`
	DeviceID   string `json:"device_id"`
	DeviceName string `json:"device_name"`
	Title      string `json:"title"`
	Message    string `json:"message"`
}

// TopConsumerSummary summarizes the top traffic-consuming (process, root_domain) pair.
type TopConsumerSummary struct {
	ProcessDisplay string `json:"process_display"`
	RootDomain     string `json:"root_domain"`
	ServiceTag     string `json:"service_tag,omitempty"`
	TotalBytes     int64  `json:"total_bytes"`
	ProxyBytes     int64  `json:"proxy_bytes"`
	DirectBytes    int64  `json:"direct_bytes"`
}

// QuotaSummary reports monthly proxy traffic vs configured quota and multiplier billing.
type QuotaSummary struct {
	Enabled         bool    `json:"enabled"`
	MonthlyQuotaGB  float64 `json:"monthly_quota_gb"`
	ResetDay        int     `json:"reset_day"`
	RawProxyBytes   int64   `json:"raw_proxy_bytes"`
	BilledBytes     int64   `json:"billed_bytes"`
	UsedPercent     float64 `json:"used_percent"`
	ProjectedGB     float64 `json:"projected_gb"`
	DaysRemaining   int     `json:"days_remaining"`
	CycleStartLabel string  `json:"cycle_start_label"`
	CycleEndLabel   string  `json:"cycle_end_label"`
}

// OverviewResponse provides top-level KPI metrics for the dashboard Overview page.
type OverviewResponse struct {
	RangeBytes       int64               `json:"range_bytes"`
	RangeProxyBytes  int64               `json:"range_proxy_bytes"`
	RangeDirectBytes int64               `json:"range_direct_bytes"`
	RangeUpBytes     int64               `json:"range_up_bytes"`
	RangeDownBytes   int64               `json:"range_down_bytes"`
	RangeTunBytes    int64               `json:"range_tun_bytes"`
	TodayBytes       int64               `json:"today_bytes"`
	TodayProxyBytes  int64               `json:"today_proxy_bytes"`
	TodayDirectBytes int64               `json:"today_direct_bytes"`
	YesterdayBytes   int64               `json:"yesterday_bytes"`
	TodayDeltaPct    float64             `json:"today_delta_pct"`
	MonthBytes       int64               `json:"month_bytes"`
	MonthProxyBytes  int64               `json:"month_proxy_bytes"`
	MonthDirectBytes int64               `json:"month_direct_bytes"`
	AllTimeBytes     int64               `json:"all_time_bytes"`
	OnlineDevices    int                 `json:"online_devices"`
	TotalDevices     int                 `json:"total_devices"`
	TopConsumer      *TopConsumerSummary `json:"top_consumer,omitempty"`
	Quota            QuotaSummary        `json:"quota"`
	Warnings         []DiagnosticWarning `json:"warnings"`
}

// HeatmapDay represents one calendar cell in the 365-day traffic heatmap.
type HeatmapDay struct {
	Date        string `json:"date"`
	TotalBytes  int64  `json:"total_bytes"`
	ProxyBytes  int64  `json:"proxy_bytes"`
	DirectBytes int64  `json:"direct_bytes"`
	UpBytes     int64  `json:"up_bytes"`
	DownBytes   int64  `json:"down_bytes"`
	ConnCount   int64  `json:"conn_count"`
}

// HeatmapResponse returns 365 days of daily usage plus streak/peak summary stats.
type HeatmapResponse struct {
	Days          []HeatmapDay `json:"days"`
	TotalBytes    int64        `json:"total_bytes"`
	ActiveDays    int          `json:"active_days"`
	CurrentStreak int          `json:"current_streak"`
	LongestStreak int          `json:"longest_streak"`
	PeakDay       string       `json:"peak_day"`
	PeakBytes     int64        `json:"peak_bytes"`
	DailyAvgBytes int64        `json:"daily_avg_bytes"`
}

// TimeseriesSeries is a single named line/stack series aligned with TimeseriesResponse.Timestamps.
type TimeseriesSeries struct {
	Name   string  `json:"name"`
	Label  string  `json:"label,omitempty"`
	Total  int64   `json:"total"`
	Values []int64 `json:"values"`
}

// TimeseriesResponse returns multi-series stacked time buckets.
type TimeseriesResponse struct {
	Interval   string             `json:"interval"` // minute | hour | day
	GroupBy    string             `json:"group_by"` // process | domain | device | node | direction
	Timestamps []int64            `json:"timestamps"`
	Series     []TimeseriesSeries `json:"series"`
	TotalBytes int64              `json:"total_bytes"`
}

// BurstEvent represents a high-consumption (time bucket, app, domain) spike for quick root-cause inspection.
type BurstEvent struct {
	BucketTS       int64  `json:"bucket_ts"`
	Granularity    string `json:"granularity"` // minute | hour
	DeviceID       string `json:"device_id"`
	DeviceName     string `json:"device_name"`
	ProcessDisplay string `json:"process_display"`
	RootDomain     string `json:"root_domain"`
	ServiceTag     string `json:"service_tag,omitempty"`
	EgressNode     string `json:"egress_node"`
	RouteType      string `json:"route_type"`
	InboundMode    string `json:"inbound_mode"`
	UpBytes        int64  `json:"up_bytes"`
	DownBytes      int64  `json:"down_bytes"`
	TotalBytes     int64  `json:"total_bytes"`
}

// BurstsResponse lists top high-consumption spikes within the selected range.
type BurstsResponse struct {
	Items []BurstEvent `json:"items"`
}

// AppDomainBrief previews the top domains accessed by a process.
type AppDomainBrief struct {
	RootDomain string `json:"root_domain"`
	ServiceTag string `json:"service_tag,omitempty"`
	TotalBytes int64  `json:"total_bytes"`
}

// AppSummaryItem summarizes traffic for one application process.
type AppSummaryItem struct {
	ProcessDisplay string           `json:"process_display"`
	ProcessName    string           `json:"process_name"`
	TotalBytes     int64            `json:"total_bytes"`
	ProxyBytes     int64            `json:"proxy_bytes"`
	DirectBytes    int64            `json:"direct_bytes"`
	RejectBytes    int64            `json:"reject_bytes"`
	UpBytes        int64            `json:"up_bytes"`
	DownBytes      int64            `json:"down_bytes"`
	TunBytes       int64            `json:"tun_bytes"`
	ProxyPortBytes int64            `json:"proxy_port_bytes"`
	ConnCount      int64            `json:"conn_count"`
	DomainCount    int              `json:"domain_count"`
	SharePct       float64          `json:"share_pct"`
	TopDomains     []AppDomainBrief `json:"top_domains"`
}

// AppsListResponse returns ranked processes and aggregate totals.
type AppsListResponse struct {
	TotalBytes int64            `json:"total_bytes"`
	Items      []AppSummaryItem `json:"items"`
}

// SankeyNode defines a node in the App -> RootDomain -> EgressNode Sankey graph.
type SankeyNode struct {
	Name  string `json:"name"`
	Stage string `json:"stage"` // app | domain | egress
}

// SankeyLink defines a weighted flow edge in the Sankey graph.
type SankeyLink struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Value  int64  `json:"value"`
}

// SankeyGraph contains nodes and links for ECharts Sankey visualization.
type SankeyGraph struct {
	Nodes []SankeyNode `json:"nodes"`
	Links []SankeyLink `json:"links"`
}

// SubdomainFlowRow details an exact host/egress/inbound/rule flow inside a root domain.
type SubdomainFlowRow struct {
	Host        string `json:"host"`
	EgressNode  string `json:"egress_node"`
	ProxyGroup  string `json:"proxy_group"`
	RouteType   string `json:"route_type"`
	InboundMode string `json:"inbound_mode"`
	Rule        string `json:"rule"`
	UpBytes     int64  `json:"up_bytes"`
	DownBytes   int64  `json:"down_bytes"`
	TotalBytes  int64  `json:"total_bytes"`
	ConnCount   int64  `json:"conn_count"`
}

// AppRootDomainGroup aggregates flows under a root domain with expandable exact subdomain rows.
type AppRootDomainGroup struct {
	RootDomain  string             `json:"root_domain"`
	ServiceTag  string             `json:"service_tag,omitempty"`
	TotalBytes  int64              `json:"total_bytes"`
	ProxyBytes  int64              `json:"proxy_bytes"`
	DirectBytes int64              `json:"direct_bytes"`
	UpBytes     int64              `json:"up_bytes"`
	DownBytes   int64              `json:"down_bytes"`
	TunBytes    int64              `json:"tun_bytes"`
	ConnCount   int64              `json:"conn_count"`
	SharePct    float64            `json:"share_pct"`
	Subdomains  []SubdomainFlowRow `json:"subdomains"`
}

// AppDetailResponse answers "what websites did this app access and how much did each consume".
type AppDetailResponse struct {
	ProcessDisplay string               `json:"process_display"`
	Summary        AppSummaryItem       `json:"summary"`
	Timeline       TimeseriesResponse   `json:"timeline"`
	Sankey         SankeyGraph          `json:"sankey"`
	RootDomains    []AppRootDomainGroup `json:"root_domains"`
}

// DomainAppBrief previews top processes accessing a root domain.
type DomainAppBrief struct {
	ProcessDisplay string `json:"process_display"`
	TotalBytes     int64  `json:"total_bytes"`
}

// DomainSummaryItem summarizes traffic for one root domain across processes/devices.
type DomainSummaryItem struct {
	RootDomain  string           `json:"root_domain"`
	ServiceTag  string           `json:"service_tag,omitempty"`
	TotalBytes  int64            `json:"total_bytes"`
	ProxyBytes  int64            `json:"proxy_bytes"`
	DirectBytes int64            `json:"direct_bytes"`
	UpBytes     int64            `json:"up_bytes"`
	DownBytes   int64            `json:"down_bytes"`
	TunBytes    int64            `json:"tun_bytes"`
	ConnCount   int64            `json:"conn_count"`
	AppCount    int              `json:"app_count"`
	SharePct    float64          `json:"share_pct"`
	TopApps     []DomainAppBrief `json:"top_apps"`
}

// DomainsListResponse returns ranked root domains.
type DomainsListResponse struct {
	TotalBytes int64               `json:"total_bytes"`
	Items      []DomainSummaryItem `json:"items"`
}

// DomainAppRow details one process accessing the selected domain.
type DomainAppRow struct {
	ProcessDisplay string             `json:"process_display"`
	TotalBytes     int64              `json:"total_bytes"`
	ProxyBytes     int64              `json:"proxy_bytes"`
	DirectBytes    int64              `json:"direct_bytes"`
	UpBytes        int64              `json:"up_bytes"`
	DownBytes      int64              `json:"down_bytes"`
	TunBytes       int64              `json:"tun_bytes"`
	ConnCount      int64              `json:"conn_count"`
	SharePct       float64            `json:"share_pct"`
	Subdomains     []SubdomainFlowRow `json:"subdomains"`
}

// DomainDetailResponse answers "which apps and devices accessed this root domain".
type DomainDetailResponse struct {
	RootDomain string             `json:"root_domain"`
	ServiceTag string             `json:"service_tag,omitempty"`
	Summary    DomainSummaryItem  `json:"summary"`
	Timeline   TimeseriesResponse `json:"timeline"`
	Apps       []DomainAppRow     `json:"apps"`
}

// RouteSplitItem summarizes PROXY / DIRECT / REJECT totals.
type RouteSplitItem struct {
	RouteType  string  `json:"route_type"`
	TotalBytes int64   `json:"total_bytes"`
	UpBytes    int64   `json:"up_bytes"`
	DownBytes  int64   `json:"down_bytes"`
	SharePct   float64 `json:"share_pct"`
}

// NodeUsageItem reports raw and multiplier-adjusted bytes for an egress node.
type NodeUsageItem struct {
	EgressNode  string  `json:"egress_node"`
	ProxyGroup  string  `json:"proxy_group"`
	RouteType   string  `json:"route_type"`
	Multiplier  float64 `json:"multiplier"`
	RawBytes    int64   `json:"raw_bytes"`
	BilledBytes int64   `json:"billed_bytes"`
	UpBytes     int64   `json:"up_bytes"`
	DownBytes   int64   `json:"down_bytes"`
	ConnCount   int64   `json:"conn_count"`
	SharePct    float64 `json:"share_pct"`
}

// RuleUsageItem reports traffic matched by a Mihomo rule.
type RuleUsageItem struct {
	Rule       string  `json:"rule"`
	RouteType  string  `json:"route_type"`
	TotalBytes int64   `json:"total_bytes"`
	ConnCount  int64   `json:"conn_count"`
	SharePct   float64 `json:"share_pct"`
}

// ProxyAuditItem highlights high-volume flows routed through PROXY to help catch rule misrouting.
type ProxyAuditItem struct {
	ProcessDisplay string `json:"process_display"`
	RootDomain     string `json:"root_domain"`
	ServiceTag     string `json:"service_tag,omitempty"`
	Rule           string `json:"rule"`
	EgressNode     string `json:"egress_node"`
	TotalBytes     int64  `json:"total_bytes"`
	BilledBytes    int64  `json:"billed_bytes"`
	InboundMode    string `json:"inbound_mode"`
}

// NodesAnalyticsResponse aggregates route splits, node usages, rules, quota, and proxy audit findings.
type NodesAnalyticsResponse struct {
	TotalBytes int64            `json:"total_bytes"`
	RouteSplit []RouteSplitItem `json:"route_split"`
	Nodes      []NodeUsageItem  `json:"nodes"`
	Rules      []RuleUsageItem  `json:"rules"`
	ProxyAudit []ProxyAuditItem `json:"proxy_audit"`
	Quota      QuotaSummary     `json:"quota"`
}

// LiveDeviceSnapshot represents one device's real-time state inside the WebSocket live stream.
type LiveDeviceSnapshot struct {
	DeviceID        string `json:"device_id"`
	DeviceName      string `json:"device_name"`
	OS              string `json:"os"`
	Icon            string `json:"icon"`
	Online          bool   `json:"online"`
	LastSeenAt      int64  `json:"last_seen_at"`
	UpBps           int64  `json:"up_bps"`
	DownBps         int64  `json:"down_bps"`
	ProxyUpBps      int64  `json:"proxy_up_bps"`
	ProxyDownBps    int64  `json:"proxy_down_bps"`
	DirectUpBps     int64  `json:"direct_up_bps"`
	DirectDownBps   int64  `json:"direct_down_bps"`
	ActiveConns     int    `json:"active_conns"`
	TunEnabled      bool   `json:"tun_enabled"`
	SnifferEnabled  bool   `json:"sniffer_enabled"`
	FindProcessMode string `json:"find_process_mode"`
	InboundMode     string `json:"inbound_mode"`
	MihomoVersion   string `json:"mihomo_version"`
}

// LiveHubSnapshot is broadcast every ~2s over /api/v1/ws/live to dashboard UI clients.
type LiveHubSnapshot struct {
	Timestamp     int64                `json:"timestamp"`
	TotalUpBps    int64                `json:"total_up_bps"`
	TotalDownBps  int64                `json:"total_down_bps"`
	ProxyUpBps    int64                `json:"proxy_up_bps"`
	ProxyDownBps  int64                `json:"proxy_down_bps"`
	DirectUpBps   int64                `json:"direct_up_bps"`
	DirectDownBps int64                `json:"direct_down_bps"`
	ActiveConns   int                  `json:"active_conns"`
	OnlineDevices int                  `json:"online_devices"`
	Devices       []LiveDeviceSnapshot `json:"devices"`
	TopActive     []LiveConnectionItem `json:"top_active"`
}

// BackupDeviceRecord stores portable device metadata without sensitive authentication hashes.
type BackupDeviceRecord struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	OS              string `json:"os"`
	Icon            string `json:"icon"`
	CreatedAt       int64  `json:"created_at"`
	LastSeenAt      int64  `json:"last_seen_at"`
	MihomoVersion   string `json:"mihomo_version,omitempty"`
	TunEnabled      bool   `json:"tun_enabled"`
	SnifferEnabled  bool   `json:"sniffer_enabled"`
	FindProcessMode string `json:"find_process_mode,omitempty"`
	InboundMode     string `json:"inbound_mode,omitempty"`
}

// BackupMinuteTotalRow stores one minute total row scoped to a device ID for export/import.
type BackupMinuteTotalRow struct {
	DeviceID         string `json:"device_id"`
	BucketTS         int64  `json:"bucket_ts"`
	ProxyUp          int64  `json:"proxy_up"`
	ProxyDown        int64  `json:"proxy_down"`
	DirectUp         int64  `json:"direct_up"`
	DirectDown       int64  `json:"direct_down"`
	RejectBytes      int64  `json:"reject_bytes"`
	UnattributedUp   int64  `json:"unattributed_up"`
	UnattributedDown int64  `json:"unattributed_down"`
	ConnCount        int64  `json:"conn_count"`
	TunBytes         int64  `json:"tun_bytes"`
	ProxyPortBytes   int64  `json:"proxy_port_bytes"`
}

// BackupFlowRow stores one minute or hourly flow attribution row scoped to a device ID.
type BackupFlowRow struct {
	DeviceID       string `json:"device_id"`
	BucketTS       int64  `json:"bucket_ts"`
	ProcessName    string `json:"process_name"`
	ProcessDisplay string `json:"process_display"`
	RootDomain     string `json:"root_domain"`
	ServiceTag     string `json:"service_tag,omitempty"`
	Host           string `json:"host"`
	EgressNode     string `json:"egress_node"`
	ProxyGroup     string `json:"proxy_group"`
	RouteType      string `json:"route_type"`
	InboundMode    string `json:"inbound_mode"`
	Rule           string `json:"rule,omitempty"`
	UpBytes        int64  `json:"up_bytes"`
	DownBytes      int64  `json:"down_bytes"`
	ConnCount      int64  `json:"conn_count"`
}

// BackupDailySummaryRow stores one daily roll-up row scoped to a device ID.
type BackupDailySummaryRow struct {
	DeviceID    string `json:"device_id"`
	DayDate     string `json:"day_date"`
	ProxyUp     int64  `json:"proxy_up"`
	ProxyDown   int64  `json:"proxy_down"`
	DirectUp    int64  `json:"direct_up"`
	DirectDown  int64  `json:"direct_down"`
	RejectBytes int64  `json:"reject_bytes"`
	ConnCount   int64  `json:"conn_count"`
}

// BackupArchive represents a portable, credential-free ClashLens backup for migration or cross-device merge.
type BackupArchive struct {
	FormatVersion int                     `json:"format_version"`
	ExportedAt    int64                   `json:"exported_at"`
	AppVersion    string                  `json:"app_version"`
	Settings      *SettingsPayload        `json:"settings,omitempty"`
	Devices       []BackupDeviceRecord    `json:"devices"`
	MinuteTotals  []BackupMinuteTotalRow  `json:"minute_totals"`
	MinuteFlows   []BackupFlowRow         `json:"minute_flows"`
	HourlyFlows   []BackupFlowRow         `json:"hourly_flows"`
	DailySummary  []BackupDailySummaryRow `json:"daily_summary"`
}

// BackupImportResult reports row counts applied during backup import/merge.
type BackupImportResult struct {
	OK               bool `json:"ok"`
	DevicesImported  int  `json:"devices_imported"`
	DevicesExisting  int  `json:"devices_existing"`
	MinuteTotalsRows int  `json:"minute_totals_rows"`
	MinuteFlowsRows  int  `json:"minute_flows_rows"`
	HourlyFlowsRows  int  `json:"hourly_flows_rows"`
	DailySummaryRows int  `json:"daily_summary_rows"`
	SettingsImported bool `json:"settings_imported"`
}
