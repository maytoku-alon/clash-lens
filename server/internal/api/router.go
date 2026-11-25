package api

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"clash-lens/pkg/privacy"
	"clash-lens/pkg/protocol"
	"clash-lens/server/internal/auth"
	"clash-lens/server/internal/config"
	"clash-lens/server/internal/store"
	"clash-lens/server/internal/webembed"
	"clash-lens/server/internal/ws"
	"github.com/gorilla/websocket"
)

type contextKey string

const deviceContextKey contextKey = "device"

// Server bundles HTTP routes, auth, store, and live WebSocket hub.
type Server struct {
	cfg           config.Config
	store         *store.Store
	hub           *ws.Hub
	sessionSecret string
	upgrader      websocket.Upgrader
}

// NewServer constructs an HTTP handler server.
func NewServer(cfg config.Config, st *store.Store, hub *ws.Hub, sessionSecret string) *Server {
	return &Server{
		cfg:           cfg,
		store:         st,
		hub:           hub,
		sessionSecret: sessionSecret,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 8192,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

// Handler returns the root http.Handler serving /api/v1/* and the embedded SPA.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// Health & Auth
	mux.HandleFunc("GET /api/v1/health", s.handleHealth)
	mux.HandleFunc("GET /api/v1/auth/status", s.handleAuthStatus)
	mux.HandleFunc("POST /api/v1/auth/setup", s.handleAuthSetup)
	mux.HandleFunc("POST /api/v1/auth/login", s.handleAuthLogin)
	mux.HandleFunc("POST /api/v1/auth/logout", s.handleAuthLogout)
	mux.Handle("PUT /api/v1/auth/password", s.requireAdmin(http.HandlerFunc(s.handleChangePassword)))

	// Agent ingest routes (Device Token auth)
	mux.Handle("POST /api/v1/ingest/batch", s.requireDevice(http.HandlerFunc(s.handleIngestBatch)))
	mux.Handle("POST /api/v1/ingest/live", s.requireDevice(http.HandlerFunc(s.handleIngestLive)))

	// Admin UI API routes
	mux.Handle("GET /api/v1/devices", s.requireAdmin(http.HandlerFunc(s.handleListDevices)))
	mux.Handle("POST /api/v1/devices", s.requireAdmin(http.HandlerFunc(s.handleCreateDevice)))
	mux.Handle("PATCH /api/v1/devices/{id}", s.requireAdmin(http.HandlerFunc(s.handleUpdateDevice)))
	mux.Handle("DELETE /api/v1/devices/{id}", s.requireAdmin(http.HandlerFunc(s.handleDeleteDevice)))

	mux.Handle("GET /api/v1/settings", s.requireAdmin(http.HandlerFunc(s.handleGetSettings)))
	mux.Handle("PUT /api/v1/settings", s.requireAdmin(http.HandlerFunc(s.handlePutSettings)))
	mux.Handle("GET /api/v1/backup/export", s.requireAdmin(http.HandlerFunc(s.handleBackupExport)))
	mux.Handle("POST /api/v1/backup/import", s.requireAdmin(http.HandlerFunc(s.handleBackupImport)))

	mux.Handle("GET /api/v1/analytics/overview", s.requireAdmin(http.HandlerFunc(s.handleOverview)))
	mux.Handle("GET /api/v1/analytics/heatmap", s.requireAdmin(http.HandlerFunc(s.handleHeatmap)))
	mux.Handle("GET /api/v1/analytics/timeseries", s.requireAdmin(http.HandlerFunc(s.handleTimeseries)))
	mux.Handle("GET /api/v1/analytics/bursts", s.requireAdmin(http.HandlerFunc(s.handleBursts)))
	mux.Handle("GET /api/v1/analytics/apps", s.requireAdmin(http.HandlerFunc(s.handleListApps)))
	mux.Handle("GET /api/v1/analytics/apps/{process}/detail", s.requireAdmin(http.HandlerFunc(s.handleAppDetail)))
	mux.Handle("GET /api/v1/analytics/domains", s.requireAdmin(http.HandlerFunc(s.handleListDomains)))
	mux.Handle("GET /api/v1/analytics/domains/{domain}/detail", s.requireAdmin(http.HandlerFunc(s.handleDomainDetail)))
	mux.Handle("GET /api/v1/analytics/nodes", s.requireAdmin(http.HandlerFunc(s.handleNodesAnalytics)))

	mux.Handle("GET /api/v1/live/snapshot", s.requireAdmin(http.HandlerFunc(s.handleLiveSnapshot)))
	mux.Handle("GET /api/v1/ws/live", s.requireAdmin(http.HandlerFunc(s.handleLiveWS)))

	// Embedded SPA
	mux.Handle("/", webembed.SPAHandler())
	return mux
}

func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.isLocalBypass(r) {
			next.ServeHTTP(w, r)
			return
		}
		tok := auth.ExtractSessionToken(r)
		if !auth.VerifySession(s.sessionSecret, tok, time.Now()) {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) isLocalBypass(r *http.Request) bool {
	if !s.cfg.LocalNoAuth {
		return false
	}
	return isLoopbackRemote(r.RemoteAddr)
}

func isLoopbackRemote(remoteAddr string) bool {
	host := strings.TrimSpace(remoteAddr)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (s *Server) requireDevice(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := auth.ExtractBearerToken(r)
		if raw == "" {
			writeError(w, http.StatusUnauthorized, "missing device token")
			return
		}
		dev, err := s.store.GetDeviceByTokenHash(r.Context(), auth.HashToken(raw))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid device token")
			return
		}
		ctx := context.WithValue(r.Context(), deviceContextKey, dev)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func deviceFromContext(ctx context.Context) protocol.DeviceInfo {
	v, _ := ctx.Value(deviceContextKey).(protocol.DeviceInfo)
	return v
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"version":  config.AppVersion,
		"commit":   config.BuildCommit,
		"built_at": config.BuildTime,
	})
}

func (s *Server) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	if s.isLocalBypass(r) {
		writeJSON(w, http.StatusOK, protocol.AuthStatusResponse{
			Initialized:   true,
			Authenticated: true,
			LocalMode:     true,
			Version:       config.AppVersion,
		})
		return
	}
	hash, err := s.store.GetAdminPasswordHash(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tok := auth.ExtractSessionToken(r)
	authed := hash != "" && auth.VerifySession(s.sessionSecret, tok, time.Now())
	writeJSON(w, http.StatusOK, protocol.AuthStatusResponse{
		Initialized:   hash != "",
		Authenticated: authed,
		Version:       config.AppVersion,
	})
}

func (s *Server) handleAuthSetup(w http.ResponseWriter, r *http.Request) {
	existing, err := s.store.GetAdminPasswordHash(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if existing != "" {
		writeError(w, http.StatusConflict, "admin password already initialized")
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.store.SetAdminPasswordHash(r.Context(), hash); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tok, err := auth.SignSession(s.sessionSecret, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	auth.SetSessionCookie(w, r, tok)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": tok})
}

func (s *Server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	hash, err := s.store.GetAdminPasswordHash(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if hash == "" {
		writeError(w, http.StatusPreconditionRequired, "admin password not set")
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !auth.VerifyPassword(hash, body.Password) {
		writeError(w, http.StatusUnauthorized, "密码错误")
		return
	}
	tok, err := auth.SignSession(s.sessionSecret, time.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	auth.SetSessionCookie(w, r, tok)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": tok})
}

func (s *Server) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	auth.ClearSessionCookie(w)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	hash, err := s.store.GetAdminPasswordHash(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !auth.VerifyPassword(hash, body.OldPassword) {
		writeError(w, http.StatusUnauthorized, "原密码不正确")
		return
	}
	newHash, err := auth.HashPassword(body.NewPassword)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.store.SetAdminPasswordHash(r.Context(), newHash); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleIngestBatch(w http.ResponseWriter, r *http.Request) {
	dev := deviceFromContext(r.Context())
	var reader io.Reader = io.LimitReader(r.Body, 16<<20)
	if strings.EqualFold(r.Header.Get("Content-Encoding"), "gzip") {
		gz, err := gzip.NewReader(reader)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid gzip body")
			return
		}
		defer gz.Close()
		reader = io.LimitReader(gz, 32<<20)
	}
	var req protocol.IngestBatchRequest
	if err := json.NewDecoder(reader).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid batch payload: "+err.Error())
		return
	}
	dup, err := s.store.IngestBatch(r.Context(), dev.ID, req, s.cfg.TZOffsetMinutes)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, protocol.IngestBatchResponse{
		OK:         true,
		Duplicate:  dup,
		ReceivedAt: time.Now().Unix(),
	})
}

func (s *Server) handleIngestLive(w http.ResponseWriter, r *http.Request) {
	dev := deviceFromContext(r.Context())
	var req protocol.LivePushRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid live payload")
		return
	}
	for i := range req.TopActive {
		req.TopActive[i].Rule = privacy.SanitizeRule(req.TopActive[i].Rule, privacy.ModeMask)
	}
	if err := s.store.UpdateDeviceLive(r.Context(), dev.ID, req); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.hub.UpdateDevice(dev.ID, req)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleListDevices(w http.ResponseWriter, r *http.Request) {
	tz := queryInt(r, "tz_offset", s.cfg.TZOffsetMinutes)
	devs, err := s.store.ListDevices(r.Context(), tz, s.cfg.OnlineThresholdSec)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": devs})
}

func (s *Server) handleCreateDevice(w http.ResponseWriter, r *http.Request) {
	var req protocol.CreateDeviceRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	dev, token, err := s.store.CreateDevice(r.Context(), req)
	if errors.Is(err, store.ErrInvalidDashboardURL) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, protocol.CreateDeviceResponse{
		Device: dev,
		Token:  token,
	})
}

func (s *Server) handleUpdateDevice(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req protocol.UpdateDeviceRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	dev, err := s.store.UpdateDevice(r.Context(), id, req)
	if errors.Is(err, store.ErrDeviceNotFound) {
		writeError(w, http.StatusNotFound, "device not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, dev)
}

func (s *Server) handleDeleteDevice(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	err := s.store.DeleteDevice(r.Context(), id)
	if errors.Is(err, store.ErrDeviceNotFound) {
		writeError(w, http.StatusNotFound, "device not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.hub.RemoveDevice(id)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.store.GetSettings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

func (s *Server) handlePutSettings(w http.ResponseWriter, r *http.Request) {
	var body protocol.SettingsPayload
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	saved, err := s.store.SaveSettings(r.Context(), body)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleBackupExport(w http.ResponseWriter, r *http.Request) {
	archive, err := s.store.ExportBackup(r.Context(), config.AppVersion)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	filename := fmt.Sprintf("clashlens-backup-%s.json.gz", time.Now().Format("20060102-150405"))
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	gz := gzip.NewWriter(w)
	_ = json.NewEncoder(gz).Encode(archive)
	_ = gz.Close()
}

func (s *Server) handleBackupImport(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	const maxUpload = 32 << 20
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxUpload+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "read backup body failed")
		return
	}
	if len(raw) > maxUpload {
		writeError(w, http.StatusRequestEntityTooLarge, "backup file exceeds 32MB limit")
		return
	}

	var reader io.Reader = bytes.NewReader(raw)
	if strings.EqualFold(r.Header.Get("Content-Encoding"), "gzip") || (len(raw) >= 2 && raw[0] == 0x1f && raw[1] == 0x8b) {
		gz, err := gzip.NewReader(reader)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid gzip backup archive")
			return
		}
		defer gz.Close()
		reader = io.LimitReader(gz, 128<<20)
	}

	var archive protocol.BackupArchive
	if err := json.NewDecoder(reader).Decode(&archive); err != nil {
		writeError(w, http.StatusBadRequest, "invalid backup JSON: "+err.Error())
		return
	}
	mergeSettings := strings.EqualFold(r.URL.Query().Get("merge_settings"), "true") || r.URL.Query().Get("merge_settings") == "1"
	res, err := s.store.ImportBackup(r.Context(), archive, mergeSettings)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) parseFilter(r *http.Request) store.AnalyticsFilter {
	q := r.URL.Query()
	return store.AnalyticsFilter{
		DeviceID:           strings.TrimSpace(q.Get("device_id")),
		Scope:              strings.TrimSpace(q.Get("scope")),
		From:               queryInt64(r, "from", 0),
		To:                 queryInt64(r, "to", 0),
		TZOffsetMin:        queryInt(r, "tz_offset", s.cfg.TZOffsetMinutes),
		GroupBy:            strings.TrimSpace(q.Get("group_by")),
		Interval:           strings.TrimSpace(q.Get("interval")),
		Limit:              queryInt(r, "limit", 50),
		Search:             strings.TrimSpace(q.Get("search")),
		OnlineThresholdSec: s.cfg.OnlineThresholdSec,
	}
}

func (s *Server) handleOverview(w http.ResponseWriter, r *http.Request) {
	res, err := s.store.GetOverview(r.Context(), s.parseFilter(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleHeatmap(w http.ResponseWriter, r *http.Request) {
	res, err := s.store.GetHeatmap(r.Context(), s.parseFilter(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleTimeseries(w http.ResponseWriter, r *http.Request) {
	f := s.parseFilter(r)
	q := r.URL.Query()
	res, err := s.store.GetTimeseries(r.Context(), f, strings.TrimSpace(q.Get("process")), strings.TrimSpace(q.Get("domain")))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleBursts(w http.ResponseWriter, r *http.Request) {
	res, err := s.store.GetBursts(r.Context(), s.parseFilter(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleListApps(w http.ResponseWriter, r *http.Request) {
	res, err := s.store.ListApps(r.Context(), s.parseFilter(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleAppDetail(w http.ResponseWriter, r *http.Request) {
	proc := strings.TrimSpace(r.PathValue("process"))
	if proc == "" {
		writeError(w, http.StatusBadRequest, "process is required")
		return
	}
	res, err := s.store.GetAppDetail(r.Context(), s.parseFilter(r), proc)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleListDomains(w http.ResponseWriter, r *http.Request) {
	res, err := s.store.ListDomains(r.Context(), s.parseFilter(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleDomainDetail(w http.ResponseWriter, r *http.Request) {
	dom := strings.TrimSpace(r.PathValue("domain"))
	if dom == "" {
		writeError(w, http.StatusBadRequest, "domain is required")
		return
	}
	res, err := s.store.GetDomainDetail(r.Context(), s.parseFilter(r), dom)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleNodesAnalytics(w http.ResponseWriter, r *http.Request) {
	res, err := s.store.GetNodesAnalytics(r.Context(), s.parseFilter(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleLiveSnapshot(w http.ResponseWriter, r *http.Request) {
	snap, err := s.hub.BuildSnapshot(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

func (s *Server) handleLiveWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.hub.ServeClient(r.Context(), conn)
}

func decodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	return json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(dst)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": msg})
}

func queryInt(r *http.Request, key string, def int) int {
	v := strings.TrimSpace(r.URL.Query().Get(key))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func queryInt64(r *http.Request, key string, def int64) int64 {
	v := strings.TrimSpace(r.URL.Query().Get(key))
	if v == "" {
		return def
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return def
	}
	return n
}
