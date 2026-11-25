package store

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"clash-lens/pkg/protocol"
)

// GetOverview returns top-level KPI metrics, quota calculation, top consumer, and diagnostic warnings.
func (s *Store) GetOverview(ctx context.Context, rawFilter AnalyticsFilter) (protocol.OverviewResponse, error) {
	now := time.Now().Unix()
	f := normalizeFilter(rawFilter, now)
	settings, err := s.GetSettings(ctx)
	if err != nil {
		return protocol.OverviewResponse{}, err
	}

	var out protocol.OverviewResponse

	// 1. Range totals
	if f.From >= now-90*86400 {
		q := `SELECT
			COALESCE(SUM(proxy_up), 0), COALESCE(SUM(proxy_down), 0),
			COALESCE(SUM(direct_up), 0), COALESCE(SUM(direct_down), 0),
			COALESCE(SUM(unattributed_up), 0), COALESCE(SUM(unattributed_down), 0),
			COALESCE(SUM(tun_bytes), 0)
			FROM traffic_minute_totals WHERE bucket_ts >= ? AND bucket_ts <= ?`
		args := []any{f.From - (f.From % 60), f.To}
		if f.DeviceID != "" && f.DeviceID != "all" {
			q += ` AND device_id = ?`
			args = append(args, f.DeviceID)
		}
		var pUp, pDown, dUp, dDown, uUp, uDown, tunB int64
		if err := s.db.QueryRowContext(ctx, q, args...).Scan(&pUp, &pDown, &dUp, &dDown, &uUp, &uDown, &tunB); err != nil {
			return out, err
		}
		out.RangeProxyBytes = pUp + pDown
		out.RangeDirectBytes = dUp + dDown + uUp + uDown
		out.RangeTunBytes = tunB
		switch strings.ToLower(f.Scope) {
		case "proxy":
			out.RangeUpBytes = pUp
			out.RangeDownBytes = pDown
			out.RangeBytes = out.RangeProxyBytes
		case "direct":
			out.RangeUpBytes = dUp + uUp
			out.RangeDownBytes = dDown + uDown
			out.RangeBytes = out.RangeDirectBytes
		default:
			out.RangeUpBytes = pUp + dUp + uUp
			out.RangeDownBytes = pDown + dDown + uDown
			out.RangeBytes = out.RangeProxyBytes + out.RangeDirectBytes
		}
	} else {
		startDate := formatDayDate(f.From, f.TZOffsetMin)
		endDate := formatDayDate(f.To, f.TZOffsetMin)
		q := `SELECT
			COALESCE(SUM(proxy_up), 0), COALESCE(SUM(proxy_down), 0),
			COALESCE(SUM(direct_up), 0), COALESCE(SUM(direct_down), 0)
			FROM traffic_daily_summary WHERE day_date >= ? AND day_date <= ?`
		args := []any{startDate, endDate}
		if f.DeviceID != "" && f.DeviceID != "all" {
			q += ` AND device_id = ?`
			args = append(args, f.DeviceID)
		}
		var pUp, pDown, dUp, dDown int64
		if err := s.db.QueryRowContext(ctx, q, args...).Scan(&pUp, &pDown, &dUp, &dDown); err != nil {
			return out, err
		}
		out.RangeProxyBytes = pUp + pDown
		out.RangeDirectBytes = dUp + dDown
		switch strings.ToLower(f.Scope) {
		case "proxy":
			out.RangeUpBytes, out.RangeDownBytes, out.RangeBytes = pUp, pDown, out.RangeProxyBytes
		case "direct":
			out.RangeUpBytes, out.RangeDownBytes, out.RangeBytes = dUp, dDown, out.RangeDirectBytes
		default:
			out.RangeUpBytes, out.RangeDownBytes = pUp+dUp, pDown+dDown
			out.RangeBytes = out.RangeProxyBytes + out.RangeDirectBytes
		}
	}

	// 2. Today vs Yesterday
	todayStart, todayEnd, yestStart, yestEnd := localDayBounds(now, f.TZOffsetMin)
	tProxy, tDirect, err := s.sumTotalsWindow(ctx, f.DeviceID, todayStart, todayEnd)
	if err != nil {
		return out, err
	}
	yProxy, yDirect, err := s.sumTotalsWindow(ctx, f.DeviceID, yestStart, yestEnd)
	if err != nil {
		return out, err
	}
	out.TodayProxyBytes = tProxy
	out.TodayDirectBytes = tDirect
	switch strings.ToLower(f.Scope) {
	case "proxy":
		out.TodayBytes = tProxy
		out.YesterdayBytes = yProxy
	case "direct":
		out.TodayBytes = tDirect
		out.YesterdayBytes = yDirect
	default:
		out.TodayBytes = tProxy + tDirect
		out.YesterdayBytes = yProxy + yDirect
	}
	if out.YesterdayBytes > 0 {
		out.TodayDeltaPct = float64(out.TodayBytes-out.YesterdayBytes) * 100.0 / float64(out.YesterdayBytes)
	}

	// 3. Month & All-time from daily summary
	monthStartDate := formatDayDate(localMonthStart(now, f.TZOffsetMin), f.TZOffsetMin)
	todayDate := formatDayDate(now, f.TZOffsetMin)
	mProxy, mDirect, err := s.sumDailyRange(ctx, f.DeviceID, monthStartDate, todayDate)
	if err != nil {
		return out, err
	}
	out.MonthProxyBytes = mProxy
	out.MonthDirectBytes = mDirect
	switch strings.ToLower(f.Scope) {
	case "proxy":
		out.MonthBytes = mProxy
	case "direct":
		out.MonthBytes = mDirect
	default:
		out.MonthBytes = mProxy + mDirect
	}

	allProxy, allDirect, err := s.sumDailyRange(ctx, f.DeviceID, "", "")
	if err != nil {
		return out, err
	}
	switch strings.ToLower(f.Scope) {
	case "proxy":
		out.AllTimeBytes = allProxy
	case "direct":
		out.AllTimeBytes = allDirect
	default:
		out.AllTimeBytes = allProxy + allDirect
	}

	// 4. Devices & Diagnostic warnings
	devs, err := s.ListDevices(ctx, f.TZOffsetMin, f.OnlineThresholdSec)
	if err != nil {
		return out, err
	}
	out.TotalDevices = len(devs)
	for _, d := range devs {
		if d.Online {
			out.OnlineDevices++
		}
		if d.TunEnabled && !d.SnifferEnabled && (f.DeviceID == "" || f.DeviceID == "all" || f.DeviceID == d.ID) {
			out.Warnings = append(out.Warnings, protocol.DiagnosticWarning{
				Code:       "TUN_SNIFFER_OFF",
				DeviceID:   d.ID,
				DeviceName: d.Name,
				Title:      "TUN 模式已启用但域名嗅探（Sniffer）未开启",
				Message:    fmt.Sprintf("设备「%s」开启了 TUN，但未开启 Clash 域名嗅探，部分直连 IP 流量可能无法还原为域名，建议在 Clash Verge 设置中开启嗅探。", d.Name),
			})
		}
	}
	if out.Warnings == nil {
		out.Warnings = []protocol.DiagnosticWarning{}
	}

	// 5. Top consumer in active range
	table, tsCol, _ := chooseFlowSource(f, now)
	align := int64(3600)
	if table == "traffic_minute_flows" {
		align = 60
	}
	where, args := buildFlowWhere(f, tsCol, align, "", "")
	var tc protocol.TopConsumerSummary
	err = s.db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT
			process_display,
			root_domain,
			MAX(service_tag),
			SUM(up_bytes + down_bytes) AS total_b,
			SUM(CASE WHEN route_type = 'PROXY' THEN up_bytes + down_bytes ELSE 0 END) AS proxy_b,
			SUM(CASE WHEN route_type = 'DIRECT' THEN up_bytes + down_bytes ELSE 0 END) AS direct_b
		FROM %s
		WHERE %s
		GROUP BY process_display, root_domain
		ORDER BY total_b DESC
		LIMIT 1
	`, table, where), args...).Scan(&tc.ProcessDisplay, &tc.RootDomain, &tc.ServiceTag, &tc.TotalBytes, &tc.ProxyBytes, &tc.DirectBytes)
	if err == nil && tc.TotalBytes > 0 {
		tc.ServiceTag = resolveServiceTag(tc.RootDomain, tc.ServiceTag, settings.DomainAliases)
		out.TopConsumer = &tc
	}

	// 6. Quota calculation
	quota, err := s.computeQuota(ctx, f.DeviceID, f.TZOffsetMin, now, settings)
	if err != nil {
		return out, err
	}
	out.Quota = quota
	return out, nil
}

func (s *Store) sumTotalsWindow(ctx context.Context, deviceID string, fromTS, toTS int64) (proxyBytes, directBytes int64, err error) {
	q := `SELECT
		COALESCE(SUM(proxy_up + proxy_down), 0),
		COALESCE(SUM(direct_up + direct_down + unattributed_up + unattributed_down), 0)
		FROM traffic_minute_totals
		WHERE bucket_ts >= ? AND bucket_ts <= ?`
	args := []any{fromTS, toTS}
	if deviceID != "" && deviceID != "all" {
		q += ` AND device_id = ?`
		args = append(args, deviceID)
	}
	err = s.db.QueryRowContext(ctx, q, args...).Scan(&proxyBytes, &directBytes)
	return
}

func (s *Store) sumDailyRange(ctx context.Context, deviceID, startDate, endDate string) (proxyBytes, directBytes int64, err error) {
	clauses := []string{"1=1"}
	var args []any
	if startDate != "" {
		clauses = append(clauses, "day_date >= ?")
		args = append(args, startDate)
	}
	if endDate != "" {
		clauses = append(clauses, "day_date <= ?")
		args = append(args, endDate)
	}
	if deviceID != "" && deviceID != "all" {
		clauses = append(clauses, "device_id = ?")
		args = append(args, deviceID)
	}
	q := fmt.Sprintf(`SELECT
		COALESCE(SUM(proxy_up + proxy_down), 0),
		COALESCE(SUM(direct_up + direct_down), 0)
		FROM traffic_daily_summary WHERE %s`, strings.Join(clauses, " AND "))
	err = s.db.QueryRowContext(ctx, q, args...).Scan(&proxyBytes, &directBytes)
	return
}

func (s *Store) computeQuota(ctx context.Context, deviceID string, tzOffsetMin int, now int64, settings protocol.SettingsPayload) (protocol.QuotaSummary, error) {
	startTS, endTS, elapsedDays, remDays, startLabel, endLabel := quotaCycleBounds(now, tzOffsetMin, settings.ResetDay)
	startHour := startTS - (startTS % 3600)

	q := `SELECT egress_node, COALESCE(SUM(up_bytes + down_bytes), 0)
	      FROM traffic_hourly_flows
	      WHERE route_type = 'PROXY' AND hour_ts >= ? AND hour_ts <= ?`
	args := []any{startHour, endTS}
	if deviceID != "" && deviceID != "all" {
		q += ` AND device_id = ?`
		args = append(args, deviceID)
	}
	q += ` GROUP BY egress_node`

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return protocol.QuotaSummary{}, err
	}
	defer rows.Close()

	var rawTotal, billedTotal int64
	for rows.Next() {
		var node string
		var bytes int64
		if err := rows.Scan(&node, &bytes); err != nil {
			return protocol.QuotaSummary{}, err
		}
		rawTotal += bytes
		mult := matchMultiplier(node, settings.NodeMultipliers)
		billedTotal += int64(math.Round(float64(bytes) * mult))
	}
	if err := rows.Err(); err != nil {
		return protocol.QuotaSummary{}, err
	}

	const bytesPerGB = float64(1024 * 1024 * 1024)
	usedPct := 0.0
	if settings.MonthlyQuotaGB > 0 {
		usedPct = float64(billedTotal) / (settings.MonthlyQuotaGB * bytesPerGB) * 100.0
	}
	totalCycleDays := float64(elapsedDays + remDays)
	if totalCycleDays < 1 {
		totalCycleDays = 30
	}
	projectedGB := (float64(billedTotal) / bytesPerGB) / float64(elapsedDays) * totalCycleDays

	return protocol.QuotaSummary{
		Enabled:         settings.MonthlyQuotaGB > 0,
		MonthlyQuotaGB:  settings.MonthlyQuotaGB,
		ResetDay:        settings.ResetDay,
		RawProxyBytes:   rawTotal,
		BilledBytes:     billedTotal,
		UsedPercent:     usedPct,
		ProjectedGB:     projectedGB,
		DaysRemaining:   remDays,
		CycleStartLabel: startLabel,
		CycleEndLabel:   endLabel,
	}, nil
}

// GetHeatmap returns 365 days of calendar activity plus streak and peak statistics.
func (s *Store) GetHeatmap(ctx context.Context, rawFilter AnalyticsFilter) (protocol.HeatmapResponse, error) {
	now := time.Now().Unix()
	f := normalizeFilter(rawFilter, now)
	loc := fixedLoc(f.TZOffsetMin)
	today := time.Unix(now, 0).In(loc)
	todayMidnight := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, loc)
	startDay := todayMidnight.AddDate(0, 0, -364)

	startStr := startDay.Format("2006-01-02")
	endStr := todayMidnight.Format("2006-01-02")

	q := `SELECT day_date,
		COALESCE(SUM(proxy_up), 0), COALESCE(SUM(proxy_down), 0),
		COALESCE(SUM(direct_up), 0), COALESCE(SUM(direct_down), 0),
		COALESCE(SUM(conn_count), 0)
		FROM traffic_daily_summary
		WHERE day_date >= ? AND day_date <= ?`
	args := []any{startStr, endStr}
	if f.DeviceID != "" && f.DeviceID != "all" {
		q += ` AND device_id = ?`
		args = append(args, f.DeviceID)
	}
	q += ` GROUP BY day_date`

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return protocol.HeatmapResponse{}, err
	}
	defer rows.Close()

	byDate := make(map[string]protocol.HeatmapDay, 365)
	for rows.Next() {
		var d string
		var pUp, pDown, dUp, dDown, conns int64
		if err := rows.Scan(&d, &pUp, &pDown, &dUp, &dDown, &conns); err != nil {
			return protocol.HeatmapResponse{}, err
		}
		proxyB := pUp + pDown
		directB := dUp + dDown
		var totalB, upB, downB int64
		switch strings.ToLower(f.Scope) {
		case "proxy":
			totalB, upB, downB = proxyB, pUp, pDown
		case "direct":
			totalB, upB, downB = directB, dUp, dDown
		default:
			totalB, upB, downB = proxyB+directB, pUp+dUp, pDown+dDown
		}
		byDate[d] = protocol.HeatmapDay{
			Date:        d,
			TotalBytes:  totalB,
			ProxyBytes:  proxyB,
			DirectBytes: directB,
			UpBytes:     upB,
			DownBytes:   downB,
			ConnCount:   conns,
		}
	}
	if err := rows.Err(); err != nil {
		return protocol.HeatmapResponse{}, err
	}

	out := protocol.HeatmapResponse{
		Days: make([]protocol.HeatmapDay, 0, 365),
	}
	runningStreak := 0
	for i := 0; i < 365; i++ {
		dateStr := startDay.AddDate(0, 0, i).Format("2006-01-02")
		item, ok := byDate[dateStr]
		if !ok {
			item = protocol.HeatmapDay{Date: dateStr}
		}
		out.Days = append(out.Days, item)
		out.TotalBytes += item.TotalBytes
		if item.TotalBytes > 0 {
			out.ActiveDays++
			runningStreak++
			if runningStreak > out.LongestStreak {
				out.LongestStreak = runningStreak
			}
		} else {
			runningStreak = 0
		}
		if item.TotalBytes > out.PeakBytes {
			out.PeakBytes = item.TotalBytes
			out.PeakDay = dateStr
		}
	}

	// Current streak walks backwards from today (allowing today to still be 0 if yesterday was active).
	curStreak := 0
	idx := len(out.Days) - 1
	if idx >= 0 && out.Days[idx].TotalBytes == 0 {
		idx--
	}
	for idx >= 0 && out.Days[idx].TotalBytes > 0 {
		curStreak++
		idx--
	}
	out.CurrentStreak = curStreak
	if out.ActiveDays > 0 {
		out.DailyAvgBytes = out.TotalBytes / int64(out.ActiveDays)
	}
	return out, nil
}

// GetTimeseries builds aligned stacked series grouped by process, domain, device, node, or direction.
func (s *Store) GetTimeseries(ctx context.Context, rawFilter AnalyticsFilter, extraProcess string, extraDomain string) (protocol.TimeseriesResponse, error) {
	now := time.Now().Unix()
	f := normalizeFilter(rawFilter, now)
	interval := chooseTotalInterval(f)
	f.Interval = interval

	out := protocol.TimeseriesResponse{
		Interval: interval,
		GroupBy:  f.GroupBy,
	}

	stepSec := int64(3600)
	switch interval {
	case "minute":
		stepSec = 60
	case "day":
		stepSec = 86400
	}

	tzSec := int64(f.TZOffsetMin * 60)
	alignBucket := func(ts int64) int64 {
		if interval == "day" {
			local := ts + tzSec
			return (local/86400)*86400 - tzSec
		}
		return (ts / stepSec) * stepSec
	}

	startBucket := alignBucket(f.From)
	endBucket := alignBucket(f.To)
	var timestamps []int64
	for cur := startBucket; cur <= endBucket; cur += stepSec {
		timestamps = append(timestamps, cur)
		if len(timestamps) >= 1500 {
			break
		}
	}
	if len(timestamps) == 0 {
		timestamps = []int64{startBucket}
	}
	out.Timestamps = timestamps
	tsIndex := make(map[int64]int, len(timestamps))
	for i, ts := range timestamps {
		tsIndex[ts] = i
	}

	if strings.ToLower(f.GroupBy) == "direction" && extraProcess == "" && extraDomain == "" {
		return s.getDirectionTimeseries(ctx, f, out, stepSec, tzSec, tsIndex)
	}

	table, tsCol, _ := chooseFlowSource(f, now)
	align := int64(3600)
	if table == "traffic_minute_flows" {
		align = 60
	}
	where, args := buildFlowWhere(f, tsCol, align, "", "")
	if extraProcess != "" {
		where += " AND process_display = ?"
		args = append(args, extraProcess)
	}
	if extraDomain != "" {
		where += " AND root_domain = ?"
		args = append(args, extraDomain)
	}

	if strings.ToLower(f.GroupBy) == "direction" {
		bucketExpr := fmt.Sprintf("(%s / %d) * %d", tsCol, stepSec, stepSec)
		if interval == "day" {
			bucketExpr = fmt.Sprintf("((%s + %d) / 86400) * 86400 - %d", tsCol, tzSec, tzSec)
		}
		q := fmt.Sprintf(`SELECT %s AS b, COALESCE(SUM(down_bytes), 0), COALESCE(SUM(up_bytes), 0)
			FROM %s WHERE %s GROUP BY b`, bucketExpr, table, where)
		rows, err := s.db.QueryContext(ctx, q, args...)
		if err != nil {
			return out, err
		}
		defer rows.Close()
		downVals := make([]int64, len(timestamps))
		upVals := make([]int64, len(timestamps))
		var downTot, upTot int64
		for rows.Next() {
			var b, d, u int64
			if err := rows.Scan(&b, &d, &u); err != nil {
				return out, err
			}
			if idx, ok := tsIndex[b]; ok {
				downVals[idx] += d
				upVals[idx] += u
			}
			downTot += d
			upTot += u
		}
		out.TotalBytes = downTot + upTot
		out.Series = []protocol.TimeseriesSeries{
			{Name: "下行 (Download)", Total: downTot, Values: downVals},
			{Name: "上行 (Upload)", Total: upTot, Values: upVals},
		}
		return out, rows.Err()
	}

	// Resolve device display names if group_by == device
	devNames := map[string]string{}
	if strings.ToLower(f.GroupBy) == "device" {
		if devs, err := s.ListDevices(ctx, f.TZOffsetMin, f.OnlineThresholdSec); err == nil {
			for _, d := range devs {
				devNames[d.ID] = d.Name
			}
		}
	}

	dimExpr := "process_display"
	switch strings.ToLower(f.GroupBy) {
	case "domain":
		dimExpr = "root_domain"
	case "device":
		dimExpr = "device_id"
	case "node":
		dimExpr = "egress_node"
	}

	bucketExpr := fmt.Sprintf("(%s / %d) * %d", tsCol, stepSec, stepSec)
	if interval == "day" {
		bucketExpr = fmt.Sprintf("((%s + %d) / 86400) * 86400 - %d", tsCol, tzSec, tzSec)
	}

	q := fmt.Sprintf(`SELECT %s AS b, %s AS dim, COALESCE(SUM(up_bytes + down_bytes), 0) AS total_b
		FROM %s WHERE %s GROUP BY b, dim`, bucketExpr, dimExpr, table, where)
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()

	dimTotals := make(map[string]int64)
	dimBuckets := make(map[string]map[int64]int64)
	for rows.Next() {
		var b, val int64
		var dim string
		if err := rows.Scan(&b, &dim, &val); err != nil {
			return out, err
		}
		if val <= 0 {
			continue
		}
		dimTotals[dim] += val
		out.TotalBytes += val
		m, ok := dimBuckets[dim]
		if !ok {
			m = make(map[int64]int64)
			dimBuckets[dim] = m
		}
		m[b] += val
	}
	if err := rows.Err(); err != nil {
		return out, err
	}

	type dimPair struct {
		name  string
		total int64
	}
	pairs := make([]dimPair, 0, len(dimTotals))
	for k, v := range dimTotals {
		pairs = append(pairs, dimPair{name: k, total: v})
	}
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].total == pairs[j].total {
			return pairs[i].name < pairs[j].name
		}
		return pairs[i].total > pairs[j].total
	})

	const maxTop = 7
	topCount := len(pairs)
	if topCount > maxTop {
		topCount = maxTop
	}

	settings, _ := s.GetSettings(ctx)
	series := make([]protocol.TimeseriesSeries, 0, topCount+1)
	for i := 0; i < topCount; i++ {
		dim := pairs[i].name
		vals := make([]int64, len(timestamps))
		for b, v := range dimBuckets[dim] {
			if idx, ok := tsIndex[b]; ok {
				vals[idx] += v
			}
		}
		label := dim
		if f.GroupBy == "device" {
			if dn, ok := devNames[dim]; ok {
				label = dn
			}
		} else if f.GroupBy == "domain" {
			if tag := resolveServiceTag(dim, "", settings.DomainAliases); tag != "" {
				label = fmt.Sprintf("%s (%s)", dim, tag)
			}
		}
		series = append(series, protocol.TimeseriesSeries{
			Name:   dim,
			Label:  label,
			Total:  pairs[i].total,
			Values: vals,
		})
	}

	if len(pairs) > maxTop {
		otherVals := make([]int64, len(timestamps))
		var otherTot int64
		for i := maxTop; i < len(pairs); i++ {
			dim := pairs[i].name
			otherTot += pairs[i].total
			for b, v := range dimBuckets[dim] {
				if idx, ok := tsIndex[b]; ok {
					otherVals[idx] += v
				}
			}
		}
		series = append(series, protocol.TimeseriesSeries{
			Name:   "其他",
			Label:  "其他",
			Total:  otherTot,
			Values: otherVals,
		})
	}

	out.Series = series
	return out, nil
}

func (s *Store) getDirectionTimeseries(ctx context.Context, f AnalyticsFilter, out protocol.TimeseriesResponse, stepSec, tzSec int64, tsIndex map[int64]int) (protocol.TimeseriesResponse, error) {
	now := time.Now().Unix()
	if out.Interval == "day" && f.From < now-90*86400 {
		startDate := formatDayDate(f.From, f.TZOffsetMin)
		endDate := formatDayDate(f.To, f.TZOffsetMin)
		var downExpr, upExpr string
		switch strings.ToLower(f.Scope) {
		case "proxy":
			downExpr = "COALESCE(SUM(proxy_down), 0)"
			upExpr = "COALESCE(SUM(proxy_up), 0)"
		case "direct":
			downExpr = "COALESCE(SUM(direct_down), 0)"
			upExpr = "COALESCE(SUM(direct_up), 0)"
		default:
			downExpr = "COALESCE(SUM(proxy_down + direct_down), 0)"
			upExpr = "COALESCE(SUM(proxy_up + direct_up), 0)"
		}
		q := fmt.Sprintf(`SELECT day_date, %s, %s FROM traffic_daily_summary WHERE day_date >= ? AND day_date <= ?`, downExpr, upExpr)
		args := []any{startDate, endDate}
		if f.DeviceID != "" && f.DeviceID != "all" {
			q += ` AND device_id = ?`
			args = append(args, f.DeviceID)
		}
		q += ` GROUP BY day_date`
		rows, err := s.db.QueryContext(ctx, q, args...)
		if err != nil {
			return out, err
		}
		defer rows.Close()
		loc := fixedLoc(f.TZOffsetMin)
		downVals := make([]int64, len(out.Timestamps))
		upVals := make([]int64, len(out.Timestamps))
		var downTot, upTot int64
		for rows.Next() {
			var dateStr string
			var d, u int64
			if err := rows.Scan(&dateStr, &d, &u); err != nil {
				return out, err
			}
			if parsed, err := time.ParseInLocation("2006-01-02", dateStr, loc); err == nil {
				if idx, ok := tsIndex[parsed.Unix()]; ok {
					downVals[idx] += d
					upVals[idx] += u
				}
			}
			downTot += d
			upTot += u
		}
		out.TotalBytes = downTot + upTot
		out.Series = []protocol.TimeseriesSeries{
			{Name: "下行 (Download)", Total: downTot, Values: downVals},
			{Name: "上行 (Upload)", Total: upTot, Values: upVals},
		}
		return out, rows.Err()
	}

	bucketExpr := fmt.Sprintf("(bucket_ts / %d) * %d", stepSec, stepSec)
	if out.Interval == "day" {
		bucketExpr = fmt.Sprintf("((bucket_ts + %d) / 86400) * 86400 - %d", tzSec, tzSec)
	}
	var downExpr, upExpr string
	switch strings.ToLower(f.Scope) {
	case "proxy":
		downExpr = "COALESCE(SUM(proxy_down), 0)"
		upExpr = "COALESCE(SUM(proxy_up), 0)"
	case "direct":
		downExpr = "COALESCE(SUM(direct_down + unattributed_down), 0)"
		upExpr = "COALESCE(SUM(direct_up + unattributed_up), 0)"
	default:
		downExpr = "COALESCE(SUM(proxy_down + direct_down + unattributed_down), 0)"
		upExpr = "COALESCE(SUM(proxy_up + direct_up + unattributed_up), 0)"
	}
	q := fmt.Sprintf(`SELECT %s AS b, %s, %s FROM traffic_minute_totals WHERE bucket_ts >= ? AND bucket_ts <= ?`, bucketExpr, downExpr, upExpr)
	args := []any{f.From - (f.From % 60), f.To}
	if f.DeviceID != "" && f.DeviceID != "all" {
		q += ` AND device_id = ?`
		args = append(args, f.DeviceID)
	}
	q += ` GROUP BY b`

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()

	downVals := make([]int64, len(out.Timestamps))
	upVals := make([]int64, len(out.Timestamps))
	var downTot, upTot int64
	for rows.Next() {
		var b, d, u int64
		if err := rows.Scan(&b, &d, &u); err != nil {
			return out, err
		}
		if idx, ok := tsIndex[b]; ok {
			downVals[idx] += d
			upVals[idx] += u
		}
		downTot += d
		upTot += u
	}
	out.TotalBytes = downTot + upTot
	out.Series = []protocol.TimeseriesSeries{
		{Name: "下行 (Download)", Total: downTot, Values: downVals},
		{Name: "上行 (Upload)", Total: upTot, Values: upVals},
	}
	return out, rows.Err()
}

// GetBursts returns the highest-volume (bucket, device, process, domain) spikes within range.
func (s *Store) GetBursts(ctx context.Context, rawFilter AnalyticsFilter) (protocol.BurstsResponse, error) {
	now := time.Now().Unix()
	f := normalizeFilter(rawFilter, now)
	settings, _ := s.GetSettings(ctx)
	devs, _ := s.ListDevices(ctx, f.TZOffsetMin, f.OnlineThresholdSec)
	devNames := make(map[string]string, len(devs))
	for _, d := range devs {
		devNames[d.ID] = d.Name
	}

	table, tsCol, isMinute := chooseFlowSource(f, now)
	align := int64(3600)
	granularity := "hour"
	if isMinute {
		align = 60
		granularity = "minute"
	}
	where, args := buildFlowWhere(f, tsCol, align, "", "")
	limit := f.Limit
	if limit <= 0 || limit > 30 {
		limit = 12
	}

	q := fmt.Sprintf(`
		SELECT %s AS b, device_id, process_display, root_domain, MAX(service_tag),
		       egress_node, route_type, inbound_mode,
		       SUM(up_bytes) AS up_b, SUM(down_bytes) AS down_b, SUM(up_bytes + down_bytes) AS tot_b
		FROM %s
		WHERE %s
		GROUP BY b, device_id, process_display, root_domain, egress_node, route_type, inbound_mode
		ORDER BY tot_b DESC
		LIMIT ?
	`, tsCol, table, where)
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return protocol.BurstsResponse{}, err
	}
	defer rows.Close()

	items := make([]protocol.BurstEvent, 0, limit)
	for rows.Next() {
		var ev protocol.BurstEvent
		if err := rows.Scan(
			&ev.BucketTS, &ev.DeviceID, &ev.ProcessDisplay, &ev.RootDomain, &ev.ServiceTag,
			&ev.EgressNode, &ev.RouteType, &ev.InboundMode,
			&ev.UpBytes, &ev.DownBytes, &ev.TotalBytes,
		); err != nil {
			return protocol.BurstsResponse{}, err
		}
		ev.Granularity = granularity
		ev.DeviceName = devNames[ev.DeviceID]
		if ev.DeviceName == "" {
			ev.DeviceName = ev.DeviceID
		}
		ev.ServiceTag = resolveServiceTag(ev.RootDomain, ev.ServiceTag, settings.DomainAliases)
		items = append(items, ev)
	}
	return protocol.BurstsResponse{Items: items}, rows.Err()
}

// ListApps returns ranked application processes and their top accessed domains.
func (s *Store) ListApps(ctx context.Context, rawFilter AnalyticsFilter) (protocol.AppsListResponse, error) {
	now := time.Now().Unix()
	f := normalizeFilter(rawFilter, now)
	settings, _ := s.GetSettings(ctx)
	table, tsCol, isMinute := chooseFlowSource(f, now)
	align := int64(3600)
	if isMinute {
		align = 60
	}
	where, args := buildFlowWhere(f, tsCol, align, "", "")
	if f.Search != "" {
		where += " AND (LOWER(process_display) LIKE ? OR LOWER(process_name) LIKE ?)"
		like := "%" + strings.ToLower(strings.TrimSpace(f.Search)) + "%"
		args = append(args, like, like)
	}

	q := fmt.Sprintf(`
		SELECT
			process_display,
			MAX(process_name),
			SUM(up_bytes + down_bytes) AS total_b,
			SUM(CASE WHEN route_type = 'PROXY' THEN up_bytes + down_bytes ELSE 0 END),
			SUM(CASE WHEN route_type = 'DIRECT' THEN up_bytes + down_bytes ELSE 0 END),
			SUM(CASE WHEN route_type = 'REJECT' THEN up_bytes + down_bytes ELSE 0 END),
			SUM(up_bytes),
			SUM(down_bytes),
			SUM(CASE WHEN inbound_mode = 'TUN' THEN up_bytes + down_bytes ELSE 0 END),
			SUM(CASE WHEN inbound_mode = 'PROXY_PORT' THEN up_bytes + down_bytes ELSE 0 END),
			SUM(conn_count),
			COUNT(DISTINCT root_domain)
		FROM %s
		WHERE %s
		GROUP BY process_display
		ORDER BY total_b DESC
		LIMIT ?
	`, table, where)
	args = append(args, f.Limit)

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return protocol.AppsListResponse{}, err
	}
	defer rows.Close()

	var totalAll int64
	items := make([]protocol.AppSummaryItem, 0)
	for rows.Next() {
		var it protocol.AppSummaryItem
		if err := rows.Scan(
			&it.ProcessDisplay, &it.ProcessName,
			&it.TotalBytes, &it.ProxyBytes, &it.DirectBytes, &it.RejectBytes,
			&it.UpBytes, &it.DownBytes, &it.TunBytes, &it.ProxyPortBytes,
			&it.ConnCount, &it.DomainCount,
		); err != nil {
			return protocol.AppsListResponse{}, err
		}
		totalAll += it.TotalBytes
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return protocol.AppsListResponse{}, err
	}

	// Fetch top domains per listed process in one query
	if len(items) > 0 {
		baseWhere, baseArgs := buildFlowWhere(f, tsCol, align, "", "")
		domQ := fmt.Sprintf(`
			SELECT process_display, root_domain, MAX(service_tag), SUM(up_bytes + down_bytes) AS total_b
			FROM %s
			WHERE %s
			GROUP BY process_display, root_domain
			ORDER BY process_display, total_b DESC
		`, table, baseWhere)
		domRows, err := s.db.QueryContext(ctx, domQ, baseArgs...)
		if err == nil {
			defer domRows.Close()
			topByProc := make(map[string][]protocol.AppDomainBrief)
			for domRows.Next() {
				var proc, dom, tag string
				var b int64
				if err := domRows.Scan(&proc, &dom, &tag, &b); err == nil {
					if len(topByProc[proc]) < 3 {
						topByProc[proc] = append(topByProc[proc], protocol.AppDomainBrief{
							RootDomain: dom,
							ServiceTag: resolveServiceTag(dom, tag, settings.DomainAliases),
							TotalBytes: b,
						})
					}
				}
			}
			for i := range items {
				items[i].SharePct = calcSharePct(items[i].TotalBytes, totalAll)
				items[i].TopDomains = topByProc[items[i].ProcessDisplay]
				if items[i].TopDomains == nil {
					items[i].TopDomains = []protocol.AppDomainBrief{}
				}
			}
		}
	}

	return protocol.AppsListResponse{
		TotalBytes: totalAll,
		Items:      items,
	}, nil
}

// GetAppDetail returns full Website/Domain attribution, timeline, Sankey graph, and expandable subdomains for an app.
func (s *Store) GetAppDetail(ctx context.Context, rawFilter AnalyticsFilter, processDisplay string) (protocol.AppDetailResponse, error) {
	now := time.Now().Unix()
	f := normalizeFilter(rawFilter, now)
	settings, _ := s.GetSettings(ctx)
	table, tsCol, isMinute := chooseFlowSource(f, now)
	align := int64(3600)
	if isMinute {
		align = 60
	}
	where, args := buildFlowWhere(f, tsCol, align, "process_display", processDisplay)

	q := fmt.Sprintf(`
		SELECT
			root_domain, MAX(service_tag), host, egress_node, MAX(proxy_group),
			route_type, inbound_mode, MAX(rule),
			SUM(up_bytes) AS up_b, SUM(down_bytes) AS down_b, SUM(conn_count) AS conns
		FROM %s
		WHERE %s
		GROUP BY root_domain, host, egress_node, route_type, inbound_mode
		ORDER BY (up_b + down_b) DESC
	`, table, where)

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return protocol.AppDetailResponse{}, err
	}
	defer rows.Close()

	summary := protocol.AppSummaryItem{
		ProcessDisplay: processDisplay,
		ProcessName:    processDisplay,
	}

	domMap := make(map[string]*protocol.AppRootDomainGroup)
	domEgressMap := make(map[string]map[string]int64) // rootDomain -> egressLabel -> bytes

	for rows.Next() {
		var rootDom, tag, host, egress, group, route, inbound, rule string
		var upB, downB, conns int64
		if err := rows.Scan(&rootDom, &tag, &host, &egress, &group, &route, &inbound, &rule, &upB, &downB, &conns); err != nil {
			return protocol.AppDetailResponse{}, err
		}
		tot := upB + downB
		if tot <= 0 {
			continue
		}
		tag = resolveServiceTag(rootDom, tag, settings.DomainAliases)

		summary.TotalBytes += tot
		summary.UpBytes += upB
		summary.DownBytes += downB
		summary.ConnCount += conns
		switch route {
		case protocol.RouteProxy:
			summary.ProxyBytes += tot
		case protocol.RouteDirect:
			summary.DirectBytes += tot
		case protocol.RouteReject:
			summary.RejectBytes += tot
		}
		if inbound == protocol.InboundTUN {
			summary.TunBytes += tot
		} else if inbound == protocol.InboundProxyPort {
			summary.ProxyPortBytes += tot
		}

		grp, ok := domMap[rootDom]
		if !ok {
			grp = &protocol.AppRootDomainGroup{
				RootDomain: rootDom,
				ServiceTag: tag,
			}
			domMap[rootDom] = grp
		} else if grp.ServiceTag == "" && tag != "" {
			grp.ServiceTag = tag
		}
		grp.TotalBytes += tot
		grp.UpBytes += upB
		grp.DownBytes += downB
		grp.ConnCount += conns
		if route == protocol.RouteProxy {
			grp.ProxyBytes += tot
		} else if route == protocol.RouteDirect {
			grp.DirectBytes += tot
		}
		if inbound == protocol.InboundTUN {
			grp.TunBytes += tot
		}

		grp.Subdomains = append(grp.Subdomains, protocol.SubdomainFlowRow{
			Host:        host,
			EgressNode:  egress,
			ProxyGroup:  group,
			RouteType:   route,
			InboundMode: inbound,
			Rule:        rule,
			UpBytes:     upB,
			DownBytes:   downB,
			TotalBytes:  tot,
			ConnCount:   conns,
		})

		egLabel := egress
		if route == protocol.RouteDirect {
			egLabel = "DIRECT"
		} else if route == protocol.RouteReject {
			egLabel = "REJECT"
		}
		if domEgressMap[rootDom] == nil {
			domEgressMap[rootDom] = make(map[string]int64)
		}
		domEgressMap[rootDom][egLabel] += tot
	}
	if err := rows.Err(); err != nil {
		return protocol.AppDetailResponse{}, err
	}

	rootDomains := make([]protocol.AppRootDomainGroup, 0, len(domMap))
	for _, g := range domMap {
		g.SharePct = calcSharePct(g.TotalBytes, summary.TotalBytes)
		sort.Slice(g.Subdomains, func(i, j int) bool {
			return g.Subdomains[i].TotalBytes > g.Subdomains[j].TotalBytes
		})
		rootDomains = append(rootDomains, *g)
	}
	sort.Slice(rootDomains, func(i, j int) bool {
		return rootDomains[i].TotalBytes > rootDomains[j].TotalBytes
	})
	summary.DomainCount = len(rootDomains)

	// Build timeline for this process (grouped by domain)
	tlFilter := f
	tlFilter.GroupBy = "domain"
	timeline, err := s.GetTimeseries(ctx, tlFilter, processDisplay, "")
	if err != nil {
		return protocol.AppDetailResponse{}, err
	}

	sankey := buildAppSankey(processDisplay, rootDomains, domEgressMap)

	return protocol.AppDetailResponse{
		ProcessDisplay: processDisplay,
		Summary:        summary,
		Timeline:       timeline,
		Sankey:         sankey,
		RootDomains:    rootDomains,
	}, nil
}

func buildAppSankey(processDisplay string, rootDomains []protocol.AppRootDomainGroup, domEgressMap map[string]map[string]int64) protocol.SankeyGraph {
	graph := protocol.SankeyGraph{
		Nodes: []protocol.SankeyNode{},
		Links: []protocol.SankeyLink{},
	}
	if len(rootDomains) == 0 {
		return graph
	}

	appNode := "app:" + processDisplay
	nodeSet := map[string]bool{appNode: true}
	graph.Nodes = append(graph.Nodes, protocol.SankeyNode{Name: appNode, Stage: "app"})

	// Top 8 root domains; fold rest into "其他网站"
	const maxDom = 8
	egressTotals := make(map[string]int64)
	for _, d := range rootDomains {
		for eg, b := range domEgressMap[d.RootDomain] {
			egressTotals[eg] += b
		}
	}
	type egPair struct {
		name  string
		bytes int64
	}
	var egPairs []egPair
	for k, v := range egressTotals {
		egPairs = append(egPairs, egPair{name: k, bytes: v})
	}
	sort.Slice(egPairs, func(i, j int) bool { return egPairs[i].bytes > egPairs[j].bytes })
	topEgress := make(map[string]bool)
	for i := 0; i < len(egPairs) && i < 6; i++ {
		topEgress[egPairs[i].name] = true
	}

	addNode := func(name, stage string) {
		if !nodeSet[name] {
			nodeSet[name] = true
			graph.Nodes = append(graph.Nodes, protocol.SankeyNode{Name: name, Stage: stage})
		}
	}

	var otherDomBytes int64
	otherDomEgress := make(map[string]int64)

	for i, d := range rootDomains {
		if i < maxDom {
			domNode := "dom:" + d.RootDomain
			addNode(domNode, "domain")
			graph.Links = append(graph.Links, protocol.SankeyLink{
				Source: appNode,
				Target: domNode,
				Value:  d.TotalBytes,
			})

			foldedEgress := make(map[string]int64)
			for eg, b := range domEgressMap[d.RootDomain] {
				targetEg := eg
				if !topEgress[eg] {
					targetEg = "其他节点"
				}
				foldedEgress[targetEg] += b
			}
			for eg, b := range foldedEgress {
				egNode := "eg:" + eg
				addNode(egNode, "egress")
				graph.Links = append(graph.Links, protocol.SankeyLink{
					Source: domNode,
					Target: egNode,
					Value:  b,
				})
			}
		} else {
			otherDomBytes += d.TotalBytes
			for eg, b := range domEgressMap[d.RootDomain] {
				targetEg := eg
				if !topEgress[eg] {
					targetEg = "其他节点"
				}
				otherDomEgress[targetEg] += b
			}
		}
	}

	if otherDomBytes > 0 {
		otherDomNode := "dom:其他网站"
		addNode(otherDomNode, "domain")
		graph.Links = append(graph.Links, protocol.SankeyLink{
			Source: appNode,
			Target: otherDomNode,
			Value:  otherDomBytes,
		})
		for eg, b := range otherDomEgress {
			egNode := "eg:" + eg
			addNode(egNode, "egress")
			graph.Links = append(graph.Links, protocol.SankeyLink{
				Source: otherDomNode,
				Target: egNode,
				Value:  b,
			})
		}
	}
	return graph
}

// ListDomains returns ranked root domains and top accessing apps.
func (s *Store) ListDomains(ctx context.Context, rawFilter AnalyticsFilter) (protocol.DomainsListResponse, error) {
	now := time.Now().Unix()
	f := normalizeFilter(rawFilter, now)
	settings, _ := s.GetSettings(ctx)
	table, tsCol, isMinute := chooseFlowSource(f, now)
	align := int64(3600)
	if isMinute {
		align = 60
	}
	where, args := buildFlowWhere(f, tsCol, align, "", "")
	if f.Search != "" {
		where += " AND (LOWER(root_domain) LIKE ? OR LOWER(service_tag) LIKE ?)"
		like := "%" + strings.ToLower(strings.TrimSpace(f.Search)) + "%"
		args = append(args, like, like)
	}

	q := fmt.Sprintf(`
		SELECT
			root_domain, MAX(service_tag),
			SUM(up_bytes + down_bytes) AS total_b,
			SUM(CASE WHEN route_type = 'PROXY' THEN up_bytes + down_bytes ELSE 0 END),
			SUM(CASE WHEN route_type = 'DIRECT' THEN up_bytes + down_bytes ELSE 0 END),
			SUM(up_bytes), SUM(down_bytes),
			SUM(CASE WHEN inbound_mode = 'TUN' THEN up_bytes + down_bytes ELSE 0 END),
			SUM(conn_count),
			COUNT(DISTINCT process_display)
		FROM %s
		WHERE %s
		GROUP BY root_domain
		ORDER BY total_b DESC
		LIMIT ?
	`, table, where)
	args = append(args, f.Limit)

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return protocol.DomainsListResponse{}, err
	}
	defer rows.Close()

	var totalAll int64
	items := make([]protocol.DomainSummaryItem, 0)
	for rows.Next() {
		var it protocol.DomainSummaryItem
		if err := rows.Scan(
			&it.RootDomain, &it.ServiceTag,
			&it.TotalBytes, &it.ProxyBytes, &it.DirectBytes,
			&it.UpBytes, &it.DownBytes, &it.TunBytes,
			&it.ConnCount, &it.AppCount,
		); err != nil {
			return protocol.DomainsListResponse{}, err
		}
		it.ServiceTag = resolveServiceTag(it.RootDomain, it.ServiceTag, settings.DomainAliases)
		totalAll += it.TotalBytes
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return protocol.DomainsListResponse{}, err
	}

	if len(items) > 0 {
		baseWhere, baseArgs := buildFlowWhere(f, tsCol, align, "", "")
		appQ := fmt.Sprintf(`
			SELECT root_domain, process_display, SUM(up_bytes + down_bytes) AS total_b
			FROM %s
			WHERE %s
			GROUP BY root_domain, process_display
			ORDER BY root_domain, total_b DESC
		`, table, baseWhere)
		appRows, err := s.db.QueryContext(ctx, appQ, baseArgs...)
		if err == nil {
			defer appRows.Close()
			topByDom := make(map[string][]protocol.DomainAppBrief)
			for appRows.Next() {
				var dom, proc string
				var b int64
				if err := appRows.Scan(&dom, &proc, &b); err == nil {
					if len(topByDom[dom]) < 3 {
						topByDom[dom] = append(topByDom[dom], protocol.DomainAppBrief{
							ProcessDisplay: proc,
							TotalBytes:     b,
						})
					}
				}
			}
			for i := range items {
				items[i].SharePct = calcSharePct(items[i].TotalBytes, totalAll)
				items[i].TopApps = topByDom[items[i].RootDomain]
				if items[i].TopApps == nil {
					items[i].TopApps = []protocol.DomainAppBrief{}
				}
			}
		}
	}

	return protocol.DomainsListResponse{
		TotalBytes: totalAll,
		Items:      items,
	}, nil
}

// GetDomainDetail answers which apps and subdomains generated traffic for a root domain.
func (s *Store) GetDomainDetail(ctx context.Context, rawFilter AnalyticsFilter, rootDomain string) (protocol.DomainDetailResponse, error) {
	now := time.Now().Unix()
	f := normalizeFilter(rawFilter, now)
	settings, _ := s.GetSettings(ctx)
	table, tsCol, isMinute := chooseFlowSource(f, now)
	align := int64(3600)
	if isMinute {
		align = 60
	}
	where, args := buildFlowWhere(f, tsCol, align, "root_domain", rootDomain)

	q := fmt.Sprintf(`
		SELECT
			process_display, MAX(service_tag), host, egress_node, MAX(proxy_group),
			route_type, inbound_mode, MAX(rule),
			SUM(up_bytes) AS up_b, SUM(down_bytes) AS down_b, SUM(conn_count) AS conns
		FROM %s
		WHERE %s
		GROUP BY process_display, host, egress_node, route_type, inbound_mode
		ORDER BY (up_b + down_b) DESC
	`, table, where)

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return protocol.DomainDetailResponse{}, err
	}
	defer rows.Close()

	summary := protocol.DomainSummaryItem{RootDomain: rootDomain}
	appMap := make(map[string]*protocol.DomainAppRow)

	for rows.Next() {
		var proc, tag, host, egress, group, route, inbound, rule string
		var upB, downB, conns int64
		if err := rows.Scan(&proc, &tag, &host, &egress, &group, &route, &inbound, &rule, &upB, &downB, &conns); err != nil {
			return protocol.DomainDetailResponse{}, err
		}
		tot := upB + downB
		if tot <= 0 {
			continue
		}
		if summary.ServiceTag == "" && tag != "" {
			summary.ServiceTag = tag
		}
		summary.TotalBytes += tot
		summary.UpBytes += upB
		summary.DownBytes += downB
		summary.ConnCount += conns
		if route == protocol.RouteProxy {
			summary.ProxyBytes += tot
		} else if route == protocol.RouteDirect {
			summary.DirectBytes += tot
		}
		if inbound == protocol.InboundTUN {
			summary.TunBytes += tot
		}

		ar, ok := appMap[proc]
		if !ok {
			ar = &protocol.DomainAppRow{ProcessDisplay: proc}
			appMap[proc] = ar
		}
		ar.TotalBytes += tot
		ar.UpBytes += upB
		ar.DownBytes += downB
		ar.ConnCount += conns
		if route == protocol.RouteProxy {
			ar.ProxyBytes += tot
		} else if route == protocol.RouteDirect {
			ar.DirectBytes += tot
		}
		if inbound == protocol.InboundTUN {
			ar.TunBytes += tot
		}
		ar.Subdomains = append(ar.Subdomains, protocol.SubdomainFlowRow{
			Host:        host,
			EgressNode:  egress,
			ProxyGroup:  group,
			RouteType:   route,
			InboundMode: inbound,
			Rule:        rule,
			UpBytes:     upB,
			DownBytes:   downB,
			TotalBytes:  tot,
			ConnCount:   conns,
		})
	}
	if err := rows.Err(); err != nil {
		return protocol.DomainDetailResponse{}, err
	}

	summary.ServiceTag = resolveServiceTag(rootDomain, summary.ServiceTag, settings.DomainAliases)
	apps := make([]protocol.DomainAppRow, 0, len(appMap))
	for _, ar := range appMap {
		ar.SharePct = calcSharePct(ar.TotalBytes, summary.TotalBytes)
		sort.Slice(ar.Subdomains, func(i, j int) bool {
			return ar.Subdomains[i].TotalBytes > ar.Subdomains[j].TotalBytes
		})
		apps = append(apps, *ar)
	}
	sort.Slice(apps, func(i, j int) bool {
		return apps[i].TotalBytes > apps[j].TotalBytes
	})
	summary.AppCount = len(apps)

	tlFilter := f
	tlFilter.GroupBy = "process"
	timeline, err := s.GetTimeseries(ctx, tlFilter, "", rootDomain)
	if err != nil {
		return protocol.DomainDetailResponse{}, err
	}

	return protocol.DomainDetailResponse{
		RootDomain: rootDomain,
		ServiceTag: summary.ServiceTag,
		Summary:    summary,
		Timeline:   timeline,
		Apps:       apps,
	}, nil
}

// GetNodesAnalytics returns route distribution, node billing breakdown, rule distribution, and proxy audit findings.
func (s *Store) GetNodesAnalytics(ctx context.Context, rawFilter AnalyticsFilter) (protocol.NodesAnalyticsResponse, error) {
	now := time.Now().Unix()
	f := normalizeFilter(rawFilter, now)
	settings, err := s.GetSettings(ctx)
	if err != nil {
		return protocol.NodesAnalyticsResponse{}, err
	}
	table, tsCol, isMinute := chooseFlowSource(f, now)
	align := int64(3600)
	if isMinute {
		align = 60
	}
	where, args := buildFlowWhere(f, tsCol, align, "", "")

	out := protocol.NodesAnalyticsResponse{
		RouteSplit: []protocol.RouteSplitItem{},
		Nodes:      []protocol.NodeUsageItem{},
		Rules:      []protocol.RuleUsageItem{},
		ProxyAudit: []protocol.ProxyAuditItem{},
	}

	// 1. Route split
	rRows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT route_type, SUM(up_bytes) AS up_b, SUM(down_bytes) AS down_b, SUM(up_bytes + down_bytes) AS tot_b
		FROM %s WHERE %s GROUP BY route_type ORDER BY tot_b DESC
	`, table, where), args...)
	if err != nil {
		return out, err
	}
	for rRows.Next() {
		var rs protocol.RouteSplitItem
		if err := rRows.Scan(&rs.RouteType, &rs.UpBytes, &rs.DownBytes, &rs.TotalBytes); err != nil {
			rRows.Close()
			return out, err
		}
		out.TotalBytes += rs.TotalBytes
		out.RouteSplit = append(out.RouteSplit, rs)
	}
	rRows.Close()
	for i := range out.RouteSplit {
		out.RouteSplit[i].SharePct = calcSharePct(out.RouteSplit[i].TotalBytes, out.TotalBytes)
	}

	// 2. Nodes with multiplier billing
	nRows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT egress_node, MAX(proxy_group), route_type,
		       SUM(up_bytes), SUM(down_bytes), SUM(up_bytes + down_bytes) AS tot_b, SUM(conn_count)
		FROM %s WHERE %s
		GROUP BY egress_node, route_type
		ORDER BY tot_b DESC
		LIMIT 50
	`, table, where), args...)
	if err != nil {
		return out, err
	}
	for nRows.Next() {
		var nu protocol.NodeUsageItem
		if err := nRows.Scan(&nu.EgressNode, &nu.ProxyGroup, &nu.RouteType, &nu.UpBytes, &nu.DownBytes, &nu.RawBytes, &nu.ConnCount); err != nil {
			nRows.Close()
			return out, err
		}
		mult := 1.0
		if nu.RouteType == protocol.RouteProxy {
			mult = matchMultiplier(nu.EgressNode, settings.NodeMultipliers)
		}
		nu.Multiplier = mult
		nu.BilledBytes = int64(math.Round(float64(nu.RawBytes) * mult))
		nu.SharePct = calcSharePct(nu.RawBytes, out.TotalBytes)
		out.Nodes = append(out.Nodes, nu)
	}
	nRows.Close()

	// 3. Top rules
	ruRows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT CASE WHEN rule = '' THEN '(未标注规则)' ELSE rule END AS r_name,
		       route_type, SUM(up_bytes + down_bytes) AS tot_b, SUM(conn_count)
		FROM %s WHERE %s
		GROUP BY r_name, route_type
		ORDER BY tot_b DESC
		LIMIT 25
	`, table, where), args...)
	if err != nil {
		return out, err
	}
	for ruRows.Next() {
		var ru protocol.RuleUsageItem
		if err := ruRows.Scan(&ru.Rule, &ru.RouteType, &ru.TotalBytes, &ru.ConnCount); err != nil {
			ruRows.Close()
			return out, err
		}
		ru.SharePct = calcSharePct(ru.TotalBytes, out.TotalBytes)
		out.Rules = append(out.Rules, ru)
	}
	ruRows.Close()

	// 4. Proxy Audit (top heavy flows going through PROXY)
	proxyFilter := f
	proxyFilter.Scope = "proxy"
	pWhere, pArgs := buildFlowWhere(proxyFilter, tsCol, align, "", "")
	paRows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT process_display, root_domain, MAX(service_tag), MAX(rule), egress_node, inbound_mode,
		       SUM(up_bytes + down_bytes) AS tot_b
		FROM %s WHERE %s
		GROUP BY process_display, root_domain, egress_node, inbound_mode
		ORDER BY tot_b DESC
		LIMIT 20
	`, table, pWhere), pArgs...)
	if err != nil {
		return out, err
	}
	for paRows.Next() {
		var pa protocol.ProxyAuditItem
		if err := paRows.Scan(&pa.ProcessDisplay, &pa.RootDomain, &pa.ServiceTag, &pa.Rule, &pa.EgressNode, &pa.InboundMode, &pa.TotalBytes); err != nil {
			paRows.Close()
			return out, err
		}
		pa.ServiceTag = resolveServiceTag(pa.RootDomain, pa.ServiceTag, settings.DomainAliases)
		mult := matchMultiplier(pa.EgressNode, settings.NodeMultipliers)
		pa.BilledBytes = int64(math.Round(float64(pa.TotalBytes) * mult))
		out.ProxyAudit = append(out.ProxyAudit, pa)
	}
	paRows.Close()

	quota, err := s.computeQuota(ctx, f.DeviceID, f.TZOffsetMin, now, settings)
	if err != nil {
		return out, err
	}
	out.Quota = quota
	return out, nil
}
