package normalizer

import (
	"net"
	"path/filepath"
	"strings"

	"clash-lens/agent/internal/mihomo"
	"clash-lens/pkg/privacy"
	"clash-lens/pkg/protocol"
	"golang.org/x/net/publicsuffix"
)

var knownProcessAliases = map[string]string{
	"chrome":                 "Chrome",
	"google chrome":          "Chrome",
	"com.android.chrome":     "Chrome",
	"msedge":                 "Edge",
	"microsoftedge":          "Edge",
	"firefox":                "Firefox",
	"firefox.exe":            "Firefox",
	"brave":                  "Brave",
	"arc":                    "Arc",
	"opera":                  "Opera",
	"code":                   "VS Code",
	"cursor":                 "Cursor",
	"antigravity":            "Antigravity",
	"windsurf":               "Windsurf",
	"idea64":                 "IntelliJ IDEA",
	"pycharm64":              "PyCharm",
	"goland64":               "GoLand",
	"datagrip64":             "DataGrip",
	"steam":                  "Steam",
	"steamwebhelper":         "Steam",
	"epicgameslauncher":      "Epic Games",
	"wechat":                 "微信",
	"weixin":                 "微信",
	"com.tencent.mm":         "微信",
	"qq":                     "QQ",
	"com.tencent.mobileqq":   "QQ",
	"telegram":               "Telegram",
	"org.telegram.messenger": "Telegram",
	"discord":                "Discord",
	"slack":                  "Slack",
	"clash-verge":            "Clash Verge",
	"verge-mihomo":           "Clash 内核",
	"mihomo":                 "Clash 内核",
	"clash-meta":             "Clash 内核",
	"curl":                   "curl",
	"wget":                   "wget",
	"git":                    "Git",
	"git-remote-https":       "Git",
	"node":                   "Node.js",
	"python":                 "Python",
	"python3":                "Python",
	"go":                     "Go",
	"docker":                 "Docker",
	"com.docker.backend":     "Docker",
	"dockerd":                "Docker",
	"spotify":                "Spotify",
	"obs64":                  "OBS Studio",
	"svchost":                "Windows 系统服务",
	"system":                 "Windows 系统内核",
	"onedrive":               "OneDrive",
	"dropbox":                "Dropbox",
	"bilibili":               "B站客户端",
	"tv.danmaku.bili":        "B站",
	"com.ss.android.ugc.aweme": "抖音",
}

var exactHostServices = map[string]string{
	"update.googleapis.com":       "Chrome / Google 更新",
	"edgedl.me.gvt1.com":          "Chrome 组件更新",
	"redirector.gvt1.com":         "Chrome / Google 下载",
	"dl.google.com":               "Google 下载",
	"clients2.google.com":         "Chrome 扩展同步",
	"safebrowsing.googleapis.com": "Chrome 安全浏览",
	"raw.githubusercontent.com":   "GitHub Raw",
	"objects.githubusercontent.com": "GitHub Releases",
	"api.openai.com":              "OpenAI API",
	"chatgpt.com":                 "ChatGPT",
	"api.anthropic.com":           "Claude API",
	"claude.ai":                   "Claude",
	"generativelanguage.googleapis.com": "Gemini API",
	"registry.npmjs.org":          "npm 镜像",
	"registry.npmmirror.com":      "npmmirror",
	"goproxy.cn":                  "Go Proxy",
	"proxy.golang.org":            "Go Proxy",
}

var rootDomainServices = map[string]string{
	"googlevideo.com":       "YouTube 视频流",
	"youtube.com":           "YouTube",
	"youtu.be":              "YouTube",
	"ytimg.com":             "YouTube 静态资源",
	"gvt1.com":              "Google CDN / 更新",
	"gvt2.com":              "Google CDN",
	"googleapis.com":        "Google API",
	"google.com":            "Google",
	"gstatic.com":           "Google 静态资源",
	"googleusercontent.com": "Google 用户内容",
	"github.com":            "GitHub",
	"githubusercontent.com": "GitHub 内容分发",
	"githubassets.com":      "GitHub 静态资源",
	"bilibili.com":          "B站",
	"bilivideo.com":         "B站视频流",
	"bilivideo.cn":          "B站视频流",
	"hdslb.com":             "B站静态资源",
	"biliapi.net":           "B站 API",
	"steampowered.com":      "Steam",
	"steamcontent.com":      "Steam 游戏下载",
	"steamstatic.com":       "Steam 静态资源",
	"steamcommunity.com":    "Steam 社区",
	"openai.com":            "OpenAI",
	"chatgpt.com":           "ChatGPT",
	"oaiusercontent.com":    "ChatGPT 资源",
	"anthropic.com":         "Anthropic / Claude",
	"claude.ai":             "Claude",
	"microsoft.com":         "Microsoft",
	"windowsupdate.com":     "Windows 更新",
	"live.com":              "Microsoft Live",
	"msedge.net":            "Edge 服务",
	"apple.com":             "Apple",
	"icloud.com":            "iCloud",
	"mzstatic.com":          "Apple CDN",
	"cloudflare.com":        "Cloudflare",
	"twitch.tv":             "Twitch",
	"ttvnw.net":             "Twitch 视频流",
	"netflix.com":           "Netflix",
	"nflxvideo.net":         "Netflix 视频流",
	"discord.com":           "Discord",
	"discordapp.com":        "Discord 资源",
	"discordapp.net":        "Discord 媒体",
	"telegram.org":          "Telegram",
	"t.me":                  "Telegram",
	"docker.io":             "Docker Hub",
	"docker.com":            "Docker",
	"npmjs.org":             "npm",
	"pypi.org":              "PyPI",
	"pythonhosted.org":      "PyPI 文件",
	"qq.com":                "腾讯",
	"weixin.qq.com":         "微信",
	"weixinbridge.com":      "微信",
	"byteoversea.com":       "ByteDance 海外",
	"tiktokv.com":           "TikTok",
	"x.com":                 "X (Twitter)",
	"twitter.com":           "X (Twitter)",
	"twimg.com":             "X 媒体资源",
	"reddit.com":            "Reddit",
	"redd.it":               "Reddit 媒体",
	"spotify.com":           "Spotify",
	"scdn.co":               "Spotify CDN",
}

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
		return "unknown", "未知进程"
	}
	rawName = p
	key := strings.ToLower(p)
	keyNoExe := strings.TrimSuffix(key, ".exe")
	if alias, ok := knownProcessAliases[key]; ok {
		return rawName, alias
	}
	if alias, ok := knownProcessAliases[keyNoExe]; ok {
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
	if tag, ok := exactHostServices[strings.ToLower(host)]; ok {
		return tag
	}
	if tag, ok := rootDomainServices[strings.ToLower(rootDomain)]; ok {
		return tag
	}
	return ""
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
