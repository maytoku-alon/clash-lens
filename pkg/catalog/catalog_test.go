package catalog_test

import (
	"encoding/json"
	"strings"
	"testing"

	"clash-lens/pkg/catalog"
)

func TestCatalogSchemaAndEntries(t *testing.T) {
	c := catalog.Default()
	if c.Version < 1 {
		t.Fatalf("expected catalog version >= 1, got %d", c.Version)
	}
	if len(c.ProcessAliases) == 0 || len(c.ExactHosts) == 0 || len(c.RootDomains) == 0 {
		t.Fatalf("expected non-empty catalog sections")
	}

	checkMap := func(name string, m map[string]catalog.LocalizedName) {
		t.Helper()
		for k, v := range m {
			if k != strings.ToLower(strings.TrimSpace(k)) || k == "" {
				t.Fatalf("%s key %q must be non-empty trimmed lowercase", name, k)
			}
			if strings.TrimSpace(v.ZH) == "" || strings.TrimSpace(v.EN) == "" {
				t.Fatalf("%s[%q] missing zh or en translation: %+v", name, k, v)
			}
		}
	}

	checkMap("process_aliases", c.ProcessAliases)
	checkMap("exact_hosts", c.ExactHosts)
	checkMap("root_domains", c.RootDomains)
}

func TestCatalogLookups(t *testing.T) {
	if got, ok := catalog.LookupProcess("WeChat.exe", "zh"); !ok || got != "微信" {
		t.Fatalf("LookupProcess(WeChat.exe, zh) = %q, %v", got, ok)
	}
	if got, ok := catalog.LookupProcess("WeChat.exe", "en"); !ok || got != "WeChat" {
		t.Fatalf("LookupProcess(WeChat.exe, en) = %q, %v", got, ok)
	}
	if got := catalog.LookupService("api.openai.com", "openai.com", "zh"); got != "OpenAI API" {
		t.Fatalf("exact host precedence failed, got %q", got)
	}
	if got := catalog.LookupService("", "googlevideo.com", "zh"); got != "YouTube 视频流" {
		t.Fatalf("root domain zh lookup failed, got %q", got)
	}
	if got := catalog.LookupService("", "googlevideo.com", "en"); got != "YouTube Video Stream" {
		t.Fatalf("root domain en lookup failed, got %q", got)
	}

	var decoded catalog.Catalog
	if err := json.Unmarshal(catalog.RawJSON(), &decoded); err != nil {
		t.Fatalf("RawJSON unmarshal failed: %v", err)
	}
}
