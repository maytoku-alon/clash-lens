//go:build windows

package autostart

import (
	"fmt"
	"os"

	"golang.org/x/sys/windows/registry"
)

const runKeyPath = `Software\Microsoft\Windows\CurrentVersion\Run`

// IsEnabled checks whether the Windows HKCU Run entry for appName exists.
func IsEnabled(appName string) bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKeyPath, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	val, _, err := k.GetStringValue(appName)
	return err == nil && val != ""
}

// SetEnabled adds or removes the Windows HKCU Run entry pointing to the current executable with --config.
func SetEnabled(appName string, configPath string, enabled bool) error {
	args := ""
	if configPath != "" {
		args = fmt.Sprintf(`--config "%s"`, configPath)
	}
	return SetEnabledWithArgs(appName, args, enabled)
}

// SetEnabledWithArgs adds or removes a Windows HKCU Run entry pointing to the current executable with custom CLI args.
func SetEnabledWithArgs(appName string, args string, enabled bool) error {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, runKeyPath, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()

	if !enabled {
		err := k.DeleteValue(appName)
		if err == registry.ErrNotExist {
			return nil
		}
		return err
	}

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	cmd := fmt.Sprintf(`"%s"`, exe)
	if args != "" {
		cmd = fmt.Sprintf(`"%s" %s`, exe, args)
	}
	return k.SetStringValue(appName, cmd)
}
