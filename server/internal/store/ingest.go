package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"clash-lens/pkg/privacy"
	"clash-lens/pkg/protocol"
)

// IngestBatch idempotently stores finalized minute totals, minute flows, hourly flows, and daily summaries.
func (s *Store) IngestBatch(ctx context.Context, deviceID string, req protocol.IngestBatchRequest, tzOffsetMin int) (bool, error) {
	if strings.TrimSpace(req.BatchID) == "" {
		return false, errors.New("batch_id is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().Unix()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	res, err := tx.ExecContext(ctx, `
		INSERT OR IGNORE INTO ingest_batches (device_id, batch_id, received_at)
		VALUES (?, ?, ?)
	`, deviceID, req.BatchID, now)
	if err != nil {
		return false, err
	}
	inserted, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	if inserted == 0 {
		err = tx.Commit()
		return true, err
	}

	if err = upsertDeviceMetaTx(ctx, tx, deviceID, req.DeviceMeta, now); err != nil {
		return false, err
	}

	if err = upsertMinuteTotalsTx(ctx, tx, deviceID, req.MinuteTotals, tzOffsetMin); err != nil {
		return false, err
	}

	if err = upsertMinuteFlowsTx(ctx, tx, deviceID, req.MinuteFlows); err != nil {
		return false, err
	}

	hourlyFlows := req.HourlyFlows
	if len(hourlyFlows) == 0 && len(req.MinuteFlows) > 0 {
		hourlyFlows = rollMinuteToHourlyFlows(req.MinuteFlows)
	}
	if err = upsertHourlyFlowsTx(ctx, tx, deviceID, hourlyFlows); err != nil {
		return false, err
	}

	err = tx.Commit()
	return false, err
}

func upsertDeviceMetaTx(ctx context.Context, tx *sql.Tx, deviceID string, meta protocol.DeviceRuntimeMeta, now int64) error {
	_, err := tx.ExecContext(ctx, `
		UPDATE devices
		SET last_seen_at = ?,
		    mihomo_version = CASE WHEN ? != '' THEN ? ELSE mihomo_version END,
		    os = CASE WHEN ? != '' THEN ? ELSE os END,
		    tun_enabled = ?,
		    sniffer_enabled = ?,
		    find_process_mode = CASE WHEN ? != '' THEN ? ELSE find_process_mode END,
		    inbound_mode = CASE WHEN ? != '' THEN ? ELSE inbound_mode END
		WHERE id = ?
	`, now,
		meta.MihomoVersion, meta.MihomoVersion,
		meta.OS, meta.OS,
		boolToInt(meta.TunEnabled), boolToInt(meta.SnifferEnabled),
		meta.FindProcessMode, meta.FindProcessMode,
		meta.InboundMode, meta.InboundMode,
		deviceID,
	)
	return err
}

func upsertMinuteTotalsTx(ctx context.Context, tx *sql.Tx, deviceID string, totals []protocol.MinuteTotalRecord, tzOffsetMin int) error {
	if len(totals) == 0 {
		return nil
	}

	stmtMin, err := tx.PrepareContext(ctx, `
		INSERT INTO traffic_minute_totals (
			device_id, bucket_ts, proxy_up, proxy_down, direct_up, direct_down,
			reject_bytes, unattributed_up, unattributed_down, conn_count, tun_bytes, proxy_port_bytes
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(device_id, bucket_ts) DO UPDATE SET
			proxy_up = traffic_minute_totals.proxy_up + excluded.proxy_up,
			proxy_down = traffic_minute_totals.proxy_down + excluded.proxy_down,
			direct_up = traffic_minute_totals.direct_up + excluded.direct_up,
			direct_down = traffic_minute_totals.direct_down + excluded.direct_down,
			reject_bytes = traffic_minute_totals.reject_bytes + excluded.reject_bytes,
			unattributed_up = traffic_minute_totals.unattributed_up + excluded.unattributed_up,
			unattributed_down = traffic_minute_totals.unattributed_down + excluded.unattributed_down,
			conn_count = traffic_minute_totals.conn_count + excluded.conn_count,
			tun_bytes = traffic_minute_totals.tun_bytes + excluded.tun_bytes,
			proxy_port_bytes = traffic_minute_totals.proxy_port_bytes + excluded.proxy_port_bytes
	`)
	if err != nil {
		return err
	}
	defer stmtMin.Close()

	type dailyAgg struct {
		proxyUp, proxyDown, directUp, directDown, rejectBytes, connCount int64
	}
	byDay := make(map[string]*dailyAgg)

	for _, r := range totals {
		bucketTS := r.BucketTS - (r.BucketTS % 60)
		if _, err := stmtMin.ExecContext(ctx,
			deviceID, bucketTS, r.ProxyUp, r.ProxyDown, r.DirectUp, r.DirectDown,
			r.RejectBytes, r.UnattributedUp, r.UnattributedDown, r.ConnCount, r.TunBytes, r.ProxyPortBytes,
		); err != nil {
			return err
		}

		day := formatDayDate(bucketTS, tzOffsetMin)
		agg, ok := byDay[day]
		if !ok {
			agg = &dailyAgg{}
			byDay[day] = agg
		}
		agg.proxyUp += r.ProxyUp
		agg.proxyDown += r.ProxyDown
		// Include unattributed short-lived connection deltas in daily direct/total so daily totals match Mihomo global counters.
		agg.directUp += r.DirectUp + r.UnattributedUp
		agg.directDown += r.DirectDown + r.UnattributedDown
		agg.rejectBytes += r.RejectBytes
		agg.connCount += r.ConnCount
	}

	stmtDay, err := tx.PrepareContext(ctx, `
		INSERT INTO traffic_daily_summary (
			device_id, day_date, proxy_up, proxy_down, direct_up, direct_down, reject_bytes, conn_count
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(device_id, day_date) DO UPDATE SET
			proxy_up = traffic_daily_summary.proxy_up + excluded.proxy_up,
			proxy_down = traffic_daily_summary.proxy_down + excluded.proxy_down,
			direct_up = traffic_daily_summary.direct_up + excluded.direct_up,
			direct_down = traffic_daily_summary.direct_down + excluded.direct_down,
			reject_bytes = traffic_daily_summary.reject_bytes + excluded.reject_bytes,
			conn_count = traffic_daily_summary.conn_count + excluded.conn_count
	`)
	if err != nil {
		return err
	}
	defer stmtDay.Close()

	for day, agg := range byDay {
		if _, err := stmtDay.ExecContext(ctx,
			deviceID, day, agg.proxyUp, agg.proxyDown, agg.directUp, agg.directDown, agg.rejectBytes, agg.connCount,
		); err != nil {
			return err
		}
	}
	return nil
}

func upsertMinuteFlowsTx(ctx context.Context, tx *sql.Tx, deviceID string, flows []protocol.FlowRecord) error {
	if len(flows) == 0 {
		return nil
	}
	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO traffic_minute_flows (
			device_id, bucket_ts, process_name, process_display, root_domain, service_tag,
			host, egress_node, proxy_group, route_type, inbound_mode, rule,
			up_bytes, down_bytes, conn_count
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(device_id, bucket_ts, process_name, root_domain, host, egress_node, route_type, inbound_mode)
		DO UPDATE SET
			up_bytes = traffic_minute_flows.up_bytes + excluded.up_bytes,
			down_bytes = traffic_minute_flows.down_bytes + excluded.down_bytes,
			conn_count = traffic_minute_flows.conn_count + excluded.conn_count,
			process_display = CASE WHEN excluded.process_display != '' THEN excluded.process_display ELSE traffic_minute_flows.process_display END,
			service_tag = CASE WHEN excluded.service_tag != '' THEN excluded.service_tag ELSE traffic_minute_flows.service_tag END,
			proxy_group = CASE WHEN excluded.proxy_group != '' THEN excluded.proxy_group ELSE traffic_minute_flows.proxy_group END,
			rule = CASE WHEN excluded.rule != '' THEN excluded.rule ELSE traffic_minute_flows.rule END
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, raw := range flows {
		f := sanitizeFlowRecord(raw, 60)
		if f.UpBytes == 0 && f.DownBytes == 0 {
			continue
		}
		if _, err := stmt.ExecContext(ctx,
			deviceID, f.BucketTS, f.ProcessName, f.ProcessDisplay, f.RootDomain, f.ServiceTag,
			f.Host, f.EgressNode, f.ProxyGroup, f.RouteType, f.InboundMode, f.Rule,
			f.UpBytes, f.DownBytes, f.ConnCount,
		); err != nil {
			return err
		}
	}
	return nil
}

func upsertHourlyFlowsTx(ctx context.Context, tx *sql.Tx, deviceID string, flows []protocol.FlowRecord) error {
	if len(flows) == 0 {
		return nil
	}
	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO traffic_hourly_flows (
			device_id, hour_ts, process_name, process_display, root_domain, service_tag,
			host, egress_node, proxy_group, route_type, inbound_mode, rule,
			up_bytes, down_bytes, conn_count
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(device_id, hour_ts, process_name, root_domain, host, egress_node, route_type, inbound_mode)
		DO UPDATE SET
			up_bytes = traffic_hourly_flows.up_bytes + excluded.up_bytes,
			down_bytes = traffic_hourly_flows.down_bytes + excluded.down_bytes,
			conn_count = traffic_hourly_flows.conn_count + excluded.conn_count,
			process_display = CASE WHEN excluded.process_display != '' THEN excluded.process_display ELSE traffic_hourly_flows.process_display END,
			service_tag = CASE WHEN excluded.service_tag != '' THEN excluded.service_tag ELSE traffic_hourly_flows.service_tag END,
			proxy_group = CASE WHEN excluded.proxy_group != '' THEN excluded.proxy_group ELSE traffic_hourly_flows.proxy_group END,
			rule = CASE WHEN excluded.rule != '' THEN excluded.rule ELSE traffic_hourly_flows.rule END
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, raw := range flows {
		f := sanitizeFlowRecord(raw, 3600)
		if f.UpBytes == 0 && f.DownBytes == 0 {
			continue
		}
		if _, err := stmt.ExecContext(ctx,
			deviceID, f.BucketTS, f.ProcessName, f.ProcessDisplay, f.RootDomain, f.ServiceTag,
			f.Host, f.EgressNode, f.ProxyGroup, f.RouteType, f.InboundMode, f.Rule,
			f.UpBytes, f.DownBytes, f.ConnCount,
		); err != nil {
			return err
		}
	}
	return nil
}

func rollMinuteToHourlyFlows(minuteFlows []protocol.FlowRecord) []protocol.FlowRecord {
	type key struct {
		hourTS      int64
		processName string
		rootDomain  string
		host        string
		egressNode  string
		routeType   string
		inboundMode string
	}
	m := make(map[key]*protocol.FlowRecord, len(minuteFlows))
	for _, raw := range minuteFlows {
		f := sanitizeFlowRecord(raw, 3600)
		k := key{
			hourTS:      f.BucketTS,
			processName: f.ProcessName,
			rootDomain:  f.RootDomain,
			host:        f.Host,
			egressNode:  f.EgressNode,
			routeType:   f.RouteType,
			inboundMode: f.InboundMode,
		}
		cur, ok := m[k]
		if !ok {
			copyFlow := f
			m[k] = &copyFlow
			continue
		}
		cur.UpBytes += f.UpBytes
		cur.DownBytes += f.DownBytes
		cur.ConnCount += f.ConnCount
		if cur.ServiceTag == "" && f.ServiceTag != "" {
			cur.ServiceTag = f.ServiceTag
		}
		if cur.Rule == "" && f.Rule != "" {
			cur.Rule = f.Rule
		}
	}
	out := make([]protocol.FlowRecord, 0, len(m))
	for _, v := range m {
		out = append(out, *v)
	}
	return out
}

func sanitizeFlowRecord(f protocol.FlowRecord, alignSec int64) protocol.FlowRecord {
	if alignSec > 0 {
		f.BucketTS = f.BucketTS - (f.BucketTS % alignSec)
	}
	f.ProcessName = defaultStr(strings.TrimSpace(f.ProcessName), "unknown")
	f.ProcessDisplay = defaultStr(strings.TrimSpace(f.ProcessDisplay), f.ProcessName)
	f.RootDomain = defaultStr(strings.ToLower(strings.TrimSpace(f.RootDomain)), "unknown")
	f.Host = defaultStr(strings.ToLower(strings.TrimSpace(f.Host)), f.RootDomain)
	f.EgressNode = defaultStr(strings.TrimSpace(f.EgressNode), "DIRECT")
	f.ProxyGroup = defaultStr(strings.TrimSpace(f.ProxyGroup), f.EgressNode)
	f.RouteType = normalizeRouteType(f.RouteType)
	f.InboundMode = normalizeInboundMode(f.InboundMode)
	f.ServiceTag = strings.TrimSpace(f.ServiceTag)
	f.Rule = privacy.SanitizeRule(strings.TrimSpace(f.Rule), privacy.ModeMask)
	return f
}

func normalizeRouteType(v string) string {
	switch strings.ToUpper(strings.TrimSpace(v)) {
	case protocol.RouteProxy:
		return protocol.RouteProxy
	case protocol.RouteReject:
		return protocol.RouteReject
	default:
		return protocol.RouteDirect
	}
}

func normalizeInboundMode(v string) string {
	switch strings.ToUpper(strings.TrimSpace(v)) {
	case protocol.InboundTUN:
		return protocol.InboundTUN
	case protocol.InboundInner:
		return protocol.InboundInner
	default:
		return protocol.InboundProxyPort
	}
}

func defaultStr(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
