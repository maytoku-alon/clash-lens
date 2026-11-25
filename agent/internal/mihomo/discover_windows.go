//go:build windows

package mihomo

import (
	"context"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/Microsoft/go-winio"
	"golang.org/x/sys/windows"
	"gopkg.in/yaml.v3"
)

func dialPipeContext(ctx context.Context, pipePath string) (net.Conn, error) {
	return winio.DialPipeContext(ctx, pipePath)
}

type clashVergeYAML struct {
	ExternalControllerPipe string `yaml:"external-controller-pipe"`
	ExternalController     string `yaml:"external-controller"`
	Secret                 string `yaml:"secret"`
}

func discoverCandidates(explicitSecret string) []Endpoint {
	var candidates []Endpoint
	seen := make(map[string]bool)

	add := func(kind, target, secret string) {
		key := kind + "|" + target
		if target == "" || seen[key] {
			return
		}
		seen[key] = true
		candidates = append(candidates, Endpoint{
			Raw:    formatEndpointRaw(kind, target),
			Kind:   kind,
			Target: target,
			Secret: secret,
		})
	}

	// 1. Enumerate live Windows Named Pipes via Win32 FindFirstFileW / FindNextFileW
	pipes := listWindowsPipes()
	var prodPipes, sidecarPipes, otherPipes []string
	for _, p := range pipes {
		low := strings.ToLower(p)
		switch {
		case strings.Contains(low, "verge-mihomo-production"):
			prodPipes = append(prodPipes, `\\.\pipe\`+p)
		case strings.Contains(low, "verge-mihomo-sidecar"):
			sidecarPipes = append(sidecarPipes, `\\.\pipe\`+p)
		case strings.Contains(low, "verge-mihomo") || strings.Contains(low, "mihomo"):
			otherPipes = append(otherPipes, `\\.\pipe\`+p)
		}
	}
	sort.Strings(prodPipes)
	sort.Strings(sidecarPipes)
	sort.Strings(otherPipes)

	for _, p := range prodPipes {
		add(kindPipe, p, explicitSecret)
	}
	for _, p := range sidecarPipes {
		add(kindPipe, p, explicitSecret)
	}
	for _, p := range otherPipes {
		add(kindPipe, p, explicitSecret)
	}

	// 2. Inspect Clash Verge Rev config file if present for pipe/controller/secret fallback
	if appData := os.Getenv("APPDATA"); appData != "" {
		cfgPaths := []string{
			filepath.Join(appData, "io.github.clash-verge-rev.clash-verge-rev", "clash-verge.yaml"),
			filepath.Join(appData, "clash-verge", "clash-verge.yaml"),
		}
		for _, cp := range cfgPaths {
			if raw, err := os.ReadFile(cp); err == nil {
				var cy clashVergeYAML
				if err := yaml.Unmarshal(raw, &cy); err == nil {
					sec := explicitSecret
					if sec == "" {
						sec = cy.Secret
					}
					if cy.ExternalControllerPipe != "" {
						add(kindPipe, cy.ExternalControllerPipe, sec)
					}
					if cy.ExternalController != "" {
						addr := normalizeControllerHTTP(cy.ExternalController)
						if addr != "" {
							add(kindHTTP, addr, sec)
						}
					}
				}
			}
		}
	}

	// 3. Common local Mihomo HTTP controller ports
	add(kindHTTP, "http://127.0.0.1:9097", explicitSecret)
	add(kindHTTP, "http://127.0.0.1:9090", explicitSecret)

	return candidates
}

func listWindowsPipes() []string {
	pattern, err := windows.UTF16PtrFromString(`\\.\pipe\*`)
	if err != nil {
		return nil
	}
	var data windows.Win32finddata
	handle, err := windows.FindFirstFile(pattern, &data)
	if err != nil {
		return nil
	}
	defer windows.FindClose(handle)

	var pipes []string
	for {
		name := windows.UTF16ToString(data.FileName[:])
		if name != "" && name != "." && name != ".." {
			pipes = append(pipes, name)
		}
		if err := windows.FindNextFile(handle, &data); err != nil {
			break
		}
	}
	return pipes
}

func formatEndpointRaw(kind, target string) string {
	switch kind {
	case kindPipe:
		return "pipe://" + target
	case kindUnix:
		return "unix://" + target
	default:
		return target
	}
}

// Ensure time is referenced only if needed in future pipe probes.
var _ = time.Second
