//go:build !windows

package autostart

import "errors"

// IsEnabled returns false on non-Windows hosts (managed via systemd/launchd).
func IsEnabled(_ string) bool {
	return false
}

// SetEnabled returns an unsupported notice on non-Windows hosts.
func SetEnabled(_ string, _ string, _ bool) error {
	return errors.New("registry autostart is only supported on Windows; use systemd on Linux")
}

// SetEnabledWithArgs returns an unsupported notice on non-Windows hosts.
func SetEnabledWithArgs(_ string, _ string, _ bool) error {
	return errors.New("registry autostart is only supported on Windows; use systemd on Linux")
}
