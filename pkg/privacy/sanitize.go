package privacy

import (
	"regexp"
	"strings"
)

const (
	// ModeMask masks local user home / directory prefixes while preserving the leaf folder or executable name.
	ModeMask = "mask"
	// ModeStrict completely redacts local path payloads.
	ModeStrict = "strict"
	// ModeOff disables rule and process path sanitization.
	ModeOff = "off"
)

var (
	leadingFlagsRe      = regexp.MustCompile(`^(?:\(\?[a-zA-Z0-9-]+\)|\^)+`)
	trailingRegexWildRe = regexp.MustCompile(`(?:\[\^[^]]*\]|\.\*|\.\+|\*|\$)+$`)
	winHomeEmbeddedRe   = regexp.MustCompile(`(?i)(^|[\s,("^'])((?:\(\?[a-zA-Z0-9-]+\)|\^)*[A-Za-z]:(?:\\{1,2}|/)Users(?:\\{1,2}|/)[^\\/\s,)'"]+(?:(?:\\{1,2}|/)[^\\/\s,)'"]*)*)`)
	unixHomeEmbeddedRe  = regexp.MustCompile(`(^|[\s,("^'])((?:\(\?[a-zA-Z0-9-]+\)|\^)*/(?:Users|home)/[^/\s,)'"]+(?:/[^/\s,)'"]*)*)`)
)

// NormalizeMode validates and normalizes a path sanitization mode string.
func NormalizeMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case ModeStrict:
		return ModeStrict
	case ModeOff, "false", "disabled", "none":
		return ModeOff
	default:
		return ModeMask
	}
}

// SanitizeRule redacts or masks local filesystem paths embedded in Mihomo rule strings.
func SanitizeRule(rule, mode string) string {
	trimmed := strings.TrimSpace(rule)
	if trimmed == "" {
		return ""
	}
	normMode := NormalizeMode(mode)
	if normMode == ModeOff {
		return trimmed
	}

	if idx := strings.IndexByte(trimmed, ','); idx >= 0 {
		ruleType := strings.TrimSpace(trimmed[:idx])
		payload := strings.TrimSpace(trimmed[idx+1:])
		if isPathRuleType(ruleType) {
			if payload == "" {
				return ruleType
			}
			if normMode == ModeStrict {
				return ruleType + ",<REDACTED>"
			}
			if payload == "<REDACTED>" || strings.HasPrefix(payload, "<USER_HOME>") || strings.HasPrefix(payload, "<PATH>") {
				return ruleType + "," + payload
			}
			if looksLikeFilesystemPath(payload) {
				return ruleType + "," + maskPathString(payload)
			}
			return ruleType + "," + payload
		}
	}

	return sanitizeEmbeddedPaths(trimmed, normMode)
}

func isPathRuleType(ruleType string) bool {
	compact := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(ruleType), "-", ""))
	switch compact {
	case "processpath", "processpathregex", "processpathwildcard":
		return true
	default:
		return false
	}
}

func looksLikeFilesystemPath(payload string) bool {
	if strings.Contains(payload, `\`) || strings.Contains(payload, `/`) {
		return true
	}
	cleaned := leadingFlagsRe.ReplaceAllString(payload, "")
	return len(cleaned) >= 2 && cleaned[1] == ':' && isASCIILetter(cleaned[0])
}

func sanitizeEmbeddedPaths(rule, normMode string) string {
	out := winHomeEmbeddedRe.ReplaceAllStringFunc(rule, func(match string) string {
		loc := winHomeEmbeddedRe.FindStringSubmatch(match)
		if len(loc) < 3 {
			return match
		}
		prefix, pathPart := loc[1], loc[2]
		if normMode == ModeStrict {
			return prefix + "<REDACTED>"
		}
		return prefix + maskPathString(pathPart)
	})

	out = unixHomeEmbeddedRe.ReplaceAllStringFunc(out, func(match string) string {
		loc := unixHomeEmbeddedRe.FindStringSubmatch(match)
		if len(loc) < 3 {
			return match
		}
		prefix, pathPart := loc[1], loc[2]
		if normMode == ModeStrict {
			return prefix + "<REDACTED>"
		}
		return prefix + maskPathString(pathPart)
	})
	return out
}

func maskPathString(raw string) string {
	s := strings.TrimSpace(raw)
	s = leadingFlagsRe.ReplaceAllString(s, "")
	s = strings.TrimSpace(s)

	// Convert escaped or Windows backslashes to forward slashes cleanly.
	s = strings.ReplaceAll(s, `\`, `/`)
	s = strings.TrimRight(s, "/")
	s = trailingRegexWildRe.ReplaceAllString(s, "")
	s = strings.TrimRight(s, "/")

	// Windows drive path (e.g. C:/Users/Administrator/AppData/... or C:/Program Files/...)
	if len(s) >= 2 && isASCIILetter(s[0]) && s[1] == ':' {
		rest := strings.TrimLeft(s[2:], "/")
		segs := cleanSegments(strings.Split(rest, "/"))
		if len(segs) >= 1 && strings.EqualFold(segs[0], "users") {
			if len(segs) <= 2 {
				return "<USER_HOME>"
			}
			return formatMaskedSegments("<USER_HOME>", segs[2:])
		}
		return formatMaskedSegments("<PATH>", segs)
	}

	// Unix absolute path (e.g. /Users/user123/... or /home/zhangsan/... or /opt/app/bin)
	if strings.HasPrefix(s, "/") {
		segs := cleanSegments(strings.Split(strings.TrimLeft(s, "/"), "/"))
		if len(segs) >= 1 && (strings.EqualFold(segs[0], "users") || segs[0] == "home") {
			if len(segs) <= 2 {
				return "<USER_HOME>"
			}
			return formatMaskedSegments("<USER_HOME>", segs[2:])
		}
		return formatMaskedSegments("<PATH>", segs)
	}

	// Fallback generic relative path containing separators
	segs := cleanSegments(strings.Split(s, "/"))
	return formatMaskedSegments("<PATH>", segs)
}

func formatMaskedSegments(root string, segs []string) string {
	switch len(segs) {
	case 0:
		return root
	case 1:
		return root + "/" + segs[0]
	default:
		return root + "/.../" + segs[len(segs)-1]
	}
}

func cleanSegments(raw []string) []string {
	out := make([]string, 0, len(raw))
	for _, seg := range raw {
		t := strings.TrimSpace(seg)
		t = trailingRegexWildRe.ReplaceAllString(t, "")
		t = strings.TrimSpace(t)
		if t == "" || isPureWildcardToken(t) {
			continue
		}
		out = append(out, t)
	}
	return out
}

func isPureWildcardToken(s string) bool {
	switch s {
	case "*", "**", ".*", ".+", "?":
		return true
	default:
		return false
	}
}

func isASCIILetter(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z')
}
