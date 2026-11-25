package mihomo

// VersionResp mirrors Mihomo /version JSON response.
type VersionResp struct {
	Meta    bool   `json:"meta"`
	Version string `json:"version"`
}

// TunConfig mirrors Mihomo /configs tun block.
type TunConfig struct {
	Enable bool   `json:"enable"`
	Stack  string `json:"stack"`
	Device string `json:"device"`
}

// ConfigsResp mirrors Mihomo /configs JSON response.
type ConfigsResp struct {
	Mode            string    `json:"mode"`
	FindProcessMode string    `json:"find-process-mode"`
	Sniffing        bool      `json:"sniffing"`
	Tun             TunConfig `json:"tun"`
}

// ConnectionMetadata captures Mihomo connection attribution fields.
type ConnectionMetadata struct {
	Network           string `json:"network"`
	Type              string `json:"type"`
	SourceIP          string `json:"sourceIP"`
	DestinationIP     string `json:"destinationIP"`
	DestinationIPASN  string `json:"destinationIPASN"`
	Host              string `json:"host"`
	SniffHost         string `json:"sniffHost"`
	DNSMode           string `json:"dnsMode"`
	Process           string `json:"process"`
	ProcessPath       string `json:"processPath"`
	InboundName       string `json:"inboundName"`
	SpecialProxy      string `json:"specialProxy"`
	RemoteDestination string `json:"remoteDestination"`
}

// ConnectionItem represents one active connection inside Mihomo /connections.
type ConnectionItem struct {
	ID          string             `json:"id"`
	Metadata    ConnectionMetadata `json:"metadata"`
	Upload      int64              `json:"upload"`
	Download    int64              `json:"download"`
	Start       string             `json:"start"`
	Chains      []string           `json:"chains"`
	Rule        string             `json:"rule"`
	RulePayload string             `json:"rulePayload"`
}

// ConnectionsSnapshot represents the full payload of Mihomo /connections HTTP or WS frames.
type ConnectionsSnapshot struct {
	DownloadTotal int64            `json:"downloadTotal"`
	UploadTotal   int64            `json:"uploadTotal"`
	Connections   []ConnectionItem `json:"connections"`
}
