//go:build windows

package tray

import (
	"context"
	"fmt"
	"os/exec"
	"time"

	"clash-lens/agent/internal/autostart"
	"clash-lens/agent/internal/collector"
	"clash-lens/agent/internal/uploader"
	"fyne.io/systray"
)

const appRegName = "ClashLensAgent"

// StatusProvider supplies live runtime status text to the Windows tray menu.
type StatusProvider struct {
	ServerURL     string
	ConfigPath    string
	ConfigDir     string
	LocalMode     bool
	RegName       string
	AutostartArgs string
	Collector     *collector.Collector
	Uploader      *uploader.Client
	GetClashInfo  func() (connected bool, endpoint string, tun bool, sniffer bool)
	SyncNow       func()
}

// Run starts the Windows system tray event loop until Quit is clicked or ctx is canceled.
func Run(ctx context.Context, cancel context.CancelFunc, sp StatusProvider) {
	regName := sp.RegName
	if regName == "" {
		regName = appRegName
	}
	autostartArgs := sp.AutostartArgs
	if autostartArgs == "" && sp.ConfigPath != "" {
		autostartArgs = fmt.Sprintf(`--config "%s"`, sp.ConfigPath)
	}

	go func() {
		<-ctx.Done()
		systray.Quit()
	}()

	onReady := func() {
		systray.SetIcon(BuildIconICO())
		if sp.LocalMode {
			systray.SetTitle("ClashLens 本地")
			systray.SetTooltip("ClashLens 流量监控 (本地独立模式)")
		} else {
			systray.SetTitle("ClashLens")
			systray.SetTooltip("ClashLens 流量监控采集端")
		}

		mStatus := systray.AddMenuItem("● Clash: 连接中...", "")
		mStatus.Disable()
		mLive := systray.AddMenuItem("实时: ↓ 0 B/s  ↑ 0 B/s", "")
		mLive.Disable()
		syncInit := "云端同步: 初始化..."
		if sp.LocalMode {
			syncInit = "本地存储: 初始化..."
		}
		mSync := systray.AddMenuItem(syncInit, "")
		mSync.Disable()

		systray.AddSeparator()
		mOpenUI := systray.AddMenuItem("打开监控大屏", "在默认浏览器打开 ClashLens 面板")
		mSyncNow := systray.AddMenuItem("立即同步数据", "立即提交当前周期并保存")
		mAutoStart := systray.AddMenuItemCheckbox("开机自启", "随 Windows 登录自动启动", autostart.IsEnabled(regName))
		mOpenDir := systray.AddMenuItem("打开配置目录", "打开配置文件与数据目录")
		systray.AddSeparator()
		mQuit := systray.AddMenuItem("退出 ClashLens", "停止采集并退出")

		refresh := func() {
			connected, _, tun, _ := sp.GetClashInfo()
			if connected {
				modeLabel := "系统代理"
				if tun {
					modeLabel = "TUN 模式"
				}
				mStatus.SetTitle(fmt.Sprintf("● Clash Verge 已连接 (%s)", modeLabel))
			} else {
				mStatus.SetTitle("○ 等待 Clash Verge 启动...")
			}

			live := sp.Collector.SnapshotLive()
			mLive.SetTitle(fmt.Sprintf("今日代理 %s | ↓ %s/s ↑ %s/s",
				formatBytes(live.TodayProxyBytes),
				formatBytes(live.Payload.DownBps),
				formatBytes(live.Payload.UpBps),
			))
			systray.SetTooltip(fmt.Sprintf("ClashLens\n今日代理: %s\n↓ %s/s  ↑ %s/s",
				formatBytes(live.TodayProxyBytes),
				formatBytes(live.Payload.DownBps),
				formatBytes(live.Payload.UpBps),
			))

			st := sp.Uploader.Status(ctx)
			switch {
			case sp.LocalMode && st.LastError == "":
				mSync.SetTitle(fmt.Sprintf("本地存储: 正常 (待写 %d 批)", st.Pending))
			case sp.LocalMode && st.LastError != "":
				mSync.SetTitle(fmt.Sprintf("本地存储: 写入异常 (待写 %d 批)", st.Pending))
			case !st.Configured:
				mSync.SetTitle("云端同步: 未配置 Token (请编辑 agent.yaml)")
			case st.LastError != "":
				mSync.SetTitle(fmt.Sprintf("云端同步: 离线缓冲中 (待传 %d 批)", st.Pending))
			default:
				mSync.SetTitle(fmt.Sprintf("云端同步: 正常 (待传 %d 批)", st.Pending))
			}
		}

		refresh()
		ticker := time.NewTicker(3 * time.Second)

		go func() {
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					refresh()
				case <-mOpenUI.ClickedCh:
					if sp.ServerURL != "" {
						_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", sp.ServerURL).Start()
					}
				case <-mSyncNow.ClickedCh:
					if sp.SyncNow != nil {
						go sp.SyncNow()
					}
				case <-mAutoStart.ClickedCh:
					next := !mAutoStart.Checked()
					if err := autostart.SetEnabledWithArgs(regName, autostartArgs, next); err == nil {
						if next {
							mAutoStart.Check()
						} else {
							mAutoStart.Uncheck()
						}
					}
				case <-mOpenDir.ClickedCh:
					if sp.ConfigDir != "" {
						_ = exec.Command("explorer", sp.ConfigDir).Start()
					}
				case <-mQuit.ClickedCh:
					cancel()
					systray.Quit()
					return
				}
			}
		}()
	}

	onExit := func() {
		cancel()
	}

	systray.Run(onReady, onExit)
}

func formatBytes(b int64) string {
	if b < 1024 {
		return fmt.Sprintf("%d B", b)
	}
	const unit = 1024.0
	val := float64(b)
	units := []string{"KB", "MB", "GB", "TB"}
	idx := -1
	for val >= unit && idx < len(units)-1 {
		val /= unit
		idx++
	}
	if idx < 0 {
		return fmt.Sprintf("%d B", b)
	}
	return fmt.Sprintf("%.1f %s", val, units[idx])
}
