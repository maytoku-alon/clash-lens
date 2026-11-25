package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	SessionCookieName = "clashlens_session"
	SessionTTL        = 7 * 24 * time.Hour
)

type sessionClaims struct {
	Sub string `json:"sub"`
	Exp int64  `json:"exp"`
}

// HashPassword hashes an admin password with bcrypt.
func HashPassword(password string) (string, error) {
	if len(password) < 4 {
		return "", errors.New("password must be at least 4 characters")
	}
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// VerifyPassword compares a plaintext password against a stored bcrypt hash.
func VerifyPassword(hash, password string) bool {
	if hash == "" || password == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// GenerateRandomHex creates n random bytes encoded as lowercase hex.
func GenerateRandomHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// GenerateDeviceToken mints a plaintext device token ("cl_dev_..."), its SHA-256 hash, and short prefix.
func GenerateDeviceToken() (rawToken, tokenHash, prefix string, err error) {
	buf := make([]byte, 32)
	if _, err = rand.Read(buf); err != nil {
		return "", "", "", err
	}
	rawToken = "cl_dev_" + base64.RawURLEncoding.EncodeToString(buf)
	tokenHash = HashToken(rawToken)
	if len(rawToken) >= 14 {
		prefix = rawToken[:14]
	} else {
		prefix = rawToken
	}
	return rawToken, tokenHash, prefix, nil
}

// HashToken returns the SHA-256 hex digest of a device bearer token.
func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(raw)))
	return hex.EncodeToString(sum[:])
}

// SignSession builds an HMAC-SHA256 signed session token valid for SessionTTL.
func SignSession(secret string, now time.Time) (string, error) {
	claims := sessionClaims{
		Sub: "admin",
		Exp: now.Add(SessionTTL).Unix(),
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	sig := computeHMAC(secret, encoded)
	return encoded + "." + sig, nil
}

// VerifySession validates signature and expiration of a session token.
func VerifySession(secret, token string, now time.Time) bool {
	if secret == "" || token == "" {
		return false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return false
	}
	expected := computeHMAC(secret, parts[0])
	if subtle.ConstantTimeCompare([]byte(parts[1]), []byte(expected)) != 1 {
		return false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return false
	}
	var claims sessionClaims
	if err := json.Unmarshal(raw, &claims); err != nil {
		return false
	}
	return claims.Sub == "admin" && claims.Exp > now.Unix()
}

// SetSessionCookie writes the signed session cookie to the response.
func SetSessionCookie(w http.ResponseWriter, r *http.Request, token string) {
	secure := r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
		MaxAge:   int(SessionTTL.Seconds()),
	})
}

// ClearSessionCookie expires the session cookie immediately.
func ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// ExtractSessionToken reads the admin session token from cookie or Authorization Bearer header.
func ExtractSessionToken(r *http.Request) string {
	if c, err := r.Cookie(SessionCookieName); err == nil && c.Value != "" {
		return c.Value
	}
	return ExtractBearerToken(r)
}

// ExtractBearerToken parses "Authorization: Bearer <token>".
func ExtractBearerToken(r *http.Request) string {
	h := strings.TrimSpace(r.Header.Get("Authorization"))
	if len(h) > 7 && strings.EqualFold(h[:7], "Bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

func computeHMAC(secret, data string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(data))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
