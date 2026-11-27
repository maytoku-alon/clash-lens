package catalog

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
)

//go:embed services.json
var rawCatalogJSON []byte

// LocalizedName stores Chinese and English labels for a service domain or process alias.
type LocalizedName struct {
	ZH string `json:"zh"`
	EN string `json:"en"`
}

// Pick returns the label matching the requested language code ("en" or "zh"), falling back gracefully.
func (l LocalizedName) Pick(lang string) string {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(lang)), "en") {
		if l.EN != "" {
			return l.EN
		}
		return l.ZH
	}
	if l.ZH != "" {
		return l.ZH
	}
	return l.EN
}

// Catalog holds community-editable process aliases and domain service tags embedded at build time.
type Catalog struct {
	Version        int                      `json:"version"`
	ProcessAliases map[string]LocalizedName `json:"process_aliases"`
	ExactHosts     map[string]LocalizedName `json:"exact_hosts"`
	RootDomains    map[string]LocalizedName `json:"root_domains"`
}

var (
	defaultOnce    sync.Once
	defaultCatalog *Catalog
	defaultErr     error
)

// Default returns the embedded singleton service catalog.
func Default() *Catalog {
	defaultOnce.Do(func() {
		var c Catalog
		if err := json.Unmarshal(rawCatalogJSON, &c); err != nil {
			defaultErr = fmt.Errorf("decode embedded services catalog: %w", err)
			return
		}
		defaultCatalog = &c
	})
	if defaultErr != nil {
		panic(defaultErr)
	}
	return defaultCatalog
}

// RawJSON returns the raw embedded services.json payload for serving over HTTP.
func RawJSON() []byte {
	return rawCatalogJSON
}

// LookupProcess resolves a process identifier (with or without .exe) in the requested language.
func LookupProcess(proc, lang string) (string, bool) {
	c := Default()
	key := strings.ToLower(strings.TrimSpace(proc))
	if key == "" {
		return "", false
	}
	if entry, ok := c.ProcessAliases[key]; ok {
		return entry.Pick(lang), true
	}
	keyNoExe := strings.TrimSuffix(key, ".exe")
	if entry, ok := c.ProcessAliases[keyNoExe]; ok {
		return entry.Pick(lang), true
	}
	return "", false
}

// LookupService resolves an exact host or root domain into a built-in localized service tag.
func LookupService(host, rootDomain, lang string) string {
	c := Default()
	if h := strings.ToLower(strings.TrimSpace(host)); h != "" {
		if entry, ok := c.ExactHosts[h]; ok {
			return entry.Pick(lang)
		}
	}
	if r := strings.ToLower(strings.TrimSpace(rootDomain)); r != "" {
		if entry, ok := c.RootDomains[r]; ok {
			return entry.Pick(lang)
		}
	}
	return ""
}
