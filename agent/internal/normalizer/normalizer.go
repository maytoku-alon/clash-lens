package normalizer

import (
	"net"
	"path/filepath"
	"strings"

	"clash-lens/agent/internal/mihomo"
	"clash-lens/pkg/catalog"
	"clash-lens/pkg/privacy"
	"clash-lens/pkg/protocol"
	"golang.org/x/net/publicsuffix"
)

// NormalizedConn holds normalized dimensions extracted from a Mihomo connection.
type NormalizedConn struct {
	ProcessName    string
	ProcessPath    string
	ProcessDisplay string
	RootDomain     string
	ServiceTag     string
	Host           string
	EgressNode     string
	ProxyGroup     string
	RouteType      string
	InboundMode    string
	Rule           string
}

// Options configures optional normalization behaviors such as local path sanitization.
type Options struct {
	SanitizeMode string
}

// NormalizeConnection standardizes process, domain, service label, route type, and inbound mode
// with default local path masking enabled.
func NormalizeConnection(c mihomo.ConnectionItem) NormalizedConn {
	return NormalizeConnectionWithOptions(c, Options{SanitizeMode: privacy.ModeMask})
}

// NormalizeConnectionWithOptions standardizes connection metadata and applies the configured sanitization mode.
func NormalizeConnectionWithOptions(c mihomo.ConnectionItem, opts Options) NormalizedConn {
	mode := privacy.NormalizeMode(opts.SanitizeMode)
	procRaw, procDisplay := NormalizeProcess(c.Metadata.Process, c.Metadata.ProcessPath)
	host, rootDomain := NormalizeHostAndRoot(c.Metadata.Host, c.Metadata.SniffHost, c.Metadata.DestinationIP)
	serviceTag := LookupServiceTag(host, rootDomain)
	egress, group, routeType := ClassifyChains(c.Chains)
	inbound := ClassifyInbound(c.Metadata.Type, c.Metadata.InboundName)
	rule := privacy.SanitizeRule(FormatRule(c.Rule, c.RulePayload), mode)

	procPath := strings.TrimSpace(c.Metadata.ProcessPath)
	if mode != privacy.ModeOff {
		procPath = ""
	}

	return NormalizedConn{
		ProcessName:    procRaw,
		ProcessPath:    procPath,
		ProcessDisplay: procDisplay,
		RootDomain:     rootDomain,
		ServiceTag:     serviceTag,
		Host:           host,
		EgressNode:     egress,
		ProxyGroup:     group,
		RouteType:      routeType,
		InboundMode:    inbound,
		Rule:           rule,
	}
}

// NormalizeProcess extracts raw process identifier and friendly display name.
func NormalizeProcess(proc, procPath string) (rawName, display string) {
	p := strings.TrimSpace(proc)
	if p == "" && procPath != "" {
		p = filepath.Base(strings.TrimSpace(procPath))
	}
	if p == "" {
		if label, ok := catalog.LookupProcess("unknown", "zh"); ok {
			return "unknown", label
		}
		return "unknown", "未知进程"
	}
	rawName = p
	key := strings.ToLower(p)
	keyNoExe := strings.TrimSuffix(key, ".exe")
	if alias, ok := catalog.LookupProcess(key, "zh"); ok {
		return rawName, alias
	}
	if alias, ok := catalog.LookupProcess(keyNoExe, "zh"); ok {
		return rawName, alias
	}
	cleaned := strings.TrimSuffix(p, ".exe")
	cleaned = strings.TrimSuffix(cleaned, ".EXE")
	if cleaned == "" {
		cleaned = p
	}
	return rawName, cleaned
}

// NormalizeHostAndRoot picks host -> sniffHost -> destinationIP and computes eTLD+1 root domain.
func NormalizeHostAndRoot(host, sniffHost, destIP string) (normHost, rootDomain string) {
	candidate := firstNonEmpty(host, sniffHost, destIP)
	candidate = strings.ToLower(strings.TrimSpace(candidate))
	if candidate == "" {
		return "unknown", "unknown"
	}

	// Strip optional port (avoid stripping IPv6 unless bracketed)
	if strings.HasPrefix(candidate, "[") {
		if h, _, err := net.SplitHostPort(candidate); err == nil {
			candidate = h
		} else {
			candidate = strings.Trim(candidate, "[]")
		}
	} else if strings.Count(candidate, ":") == 1 {
		if h, _, err := net.SplitHostPort(candidate); err == nil {
			candidate = h
		}
	}
	candidate = strings.TrimSuffix(candidate, ".")
	if candidate == "" {
		return "unknown", "unknown"
	}

	if ip := net.ParseIP(candidate); ip != nil {
		return candidate, candidate
	}

	etld, err := publicsuffix.EffectiveTLDPlusOne(candidate)
	if err != nil || etld == "" {
		return candidate, candidate
	}
	return candidate, etld
}

// LookupServiceTag returns a built-in friendly service label for well-known hosts/domains.
func LookupServiceTag(host, rootDomain string) string {
	return catalog.LookupService(host, rootDomain, "zh")
}

// ClassifyChains resolves Mihomo chains into egress node, top proxy group, and route type.
// In Mihomo /connections, chains[0] is the leaf egress (node or DIRECT/REJECT) and chains[len-1] is the top selector/rule group.
func ClassifyChains(chains []string) (egressNode, proxyGroup, routeType string) {
	if len(chains) == 0 {
		return "DIRECT", "DIRECT", protocol.RouteDirect
	}
	egress := strings.TrimSpace(chains[0])
	group := strings.TrimSpace(chains[len(chains)-1])
	if egress == "" {
		egress = "DIRECT"
	}
	if group == "" {
		group = egress
	}

	upper := strings.ToUpper(egress)
	switch {
	case upper == "DIRECT":
		return "DIRECT", group, protocol.RouteDirect
	case upper == "REJECT" || upper == "REJECT-DROP" || upper == "PASS":
		return egress, group, protocol.RouteReject
	default:
		return egress, group, protocol.RouteProxy
	}
}

// ClassifyInbound normalizes Mihomo metadata.type / inboundName into TUN | PROXY_PORT | INNER.
func ClassifyInbound(metaType, inboundName string) string {
	combined := strings.ToLower(metaType + " " + inboundName)
	switch {
	case strings.Contains(combined, "tun") || strings.Contains(combined, "tproxy") || strings.Contains(combined, "redir"):
		return protocol.InboundTUN
	case strings.Contains(combined, "inner"):
		return protocol.InboundInner
	default:
		return protocol.InboundProxyPort
	}
}

// FormatRule joins Mihomo rule and rulePayload concisely.
func FormatRule(rule, payload string) string {
	r := strings.TrimSpace(rule)
	p := strings.TrimSpace(payload)
	if r == "" {
		return ""
	}
	if p == "" {
		return r
	}
	return r + "," + p
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if t := strings.TrimSpace(v); t != "" {
			return t
		}
	}
	return ""
}
