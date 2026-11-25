package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"clash-lens/pkg/privacy"
	"clash-lens/pkg/protocol"
	"github.com/google/uuid"
)

const backupFormatVersion = 1

// ExportBackup exports settings, devices (without token hashes), and all historical traffic tables
// into a portable JSON archive suitable for backup or cross-machine merging.
func (s *Store) ExportBackup(ctx context.Context, appVersion string) (protocol.BackupArchive, error) {
	settings, err := s.GetSettings(ctx)
	if err != nil {
		return protocol.BackupArchive{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	archive := protocol.BackupArchive{
		FormatVersion: backupFormatVersion,
		ExportedAt:    time.Now().Unix(),
		AppVersion:    appVersion,
		Settings:      &settings,
		Devices:       []protocol.BackupDeviceRecord{},
		MinuteTotals:  []protocol.BackupMinuteTotalRow{},
		MinuteFlows:   []protocol.BackupFlowRow{},
		HourlyFlows:   []protocol.BackupFlowRow{},
		DailySummary:  []protocol.BackupDailySummaryRow{},
	}

	devRows, err := s.db.QueryContext(ctx, `
		SELECT id, name, os, icon, created_at, last_seen_at,
		       mihomo_version, tun_enabled, sniffer_enabled, find_process_mode, inbound_mode
		FROM devices
		ORDER BY created_at ASC
	`)
	if err != nil {
		return archive, err
	}
	for devRows.Next() {
		var d protocol.BackupDeviceRecord
		var tunInt, sniffInt int
		if err := devRows.Scan(
			&d.ID, &d.Name, &d.OS, &d.Icon, &d.CreatedAt, &d.LastSeenAt,
			&d.MihomoVersion, &tunInt, &sniffInt, &d.FindProcessMode, &d.InboundMode,
		); err != nil {
			_ = devRows.Close()
			return archive, err
		}
		d.TunEnabled = tunInt == 1
		d.SnifferEnabled = sniffInt == 1
		archive.Devices = append(archive.Devices, d)
	}
	if err := devRows.Err(); err != nil {
		_ = devRows.Close()
		return archive, err
	}
	_ = devRows.Close()

	totRows, err := s.db.QueryContext(ctx, `
		SELECT device_id, bucket_ts, proxy_up, proxy_down, direct_up, direct_down,
		       reject_bytes, unattributed_up, unattributed_down, conn_count, tun_bytes, proxy_port_bytes
		FROM traffic_minute_totals
		ORDER BY bucket_ts ASC, device_id ASC
	`)
	if err != nil {
		return archive, err
	}
	for totRows.Next() {
		var r protocol.BackupMinuteTotalRow
		if err := totRows.Scan(
			&r.DeviceID, &r.BucketTS, &r.ProxyUp, &r.ProxyDown, &r.DirectUp, &r.DirectDown,
			&r.RejectBytes, &r.UnattributedUp, &r.UnattributedDown, &r.ConnCount, &r.TunBytes, &r.ProxyPortBytes,
		); err != nil {
			_ = totRows.Close()
			return archive, err
		}
		archive.MinuteTotals = append(archive.MinuteTotals, r)
	}
	if err := totRows.Err(); err != nil {
		_ = totRows.Close()
		return archive, err
	}
	_ = totRows.Close()

	minFlowRows, err := s.db.QueryContext(ctx, `
		SELECT device_id, bucket_ts, process_name, process_display, root_domain, service_tag,
		       host, egress_node, proxy_group, route_type, inbound_mode, rule,
		       up_bytes, down_bytes, conn_count
		FROM traffic_minute_flows
		ORDER BY bucket_ts ASC, device_id ASC
	`)
	if err != nil {
		return archive, err
	}
	for minFlowRows.Next() {
		var f protocol.BackupFlowRow
		if err := minFlowRows.Scan(
			&f.DeviceID, &f.BucketTS, &f.ProcessName, &f.ProcessDisplay, &f.RootDomain, &f.ServiceTag,
			&f.Host, &f.EgressNode, &f.ProxyGroup, &f.RouteType, &f.InboundMode, &f.Rule,
			&f.UpBytes, &f.DownBytes, &f.ConnCount,
		); err != nil {
			_ = minFlowRows.Close()
			return archive, err
		}
		f.Rule = privacy.SanitizeRule(f.Rule, privacy.ModeMask)
		archive.MinuteFlows = append(archive.MinuteFlows, f)
	}
	if err := minFlowRows.Err(); err != nil {
		_ = minFlowRows.Close()
		return archive, err
	}
	_ = minFlowRows.Close()

	hrFlowRows, err := s.db.QueryContext(ctx, `
		SELECT device_id, hour_ts, process_name, process_display, root_domain, service_tag,
		       host, egress_node, proxy_group, route_type, inbound_mode, rule,
		       up_bytes, down_bytes, conn_count
		FROM traffic_hourly_flows
		ORDER BY hour_ts ASC, device_id ASC
	`)
	if err != nil {
		return archive, err
	}
	for hrFlowRows.Next() {
		var f protocol.BackupFlowRow
		if err := hrFlowRows.Scan(
			&f.DeviceID, &f.BucketTS, &f.ProcessName, &f.ProcessDisplay, &f.RootDomain, &f.ServiceTag,
			&f.Host, &f.EgressNode, &f.ProxyGroup, &f.RouteType, &f.InboundMode, &f.Rule,
			&f.UpBytes, &f.DownBytes, &f.ConnCount,
		); err != nil {
			_ = hrFlowRows.Close()
			return archive, err
		}
		f.Rule = privacy.SanitizeRule(f.Rule, privacy.ModeMask)
		archive.HourlyFlows = append(archive.HourlyFlows, f)
	}
	if err := hrFlowRows.Err(); err != nil {
		_ = hrFlowRows.Close()
		return archive, err
	}
	_ = hrFlowRows.Close()

	dayRows, err := s.db.QueryContext(ctx, `
		SELECT device_id, day_date, proxy_up, proxy_down, direct_up, direct_down, reject_bytes, conn_count
		FROM traffic_daily_summary
		ORDER BY day_date ASC, device_id ASC
	`)
	if err != nil {
		return archive, err
	}
	for dayRows.Next() {
		var d protocol.BackupDailySummaryRow
		if err := dayRows.Scan(
			&d.DeviceID, &d.DayDate, &d.ProxyUp, &d.ProxyDown, &d.DirectUp, &d.DirectDown, &d.RejectBytes, &d.ConnCount,
		); err != nil {
			_ = dayRows.Close()
			return archive, err
		}
		archive.DailySummary = append(archive.DailySummary, d)
	}
	if err := dayRows.Err(); err != nil {
		_ = dayRows.Close()
		return archive, err
	}
	_ = dayRows.Close()

	return archive, nil
}

// ImportBackup idempotently merges a portable BackupArchive into this Store using MAX() upsert semantics.
func (s *Store) ImportBackup(ctx context.Context, archive protocol.BackupArchive, mergeSettings bool) (protocol.BackupImportResult, error) {
	if archive.FormatVersion != backupFormatVersion {
		return protocol.BackupImportResult{}, errors.New("unsupported backup format_version")
	}

	res := protocol.BackupImportResult{OK: true}

	s.mu.Lock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		s.mu.Unlock()
		return protocol.BackupImportResult{}, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	knownDevices := make(map[string]struct{}, len(archive.Devices))
	for _, d := range archive.Devices {
		id := strings.TrimSpace(d.ID)
		if id == "" {
			continue
		}
		knownDevices[id] = struct{}{}

		var exists int
		qErr := tx.QueryRowContext(ctx, `SELECT 1 FROM devices WHERE id = ?`, id).Scan(&exists)
		if qErr == nil {
			res.DevicesExisting++
			continue
		}
		if !errors.Is(qErr, sql.ErrNoRows) {
			err = qErr
			s.mu.Unlock()
			return protocol.BackupImportResult{}, err
		}

		name := defaultStr(strings.TrimSpace(d.Name), "Imported Device")
		osName := defaultStr(strings.TrimSpace(d.OS), "windows")
		icon := defaultStr(strings.TrimSpace(d.Icon), defaultIconForOS(osName))
		createdAt := d.CreatedAt
		if createdAt <= 0 {
			createdAt = time.Now().Unix()
		}

		_, err = tx.ExecContext(ctx, `
			INSERT INTO devices (
				id, name, os, icon, token_hash, token_prefix, created_at, last_seen_at,
				mihomo_version, tun_enabled, sniffer_enabled, find_process_mode, inbound_mode
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, id, name, osName, icon, "imported_"+uuid.NewString(), "imported", createdAt, d.LastSeenAt,
			d.MihomoVersion, boolToInt(d.TunEnabled), boolToInt(d.SnifferEnabled), d.FindProcessMode, d.InboundMode,
		)
		if err != nil {
			s.mu.Unlock()
			return protocol.BackupImportResult{}, err
		}
		res.DevicesImported++
	}

	ensureDeviceExists := func(deviceID string) error {
		id := strings.TrimSpace(deviceID)
		if id == "" {
			return errors.New("empty device_id in traffic row")
		}
		if _, ok := knownDevices[id]; ok {
			return nil
		}
		var exists int
		qErr := tx.QueryRowContext(ctx, `SELECT 1 FROM devices WHERE id = ?`, id).Scan(&exists)
		if qErr == nil {
			knownDevices[id] = struct{}{}
			res.DevicesExisting++
			return nil
		}
		if !errors.Is(qErr, sql.ErrNoRows) {
			return qErr
		}
		now := time.Now().Unix()
		if _, insErr := tx.ExecContext(ctx, `
			INSERT INTO devices (id, name, os, icon, token_hash, token_prefix, created_at)
			VALUES (?, ?, 'windows', 'monitor', ?, 'imported', ?)
		`, id, "Imported ("+shortID(id)+")", "imported_"+uuid.NewString(), now); insErr != nil {
			return insErr
		}
		knownDevices[id] = struct{}{}
		res.DevicesImported++
		return nil
	}

	if len(archive.MinuteTotals) > 0 {
		stmt, prepErr := tx.PrepareContext(ctx, `
			INSERT INTO traffic_minute_totals (
				device_id, bucket_ts, proxy_up, proxy_down, direct_up, direct_down,
				reject_bytes, unattributed_up, unattributed_down, conn_count, tun_bytes, proxy_port_bytes
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(device_id, bucket_ts) DO UPDATE SET
				proxy_up = MAX(traffic_minute_totals.proxy_up, excluded.proxy_up),
				proxy_down = MAX(traffic_minute_totals.proxy_down, excluded.proxy_down),
				direct_up = MAX(traffic_minute_totals.direct_up, excluded.direct_up),
				direct_down = MAX(traffic_minute_totals.direct_down, excluded.direct_down),
				reject_bytes = MAX(traffic_minute_totals.reject_bytes, excluded.reject_bytes),
				unattributed_up = MAX(traffic_minute_totals.unattributed_up, excluded.unattributed_up),
				unattributed_down = MAX(traffic_minute_totals.unattributed_down, excluded.unattributed_down),
				conn_count = MAX(traffic_minute_totals.conn_count, excluded.conn_count),
				tun_bytes = MAX(traffic_minute_totals.tun_bytes, excluded.tun_bytes),
				proxy_port_bytes = MAX(traffic_minute_totals.proxy_port_bytes, excluded.proxy_port_bytes)
		`)
		if prepErr != nil {
			err = prepErr
			s.mu.Unlock()
			return protocol.BackupImportResult{}, err
		}
		for _, r := range archive.MinuteTotals {
			if err = ensureDeviceExists(r.DeviceID); err != nil {
				_ = stmt.Close()
				s.mu.Unlock()
				return protocol.BackupImportResult{}, err
			}
			bucketTS := r.BucketTS - (r.BucketTS % 60)
			if _, err = stmt.ExecContext(ctx,
				r.DeviceID, bucketTS, r.ProxyUp, r.ProxyDown, r.DirectUp, r.DirectDown,
				r.RejectBytes, r.UnattributedUp, r.UnattributedDown, r.ConnCount, r.TunBytes, r.ProxyPortBytes,
			); err != nil {
				_ = stmt.Close()
				s.mu.Unlock()
				return protocol.BackupImportResult{}, err
			}
			res.MinuteTotalsRows++
		}
		_ = stmt.Close()
	}

	if len(archive.MinuteFlows) > 0 {
		stmt, prepErr := tx.PrepareContext(ctx, `
			INSERT INTO traffic_minute_flows (
				device_id, bucket_ts, process_name, process_display, root_domain, service_tag,
				host, egress_node, proxy_group, route_type, inbound_mode, rule,
				up_bytes, down_bytes, conn_count
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(device_id, bucket_ts, process_name, root_domain, host, egress_node, route_type, inbound_mode)
			DO UPDATE SET
				up_bytes = MAX(traffic_minute_flows.up_bytes, excluded.up_bytes),
				down_bytes = MAX(traffic_minute_flows.down_bytes, excluded.down_bytes),
				conn_count = MAX(traffic_minute_flows.conn_count, excluded.conn_count),
				process_display = CASE WHEN excluded.process_display != '' THEN excluded.process_display ELSE traffic_minute_flows.process_display END,
				service_tag = CASE WHEN excluded.service_tag != '' THEN excluded.service_tag ELSE traffic_minute_flows.service_tag END,
				proxy_group = CASE WHEN excluded.proxy_group != '' THEN excluded.proxy_group ELSE traffic_minute_flows.proxy_group END,
				rule = CASE WHEN excluded.rule != '' THEN excluded.rule ELSE traffic_minute_flows.rule END
		`)
		if prepErr != nil {
			err = prepErr
			s.mu.Unlock()
			return protocol.BackupImportResult{}, err
		}
		for _, r := range archive.MinuteFlows {
			if err = ensureDeviceExists(r.DeviceID); err != nil {
				_ = stmt.Close()
				s.mu.Unlock()
				return protocol.BackupImportResult{}, err
			}
			f := sanitizeFlowRecord(protocol.FlowRecord{
				BucketTS:       r.BucketTS,
				ProcessName:    r.ProcessName,
				ProcessDisplay: r.ProcessDisplay,
				RootDomain:     r.RootDomain,
				ServiceTag:     r.ServiceTag,
				Host:           r.Host,
				EgressNode:     r.EgressNode,
				ProxyGroup:     r.ProxyGroup,
				RouteType:      r.RouteType,
				InboundMode:    r.InboundMode,
				Rule:           r.Rule,
				UpBytes:        r.UpBytes,
				DownBytes:      r.DownBytes,
				ConnCount:      r.ConnCount,
			}, 60)
			if _, err = stmt.ExecContext(ctx,
				r.DeviceID, f.BucketTS, f.ProcessName, f.ProcessDisplay, f.RootDomain, f.ServiceTag,
				f.Host, f.EgressNode, f.ProxyGroup, f.RouteType, f.InboundMode, f.Rule,
				f.UpBytes, f.DownBytes, f.ConnCount,
			); err != nil {
				_ = stmt.Close()
				s.mu.Unlock()
				return protocol.BackupImportResult{}, err
			}
			res.MinuteFlowsRows++
		}
		_ = stmt.Close()
	}

	if len(archive.HourlyFlows) > 0 {
		stmt, prepErr := tx.PrepareContext(ctx, `
			INSERT INTO traffic_hourly_flows (
				device_id, hour_ts, process_name, process_display, root_domain, service_tag,
				host, egress_node, proxy_group, route_type, inbound_mode, rule,
				up_bytes, down_bytes, conn_count
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(device_id, hour_ts, process_name, root_domain, host, egress_node, route_type, inbound_mode)
			DO UPDATE SET
				up_bytes = MAX(traffic_hourly_flows.up_bytes, excluded.up_bytes),
				down_bytes = MAX(traffic_hourly_flows.down_bytes, excluded.down_bytes),
				conn_count = MAX(traffic_hourly_flows.conn_count, excluded.conn_count),
				process_display = CASE WHEN excluded.process_display != '' THEN excluded.process_display ELSE traffic_hourly_flows.process_display END,
				service_tag = CASE WHEN excluded.service_tag != '' THEN excluded.service_tag ELSE traffic_hourly_flows.service_tag END,
				proxy_group = CASE WHEN excluded.proxy_group != '' THEN excluded.proxy_group ELSE traffic_hourly_flows.proxy_group END,
				rule = CASE WHEN excluded.rule != '' THEN excluded.rule ELSE traffic_hourly_flows.rule END
		`)
		if prepErr != nil {
			err = prepErr
			s.mu.Unlock()
			return protocol.BackupImportResult{}, err
		}
		for _, r := range archive.HourlyFlows {
			if err = ensureDeviceExists(r.DeviceID); err != nil {
				_ = stmt.Close()
				s.mu.Unlock()
				return protocol.BackupImportResult{}, err
			}
			f := sanitizeFlowRecord(protocol.FlowRecord{
				BucketTS:       r.BucketTS,
				ProcessName:    r.ProcessName,
				ProcessDisplay: r.ProcessDisplay,
				RootDomain:     r.RootDomain,
				ServiceTag:     r.ServiceTag,
				Host:           r.Host,
				EgressNode:     r.EgressNode,
				ProxyGroup:     r.ProxyGroup,
				RouteType:      r.RouteType,
				InboundMode:    r.InboundMode,
				Rule:           r.Rule,
				UpBytes:        r.UpBytes,
				DownBytes:      r.DownBytes,
				ConnCount:      r.ConnCount,
			}, 3600)
			if _, err = stmt.ExecContext(ctx,
				r.DeviceID, f.BucketTS, f.ProcessName, f.ProcessDisplay, f.RootDomain, f.ServiceTag,
				f.Host, f.EgressNode, f.ProxyGroup, f.RouteType, f.InboundMode, f.Rule,
				f.UpBytes, f.DownBytes, f.ConnCount,
			); err != nil {
				_ = stmt.Close()
				s.mu.Unlock()
				return protocol.BackupImportResult{}, err
			}
			res.HourlyFlowsRows++
		}
		_ = stmt.Close()
	}

	if len(archive.DailySummary) > 0 {
		stmt, prepErr := tx.PrepareContext(ctx, `
			INSERT INTO traffic_daily_summary (
				device_id, day_date, proxy_up, proxy_down, direct_up, direct_down, reject_bytes, conn_count
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(device_id, day_date) DO UPDATE SET
				proxy_up = MAX(traffic_daily_summary.proxy_up, excluded.proxy_up),
				proxy_down = MAX(traffic_daily_summary.proxy_down, excluded.proxy_down),
				direct_up = MAX(traffic_daily_summary.direct_up, excluded.direct_up),
				direct_down = MAX(traffic_daily_summary.direct_down, excluded.direct_down),
				reject_bytes = MAX(traffic_daily_summary.reject_bytes, excluded.reject_bytes),
				conn_count = MAX(traffic_daily_summary.conn_count, excluded.conn_count)
		`)
		if prepErr != nil {
			err = prepErr
			s.mu.Unlock()
			return protocol.BackupImportResult{}, err
		}
		for _, r := range archive.DailySummary {
			day := strings.TrimSpace(r.DayDate)
			if day == "" {
				continue
			}
			if err = ensureDeviceExists(r.DeviceID); err != nil {
				_ = stmt.Close()
				s.mu.Unlock()
				return protocol.BackupImportResult{}, err
			}
			if _, err = stmt.ExecContext(ctx,
				r.DeviceID, day, r.ProxyUp, r.ProxyDown, r.DirectUp, r.DirectDown, r.RejectBytes, r.ConnCount,
			); err != nil {
				_ = stmt.Close()
				s.mu.Unlock()
				return protocol.BackupImportResult{}, err
			}
			res.DailySummaryRows++
		}
		_ = stmt.Close()
	}

	if err = tx.Commit(); err != nil {
		s.mu.Unlock()
		return protocol.BackupImportResult{}, err
	}
	s.mu.Unlock()

	if mergeSettings && archive.Settings != nil {
		if _, saveErr := s.SaveSettings(ctx, *archive.Settings); saveErr != nil {
			return protocol.BackupImportResult{}, saveErr
		}
		res.SettingsImported = true
	}

	return res, nil
}

func shortID(id string) string {
	if len(id) <= 6 {
		return id
	}
	return id[:6]
}
