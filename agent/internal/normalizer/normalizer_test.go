package normalizer_test

import (
	"testing"

	"clash-lens/agent/internal/mihomo"
	"clash-lens/agent/internal/normalizer"
	"clash-lens/pkg/privacy"
	"clash-lens/pkg/protocol"
)

func TestNormalizeConnection(t *testing.T) {
	c := mihomo.ConnectionItem{
		ID:     "c1",
		Chains: []string{"HK-01", "Proxy"},
		Rule:   "GEOSITE",
		RulePayload: "youtube",
		Metadata: mihomo.ConnectionMetadata{
			Type:        "HTTPS",
			Process:     "chrome.exe",
			ProcessPath: `C:\Program Files\Google\Chrome\Application\chrome.exe`,
			Host:        "rr3---sn-ogueln7s.googlevideo.com:443",
		},
	}

	n := normalizer.NormalizeConnection(c)
	if n.ProcessDisplay != "Chrome" {
		t.Fatalf("ProcessDisplay=%q want Chrome", n.ProcessDisplay)
	}
	if n.RootDomain != "googlevideo.com" {
		t.Fatalf("RootDomain=%q want googlevideo.com", n.RootDomain)
	}
	if n.Host != "rr3---sn-ogueln7s.googlevideo.com" {
		t.Fatalf("Host=%q", n.Host)
	}
	if n.ServiceTag != "YouTube 视频流" {
		t.Fatalf("ServiceTag=%q", n.ServiceTag)
	}
	if n.EgressNode != "HK-01" || n.ProxyGroup != "Proxy" || n.RouteType != protocol.RouteProxy {
		t.Fatalf("unexpected chains: %+v", n)
	}
	if n.InboundMode != protocol.InboundProxyPort {
		t.Fatalf("InboundMode=%q want PROXY_PORT", n.InboundMode)
	}
}

func TestNormalizeTUNAndDirect(t *testing.T) {
	c := mihomo.ConnectionItem{
		ID:     "c2",
		Chains: []string{"DIRECT"},
		Metadata: mihomo.ConnectionMetadata{
			Type:          "TUN",
			InboundName:   "tun-in",
			Process:       "steamwebhelper.exe",
			SniffHost:     "cache5.steamcontent.com",
			DestinationIP: "1.2.3.4",
		},
	}
	n := normalizer.NormalizeConnection(c)
	if n.ProcessDisplay != "Steam" {
		t.Fatalf("ProcessDisplay=%q want Steam", n.ProcessDisplay)
	}
	if n.RootDomain != "steamcontent.com" {
		t.Fatalf("RootDomain=%q want steamcontent.com", n.RootDomain)
	}
	if n.RouteType != protocol.RouteDirect || n.InboundMode != protocol.InboundTUN {
		t.Fatalf("unexpected route/inbound: %+v", n)
	}
}

func TestNormalizePathSanitization(t *testing.T) {
	item := mihomo.ConnectionItem{
		ID:          "c3",
		Chains:      []string{"US-BGP", "Proxy"},
		Rule:        "ProcessPathRegex",
		RulePayload: `(?i)^C:\\Users\\Administrator\\AppData\\Local\\Programs\\antigravity\\`,
		Metadata: mihomo.ConnectionMetadata{
			Type:        "HTTPS",
			Process:     "language_server.exe",
			ProcessPath: `C:\Users\Administrator\AppData\Local\Programs\antigravity\language_server.exe`,
			Host:        "daily-cloudcode-pa.googleapis.com",
		},
	}

	masked := normalizer.NormalizeConnection(item)
	if masked.Rule != `ProcessPathRegex,<USER_HOME>/.../antigravity` {
		t.Fatalf("masked Rule=%q", masked.Rule)
	}
	if masked.ProcessPath != "" {
		t.Fatalf("expected ProcessPath cleared when sanitized, got %q", masked.ProcessPath)
	}

	raw := normalizer.NormalizeConnectionWithOptions(item, normalizer.Options{SanitizeMode: privacy.ModeOff})
	if raw.ProcessPath == "" || raw.Rule == masked.Rule {
		t.Fatalf("expected ModeOff to preserve raw rule and process path: %+v", raw)
	}
}
