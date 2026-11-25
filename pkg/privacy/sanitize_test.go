package privacy_test

import (
	"strings"
	"testing"

	"clash-lens/pkg/privacy"
)

func TestSanitizeRule(t *testing.T) {
	tests := []struct {
		name string
		rule string
		mode string
		want string
	}{
		{
			name: "windows regex double backslash user path",
			rule: `ProcessPathRegex,(?i)^C:\\Users\\Administrator\\AppData\\Local\\Programs\\antigravity\\`,
			mode: privacy.ModeMask,
			want: `ProcessPathRegex,<USER_HOME>/.../antigravity`,
		},
		{
			name: "windows regex trailing wildcard and dollar",
			rule: `ProcessPathRegex,(?i)^C:\\Users\\zhangsan\\AppData\\Local\\Programs\\antigravity\\.*$`,
			mode: privacy.ModeMask,
			want: `ProcessPathRegex,<USER_HOME>/.../antigravity`,
		},
		{
			name: "windows exact process path",
			rule: `ProcessPath,C:\Users\lisi\AppData\Local\Programs\antigravity\Antigravity.exe`,
			mode: privacy.ModeMask,
			want: `ProcessPath,<USER_HOME>/.../Antigravity.exe`,
		},
		{
			name: "windows user root never leaks username",
			rule: `ProcessPath,C:\Users\user123\`,
			mode: privacy.ModeMask,
			want: `ProcessPath,<USER_HOME>`,
		},
		{
			name: "linux home path",
			rule: `ProcessPath,/home/zhangsan/apps/clash/mihomo`,
			mode: privacy.ModeMask,
			want: `ProcessPath,<USER_HOME>/.../mihomo`,
		},
		{
			name: "macos single segment under user home",
			rule: `ProcessPath,/Users/lisi/Desktop`,
			mode: privacy.ModeMask,
			want: `ProcessPath,<USER_HOME>/Desktop`,
		},
		{
			name: "windows program files path",
			rule: `ProcessPath,C:\Program Files\App\tool.exe`,
			mode: privacy.ModeMask,
			want: `ProcessPath,<PATH>/.../tool.exe`,
		},
		{
			name: "plain keyword process regex untouched",
			rule: `ProcessPathRegex,antigravity`,
			mode: privacy.ModeMask,
			want: `ProcessPathRegex,antigravity`,
		},
		{
			name: "compound AND rule masks embedded windows home path",
			rule: `AND,((PROCESS-PATH,C:\Users\user123\AppData\Local\Programs\antigravity\app.exe),(DOMAIN,google.com))`,
			mode: privacy.ModeMask,
			want: `AND,((PROCESS-PATH,<USER_HOME>/.../app.exe),(DOMAIN,google.com))`,
		},
		{
			name: "domain rule preserved",
			rule: `DOMAIN-SUFFIX,googleapis.com`,
			mode: privacy.ModeMask,
			want: `DOMAIN-SUFFIX,googleapis.com`,
		},
		{
			name: "match rule preserved",
			rule: `MATCH`,
			mode: privacy.ModeMask,
			want: `MATCH`,
		},
		{
			name: "already masked rule is idempotent",
			rule: `ProcessPathRegex,<USER_HOME>/.../antigravity`,
			mode: privacy.ModeMask,
			want: `ProcessPathRegex,<USER_HOME>/.../antigravity`,
		},
		{
			name: "strict mode redacts completely",
			rule: `ProcessPathRegex,(?i)^C:\\Users\\Administrator\\AppData\\Local\\Programs\\antigravity\\`,
			mode: privacy.ModeStrict,
			want: `ProcessPathRegex,<REDACTED>`,
		},
		{
			name: "off mode preserves original rule",
			rule: `ProcessPathRegex,(?i)^C:\\Users\\Administrator\\AppData\\Local\\Programs\\antigravity\\`,
			mode: privacy.ModeOff,
			want: `ProcessPathRegex,(?i)^C:\\Users\\Administrator\\AppData\\Local\\Programs\\antigravity\\`,
		},
	}

	sampleUsers := []string{"administrator", "zhangsan", "lisi", "user123"}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := privacy.SanitizeRule(tc.rule, tc.mode)
			if got != tc.want {
				t.Fatalf("SanitizeRule(%q, %q) = %q, want %q", tc.rule, tc.mode, got, tc.want)
			}
			if tc.mode != privacy.ModeOff {
				lower := strings.ToLower(got)
				for _, u := range sampleUsers {
					if strings.Contains(lower, u) {
						t.Fatalf("sanitized rule still leaks username %q: %q", u, got)
					}
				}
			}
		})
	}
}
