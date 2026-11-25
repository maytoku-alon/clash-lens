//go:build !windows

package mihomo

import (
	"context"
	"errors"
	"net"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

func dialPipeContext(_ context.Context, _ string) (net.Conn, error) {
	return nil, errors.New("windows named pipes are not supported on this OS")
}

type clashVergeYAML struct {
	ExternalControllerUnix string `yaml:"external-controller-unix"`
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

	sockPaths := []string{
		"/tmp/verge/verge-mihomo.sock",
		"/tmp/verge-mihomo.sock",
		"/run/mihomo/mihomo.sock",
	}
	if xdg := os.Getenv("XDG_RUNTIME_DIR"); xdg != "" {
		sockPaths = append(sockPaths,
			filepath.Join(xdg, "verge-mihomo.sock"),
			filepath.Join(xdg, "clash-verge", "verge-mihomo.sock"),
		)
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		cfgPaths := []string{
			filepath.Join(home, ".config", "io.github.clash-verge-rev.clash-verge-rev", "clash-verge.yaml"),
			filepath.Join(home, "Library", "Application Support", "io.github.clash-verge-rev.clash-verge-rev", "clash-verge.yaml"),
		}
		for _, cp := range cfgPaths {
			if raw, err := os.ReadFile(cp); err == nil {
				var cy clashVergeYAML
				if err := yaml.Unmarshal(raw, &cy); err == nil {
					sec := explicitSecret
					if sec == "" {
						sec = cy.Secret
					}
					if cy.ExternalControllerUnix != "" {
						add(kindUnix, cy.ExternalControllerUnix, sec)
					}
					if cy.ExternalController != "" {
						if addr := normalizeControllerHTTP(cy.ExternalController); addr != "" {
							add(kindHTTP, addr, sec)
						}
					}
				}
			}
		}
	}

	for _, sp := range sockPaths {
		if _, err := os.Stat(sp); err == nil {
			add(kindUnix, sp, explicitSecret)
		}
	}

	add(kindHTTP, "http://127.0.0.1:9097", explicitSecret)
	add(kindHTTP, "http://127.0.0.1:9090", explicitSecret)
	return candidates
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
