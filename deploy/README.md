# ClashLens 部署与使用指南

ClashLens 是一款面向 Clash / Mihomo（如 Clash Verge Rev）的多端流量透视监控系统：支持应用进程 × 主域名 × 子域名联合归因、TUN 模式出口统计、365 天热力图、时段框选溯源与机场倍率计费。

---

## 一、服务端部署（你的自建服务器）

### 方式 A：单二进制极速部署（推荐，无需 Docker）
项目已预先编译好无 CGO 静态二进制 `dist/clashlens-server-linux-amd64`（已内嵌完整 Web 大屏）：

```bash
mkdir -p /opt/clashlens/data
# 上传 dist/clashlens-server-linux-amd64 到 /opt/clashlens/
chmod +x /opt/clashlens/clashlens-server-linux-amd64

# 前台试跑或配合 systemd 后台运行
/opt/clashlens/clashlens-server-linux-amd64 -addr :8080 -db /opt/clashlens/data/clashlens.db
```

systemd 守护模板见 `deploy/clashlens-server.service`。建议前边套一层 Nginx / Caddy 开启 HTTPS 域名访问。

### 方式 B：Docker Compose 部署
在 `clash-lens/deploy/` 目录下执行：

```bash
docker compose up -d --build
```

打开 `http://<你的服务器IP>:8080`，首次访问会引导你设置管理员密码。

---

## 二、Windows（本机 & 笔记本）采集端使用

1. 打开 Web 大屏 → **设备与设置** → **添加监控设备**，生成专属 `Device Token`（若无需中心服务器，也可直接双击 **`clashlens-local-windows-amd64.exe`** 或添加 `--local` 参数以纯本地模式启动）。
2. 本项目提供多款 Windows 版本供不同场景使用：
   - **日常托盘静默版（连接服务端）**：`dist/clashlens-agent-windows-amd64.exe`（适合双击运行或设置开机自启）。
   - **纯本地独立版（内嵌大屏与 SQLite）**：`clashlens-local-windows-amd64.exe`（无需配置服务器与 Token，双击即用，支持大屏导入/导出备份迁机合并）。
   - **命令行诊断版**：`dist/clashlens-agent-cli-windows-amd64.exe`（适合在终端里跑 `--test-clash` 或 `--headless` 观察日志）。
3. 先做一键诊断（不上传，仅验证本机 Clash Verge Rev 连通性）：
   ```powershell
   .\dist\clashlens-agent-cli-windows-amd64.exe --test-clash
   ```
4. 首次运行会自动生成 `%APPDATA%\ClashLens\agent.yaml`，填入你的 `server_url` 与 `device_token`（或者将 `agent.yaml` 放在 `.exe` 同级目录实现绿色便携运行）。
5. 双击 `clashlens-agent-windows-amd64.exe` 即会驻留 **Windows 系统托盘**，右键菜单支持查看今日代理消耗、实时速率、一键打开大屏以及勾选 **开机自启**。

> **关于 TUN 模式的贴士**：如果你在 Clash Verge Rev 中开启了 **TUN 模式**，建议同时开启 **域名嗅探（Sniffer）**，这样原本只走 IP 直连的应用流量也能还原出访问网站域名；即使暂未开启，大屏仍会完整统计该应用的 TUN 出口流量并给出提示。

---

## 三、Linux 服务器采集端（将来安装 Clash/Mihomo 后）

1. 将 `dist/clashlens-agent-linux-amd64` 上传至 `/usr/local/bin/clashlens-agent` 并 `chmod +x`。
2. 编写 `/etc/clashlens/agent.yaml`：
   ```yaml
   server_url: "https://你的监控域名"
   device_token: "cl_dev_xxx"
   clash_endpoint: "auto" # 自动探测 Unix Socket 或 127.0.0.1:9090
   ```
3. 使用 `deploy/clashlens-agent.service` 启用 `systemctl enable --now clashlens-agent`。
