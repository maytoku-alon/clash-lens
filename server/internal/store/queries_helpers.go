package store

import (
	"fmt"
	"strings"
	"time"

	"clash-lens/pkg/catalog"
	"clash-lens/pkg/protocol"
)

// AnalyticsFilter defines shared filtering parameters across analytics queries.
type AnalyticsFilter struct {
	DeviceID           string
	Scope              string // all | proxy | direct
	From               int64
	To                 int64
	TZOffsetMin        int
	GroupBy            string // process | domain | device | node | direction
	Interval           string // auto | minute | hour | day
	Limit              int
	Search             string
	OnlineThresholdSec int64
}

type flowSource struct {
	Subquery string
	Args     []any
	IsMinute bool
}

func fixedLoc(tzOffsetMin int) *time.Location {
	return time.FixedZone("LOCAL", tzOffsetMin*60)
}

func formatDayDate(unixTS int64, tzOffsetMin int) string {
	return time.Unix(unixTS, 0).In(fixedLoc(tzOffsetMin)).Format("2006-01-02")
}

func localDayBounds(now int64, tzOffsetMin int) (todayStart, todayEnd, yesterdayStart, yesterdayEnd int64) {
	loc := fixedLoc(tzOffsetMin)
	t := time.Unix(now, 0).In(loc)
	y, m, d := t.Date()
	todayMidnight := time.Date(y, m, d, 0, 0, 0, 0, loc)
	todayStart = todayMidnight.Unix()
	todayEnd = todayMidnight.Add(24*time.Hour).Unix() - 1
	yesterdayStart = todayMidnight.Add(-24 * time.Hour).Unix()
	yesterdayEnd = todayStart - 1
	return
}

func localMonthStart(now int64, tzOffsetMin int) int64 {
	loc := fixedLoc(tzOffsetMin)
	t := time.Unix(now, 0).In(loc)
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, loc).Unix()
}

func quotaCycleBounds(now int64, tzOffsetMin int, resetDay int) (startTS, endTS int64, elapsedDays, daysRemaining int, startLabel, endLabel string) {
	if resetDay < 1 || resetDay > 28 {
		resetDay = 1
	}
	loc := fixedLoc(tzOffsetMin)
	t := time.Unix(now, 0).In(loc)

	var cycleStart time.Time
	if t.Day() >= resetDay {
		cycleStart = time.Date(t.Year(), t.Month(), resetDay, 0, 0, 0, 0, loc)
	} else {
		prevMonth := t.AddDate(0, -1, 0)
		cycleStart = time.Date(prevMonth.Year(), prevMonth.Month(), resetDay, 0, 0, 0, 0, loc)
	}
	cycleEnd := cycleStart.AddDate(0, 1, 0)

	startTS = cycleStart.Unix()
	endTS = cycleEnd.Unix() - 1

	elapsed := int(t.Sub(cycleStart).Hours()/24) + 1
	if elapsed < 1 {
		elapsed = 1
	}
	totalDays := int(cycleEnd.Sub(cycleStart).Hours() / 24)
	if totalDays < 1 {
		totalDays = 30
	}
	rem := int(cycleEnd.Sub(t).Hours() / 24)
	if rem < 0 {
		rem = 0
	}
	return startTS, endTS, elapsed, rem, cycleStart.Format("2006-01-02"), cycleEnd.AddDate(0, 0, -1).Format("2006-01-02")
}

func normalizeFilter(f AnalyticsFilter, now int64) AnalyticsFilter {
	if f.To <= 0 {
		f.To = now
	}
	if f.From <= 0 {
		f.From = f.To - 24*3600
	}
	if f.From > f.To {
		f.From, f.To = f.To, f.From
	}
	if f.Scope == "" {
		f.Scope = "all"
	}
	if f.Interval == "" {
		f.Interval = "auto"
	}
	if f.GroupBy == "" {
		f.GroupBy = "process"
	}
	if f.Limit <= 0 {
		f.Limit = 50
	}
	if f.OnlineThresholdSec <= 0 {
		f.OnlineThresholdSec = 30
	}
	return f
}

func shouldUseMinuteFlows(f AnalyticsFilter, now int64, minuteRetainDays int) bool {
	if minuteRetainDays <= 0 {
		minuteRetainDays = defaultMinuteRetentionDays
	}
	minuteCutoff := now - int64(minuteRetainDays)*86400
	span := f.To - f.From
	return f.From >= minuteCutoff && (f.Interval == "minute" || (f.Interval == "auto" && span <= 86400))
}

func appendSharedFlowFilters(clauses []string, args []any, f AnalyticsFilter, extraCol, extraVal string) ([]string, []any) {
	if f.DeviceID != "" && f.DeviceID != "all" {
		clauses = append(clauses, "device_id = ?")
		args = append(args, f.DeviceID)
	}
	switch strings.ToLower(f.Scope) {
	case "proxy":
		clauses = append(clauses, "route_type = 'PROXY'")
	case "direct":
		clauses = append(clauses, "route_type = 'DIRECT'")
	}
	if extraCol != "" && extraVal != "" {
		clauses = append(clauses, fmt.Sprintf("%s = ?", extraCol))
		args = append(args, extraVal)
	}
	return clauses, args
}

// buildFlowSource returns a pushdown-indexed SQL subquery unifying hot minute rows or warm hourly + cold daily rows.
func buildFlowSource(f AnalyticsFilter, now int64, minuteRetainDays int, extraCol, extraVal string) flowSource {
	if shouldUseMinuteFlows(f, now, minuteRetainDays) {
		fromVal := f.From - (f.From % 60)
		clauses := []string{"bucket_ts >= ?", "bucket_ts <= ?"}
		args := []any{fromVal, f.To}
		clauses, args = appendSharedFlowFilters(clauses, args, f, extraCol, extraVal)
		where := strings.Join(clauses, " AND ")
		sub := fmt.Sprintf(`(
			SELECT device_id, bucket_ts AS ts, process_name, process_display, root_domain, service_tag,
			       host, egress_node, proxy_group, route_type, inbound_mode, rule,
			       up_bytes, down_bytes,
			       CASE WHEN inbound_mode = 'TUN' THEN up_bytes + down_bytes ELSE 0 END AS tun_bytes,
			       CASE WHEN inbound_mode = 'PROXY_PORT' THEN up_bytes + down_bytes ELSE 0 END AS proxy_port_bytes,
			       conn_count
			FROM traffic_minute_flows
			WHERE %s
		)`, where)
		return flowSource{Subquery: sub, Args: args, IsMinute: true}
	}

	fromHour := f.From - (f.From % 3600)
	hClauses := []string{"hour_ts >= ?", "hour_ts <= ?"}
	hArgs := []any{fromHour, f.To}
	hClauses, hArgs = appendSharedFlowFilters(hClauses, hArgs, f, extraCol, extraVal)
	hWhere := strings.Join(hClauses, " AND ")

	startDate := formatDayDate(f.From, f.TZOffsetMin)
	endDate := formatDayDate(f.To, f.TZOffsetMin)
	tzSec := int64(f.TZOffsetMin * 60)
	dClauses := []string{"day_date >= ?", "day_date <= ?"}
	dArgs := []any{tzSec, startDate, endDate}
	dClauses, dArgs = appendSharedFlowFilters(dClauses, dArgs, f, extraCol, extraVal)
	dWhere := strings.Join(dClauses, " AND ")

	allArgs := append(hArgs, dArgs...)
	sub := fmt.Sprintf(`(
		SELECT device_id, hour_ts AS ts, process_name, process_display, root_domain, service_tag,
		       host, egress_node, proxy_group, route_type, inbound_mode, rule,
		       up_bytes, down_bytes,
		       CASE WHEN inbound_mode = 'TUN' THEN up_bytes + down_bytes ELSE 0 END AS tun_bytes,
		       CASE WHEN inbound_mode = 'PROXY_PORT' THEN up_bytes + down_bytes ELSE 0 END AS proxy_port_bytes,
		       conn_count
		FROM traffic_hourly_flows
		WHERE %s
		UNION ALL
		SELECT device_id, (CAST(strftime('%%s', day_date || ' 00:00:00') AS INTEGER) - ?) AS ts,
		       process_name, process_display, root_domain, service_tag,
		       '*' AS host, egress_node, proxy_group, route_type,
		       CASE WHEN tun_bytes > 0 THEN 'TUN' ELSE 'PROXY_PORT' END AS inbound_mode,
		       rule, up_bytes, down_bytes,
		       tun_bytes,
		       CASE WHEN (up_bytes + down_bytes) > tun_bytes THEN (up_bytes + down_bytes - tun_bytes) ELSE 0 END AS proxy_port_bytes,
		       conn_count
		FROM traffic_daily_flows
		WHERE %s
	)`, hWhere, dWhere)
	return flowSource{Subquery: sub, Args: allArgs, IsMinute: false}
}

func chooseTotalInterval(f AnalyticsFilter) string {
	if f.Interval == "minute" || f.Interval == "hour" || f.Interval == "day" {
		return f.Interval
	}
	span := f.To - f.From
	switch {
	case span <= 6*3600:
		return "minute"
	case span <= 72*3600:
		return "hour"
	default:
		return "day"
	}
}

func matchMultiplier(node string, rules []protocol.NodeMultiplierRule) float64 {
	lowerNode := strings.ToLower(strings.TrimSpace(node))
	if lowerNode == "" || lowerNode == "direct" || lowerNode == "reject" {
		return 1.0
	}
	for _, r := range rules {
		pat := strings.ToLower(strings.TrimSpace(r.Pattern))
		if pat == "" {
			continue
		}
		if strings.Contains(pat, "*") {
			if wildcardMatch(pat, lowerNode) {
				return r.Multiplier
			}
		} else if strings.Contains(lowerNode, pat) {
			return r.Multiplier
		}
	}
	return 1.0
}

func wildcardMatch(pattern, s string) bool {
	parts := strings.Split(pattern, "*")
	if len(parts) == 1 {
		return strings.Contains(s, pattern)
	}
	idx := 0
	for i, part := range parts {
		if part == "" {
			continue
		}
		pos := strings.Index(s[idx:], part)
		if pos < 0 {
			return false
		}
		if i == 0 && !strings.HasPrefix(pattern, "*") && pos != 0 {
			return false
		}
		idx += pos + len(part)
	}
	if !strings.HasSuffix(pattern, "*") && parts[len(parts)-1] != "" {
		return strings.HasSuffix(s, parts[len(parts)-1])
	}
	return true
}

func resolveServiceTag(rootDomain, existingTag string, aliases []protocol.DomainAliasRule) string {
	lower := strings.ToLower(strings.TrimSpace(rootDomain))
	for _, a := range aliases {
		if strings.ToLower(strings.TrimSpace(a.Domain)) == lower && a.Label != "" {
			return a.Label
		}
	}
	if builtIn := catalog.LookupService("", lower, "zh"); builtIn != "" {
		return builtIn
	}
	return existingTag
}

func calcSharePct(part, total int64) float64 {
	if total <= 0 || part <= 0 {
		return 0
	}
	return float64(part) * 100.0 / float64(total)
}
