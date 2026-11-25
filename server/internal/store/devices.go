package store

import (
	"context"
	"database/sql"
	"errors"
	neturl "net/url"
	"runtime"
	"strings"
	"time"

	"clash-lens/pkg/protocol"
	"clash-lens/server/internal/auth"
	"github.com/google/uuid"
)

const (
	settingLocalDeviceID    = "local_device_id"
	settingLocalDeviceToken = "local_device_token"
)

var (
	ErrDeviceNotFound      = errors.New("device not found")
	ErrInvalidDashboardURL = errors.New("dashboard_url must use http:// or https://")
)

// sanitizeDashboardURL validates an optional external management panel URL to prevent non-HTTP scheme injection.
func sanitizeDashboardURL(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}
	u, err := neturl.Parse(trimmed)
	if err != nil {
		return "", ErrInvalidDashboardURL
	}
	scheme := strings.ToLower(u.Scheme)
	if (scheme != "http" && scheme != "https") || strings.TrimSpace(u.Host) == "" {
		return "", ErrInvalidDashboardURL
	}
	return trimmed, nil
}

// EnsureLocalDevice returns or initializes a persistent local device and token for standalone --local mode.
func (s *Store) EnsureLocalDevice(ctx context.Context, name, osName string) (protocol.DeviceInfo, string, error) {
	devID, okID, err := s.GetSetting(ctx, settingLocalDeviceID)
	if err != nil {
		return protocol.DeviceInfo{}, "", err
	}
	tok, okTok, err := s.GetSetting(ctx, settingLocalDeviceToken)
	if err != nil {
		return protocol.DeviceInfo{}, "", err
	}
	if okID && okTok && devID != "" && tok != "" {
		if dev, getErr := s.GetDeviceByTokenHash(ctx, auth.HashToken(tok)); getErr == nil && dev.ID == devID {
			return dev, tok, nil
		}
	}

	if strings.TrimSpace(name) == "" {
		name = "本机电脑"
	}
	if strings.TrimSpace(osName) == "" {
		osName = runtime.GOOS
	}
	dev, rawToken, err := s.CreateDevice(ctx, protocol.CreateDeviceRequest{
		Name: name,
		OS:   osName,
	})
	if err != nil {
		return protocol.DeviceInfo{}, "", err
	}
	if err := s.SetSetting(ctx, settingLocalDeviceID, dev.ID); err != nil {
		return protocol.DeviceInfo{}, "", err
	}
	if err := s.SetSetting(ctx, settingLocalDeviceToken, rawToken); err != nil {
		return protocol.DeviceInfo{}, "", err
	}
	return dev, rawToken, nil
}

// CreateDevice registers a new device and returns its info along with the one-time plaintext token.
func (s *Store) CreateDevice(ctx context.Context, req protocol.CreateDeviceRequest) (protocol.DeviceInfo, string, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "Unnamed Device"
	}
	osName := strings.TrimSpace(req.OS)
	if osName == "" {
		osName = "windows"
	}
	icon := strings.TrimSpace(req.Icon)
	if icon == "" {
		icon = defaultIconForOS(osName)
	}
	dashboardURL, err := sanitizeDashboardURL(req.DashboardURL)
	if err != nil {
		return protocol.DeviceInfo{}, "", err
	}

	rawToken, tokenHash, prefix, err := auth.GenerateDeviceToken()
	if err != nil {
		return protocol.DeviceInfo{}, "", err
	}

	id := uuid.NewString()
	now := time.Now().Unix()

	_, err = s.db.ExecContext(ctx, `
		INSERT INTO devices (id, name, os, icon, token_hash, token_prefix, created_at, dashboard_url)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, id, name, osName, icon, tokenHash, prefix, now, dashboardURL)
	if err != nil {
		return protocol.DeviceInfo{}, "", err
	}

	return protocol.DeviceInfo{
		ID:           id,
		Name:         name,
		OS:           osName,
		Icon:         icon,
		TokenPrefix:  prefix,
		CreatedAt:    now,
		DashboardURL: dashboardURL,
	}, rawToken, nil
}

// GetDeviceByTokenHash finds the device associated with a SHA-256 hashed bearer token.
func (s *Store) GetDeviceByTokenHash(ctx context.Context, tokenHash string) (protocol.DeviceInfo, error) {
	var d protocol.DeviceInfo
	var tunInt, sniffInt int
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, os, icon, token_prefix, created_at, last_seen_at,
		       mihomo_version, tun_enabled, sniffer_enabled, find_process_mode,
		       inbound_mode, live_up_bps, live_down_bps, live_conns, dashboard_url
		FROM devices WHERE token_hash = ?
	`, tokenHash).Scan(
		&d.ID, &d.Name, &d.OS, &d.Icon, &d.TokenPrefix, &d.CreatedAt, &d.LastSeenAt,
		&d.MihomoVersion, &tunInt, &sniffInt, &d.FindProcessMode,
		&d.InboundMode, &d.LiveUpBps, &d.LiveDownBps, &d.LiveConns, &d.DashboardURL,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return d, ErrDeviceNotFound
	}
	if err != nil {
		return d, err
	}
	d.TunEnabled = tunInt == 1
	d.SnifferEnabled = sniffInt == 1
	return d, nil
}

// ListDevices returns all devices with online status and today's traffic summary.
func (s *Store) ListDevices(ctx context.Context, tzOffsetMin int, onlineThresholdSec int64) ([]protocol.DeviceInfo, error) {
	now := time.Now().Unix()
	todayDate := formatDayDate(now, tzOffsetMin)

	rows, err := s.db.QueryContext(ctx, `
		SELECT
			d.id, d.name, d.os, d.icon, d.token_prefix, d.created_at, d.last_seen_at,
			d.mihomo_version, d.tun_enabled, d.sniffer_enabled, d.find_process_mode,
			d.inbound_mode, d.live_up_bps, d.live_down_bps, d.live_conns, d.dashboard_url,
			COALESCE(ds.proxy_up + ds.proxy_down + ds.direct_up + ds.direct_down, 0) AS today_bytes,
			COALESCE(ds.proxy_up + ds.proxy_down, 0) AS today_proxy_bytes
		FROM devices d
		LEFT JOIN traffic_daily_summary ds ON ds.device_id = d.id AND ds.day_date = ?
		ORDER BY d.created_at ASC
	`, todayDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]protocol.DeviceInfo, 0)
	for rows.Next() {
		var d protocol.DeviceInfo
		var tunInt, sniffInt int
		if err := rows.Scan(
			&d.ID, &d.Name, &d.OS, &d.Icon, &d.TokenPrefix, &d.CreatedAt, &d.LastSeenAt,
			&d.MihomoVersion, &tunInt, &sniffInt, &d.FindProcessMode,
			&d.InboundMode, &d.LiveUpBps, &d.LiveDownBps, &d.LiveConns, &d.DashboardURL,
			&d.TodayBytes, &d.TodayProxyBytes,
		); err != nil {
			return nil, err
		}
		d.TunEnabled = tunInt == 1
		d.SnifferEnabled = sniffInt == 1
		d.Online = d.LastSeenAt > 0 && (now-d.LastSeenAt) <= onlineThresholdSec
		out = append(out, d)
	}
	return out, rows.Err()
}

// UpdateDevice updates display fields and optional dashboard management URL of a device.
func (s *Store) UpdateDevice(ctx context.Context, id string, req protocol.UpdateDeviceRequest) (protocol.DeviceInfo, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return protocol.DeviceInfo{}, errors.New("device name cannot be empty")
	}
	osName := strings.TrimSpace(req.OS)
	icon := strings.TrimSpace(req.Icon)
	if icon == "" && osName != "" {
		icon = defaultIconForOS(osName)
	}
	dashboardURL, err := sanitizeDashboardURL(req.DashboardURL)
	if err != nil {
		return protocol.DeviceInfo{}, err
	}

	res, err := s.db.ExecContext(ctx, `
		UPDATE devices
		SET name = ?,
		    os = CASE WHEN ? != '' THEN ? ELSE os END,
		    icon = CASE WHEN ? != '' THEN ? ELSE icon END,
		    dashboard_url = ?
		WHERE id = ?
	`, name, osName, osName, icon, icon, dashboardURL, id)
	if err != nil {
		return protocol.DeviceInfo{}, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return protocol.DeviceInfo{}, err
	}
	if affected == 0 {
		return protocol.DeviceInfo{}, ErrDeviceNotFound
	}

	var d protocol.DeviceInfo
	var tunInt, sniffInt int
	err = s.db.QueryRowContext(ctx, `
		SELECT id, name, os, icon, token_prefix, created_at, last_seen_at,
		       mihomo_version, tun_enabled, sniffer_enabled, find_process_mode,
		       inbound_mode, live_up_bps, live_down_bps, live_conns, dashboard_url
		FROM devices WHERE id = ?
	`, id).Scan(
		&d.ID, &d.Name, &d.OS, &d.Icon, &d.TokenPrefix, &d.CreatedAt, &d.LastSeenAt,
		&d.MihomoVersion, &tunInt, &sniffInt, &d.FindProcessMode,
		&d.InboundMode, &d.LiveUpBps, &d.LiveDownBps, &d.LiveConns, &d.DashboardURL,
	)
	if err != nil {
		return protocol.DeviceInfo{}, err
	}
	d.TunEnabled = tunInt == 1
	d.SnifferEnabled = sniffInt == 1
	return d, nil
}

// DeleteDevice removes a device and cascades its traffic records.
func (s *Store) DeleteDevice(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM devices WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrDeviceNotFound
	}
	return nil
}

// UpdateDeviceLive updates live telemetry columns and last_seen_at for a device.
func (s *Store) UpdateDeviceLive(ctx context.Context, deviceID string, req protocol.LivePushRequest) error {
	now := time.Now().Unix()
	tunInt := boolToInt(req.DeviceMeta.TunEnabled)
	sniffInt := boolToInt(req.DeviceMeta.SnifferEnabled)
	_, err := s.db.ExecContext(ctx, `
		UPDATE devices
		SET last_seen_at = ?,
		    live_up_bps = ?,
		    live_down_bps = ?,
		    live_conns = ?,
		    mihomo_version = CASE WHEN ? != '' THEN ? ELSE mihomo_version END,
		    os = CASE WHEN ? != '' THEN ? ELSE os END,
		    tun_enabled = ?,
		    sniffer_enabled = ?,
		    find_process_mode = CASE WHEN ? != '' THEN ? ELSE find_process_mode END,
		    inbound_mode = CASE WHEN ? != '' THEN ? ELSE inbound_mode END
		WHERE id = ?
	`, now, req.UpBps, req.DownBps, req.ActiveConns,
		req.DeviceMeta.MihomoVersion, req.DeviceMeta.MihomoVersion,
		req.DeviceMeta.OS, req.DeviceMeta.OS,
		tunInt, sniffInt,
		req.DeviceMeta.FindProcessMode, req.DeviceMeta.FindProcessMode,
		req.DeviceMeta.InboundMode, req.DeviceMeta.InboundMode,
		deviceID,
	)
	return err
}

func defaultIconForOS(osName string) string {
	l := strings.ToLower(osName)
	switch {
	case strings.Contains(l, "android") || strings.Contains(l, "ios") || strings.Contains(l, "phone"):
		return "smartphone"
	case strings.Contains(l, "linux") || strings.Contains(l, "server"):
		return "server"
	case strings.Contains(l, "darwin") || strings.Contains(l, "mac") || strings.Contains(l, "laptop"):
		return "laptop"
	default:
		return "monitor"
	}
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
