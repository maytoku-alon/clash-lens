param(
  [Parameter(Mandatory = $true)]
  [string]$Server,

  [Parameter(Mandatory = $true)]
  [string]$Token,

  [string]$BinaryPath = "",

  [string]$GitHubRepo = "maytoku-alon/clash-lens",

  [switch]$NoAutostart
)

$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "Programs\ClashLens"
$exeDst = Join-Path $installDir "clashlens-agent.exe"
$cfgDir = Join-Path $env:APPDATA "ClashLens"
$cfgPath = Join-Path $cfgDir "agent.yaml"

Write-Host "==> 停止旧版 ClashLens 采集端（如有）..."
Get-Process -Name "clashlens-agent*" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 400

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null

if ($BinaryPath -and (Test-Path $BinaryPath)) {
  Write-Host "==> 从本地路径安装: $BinaryPath"
  Copy-Item -Force $BinaryPath $exeDst
} elseif (Test-Path (Join-Path $PSScriptRoot "..\dist\clashlens-agent-windows-amd64.exe")) {
  $localDist = Join-Path $PSScriptRoot "..\dist\clashlens-agent-windows-amd64.exe"
  Write-Host "==> 使用仓库 dist 构建产物: $localDist"
  Copy-Item -Force $localDist $exeDst
} else {
  $releaseUrl = "https://github.com/$GitHubRepo/releases/latest/download/clashlens-agent-windows-amd64.exe"
  Write-Host "==> 正在从 GitHub Releases 下载最新版本: $releaseUrl"
  try {
    Invoke-WebRequest -Uri $releaseUrl -OutFile $exeDst -UseBasicParsing
  } catch {
    throw "下载失败（若仓库为 Private，请先在浏览器打开 https://github.com/$GitHubRepo/releases 下载 clashlens-agent-windows-amd64.exe，再通过 -BinaryPath 参数指定文件路径）。错误: $_"
  }
}

$cleanServer = $Server.Trim().TrimEnd('/')
$yamlContent = @"
# ClashLens 采集端配置文件
# clash_endpoint 默认 auto，会自动发现本机 Clash Verge Rev 管道或 Mihomo 接口
server_url: "$cleanServer"
device_token: "$Token"
clash_endpoint: "auto"
sanitize_paths: true
sanitize_mode: "mask"
flush_interval_sec: 60
upload_interval_sec: 15
live_push_interval_sec: 2
data_dir: '$cfgDir'
"@
Set-Content -Path $cfgPath -Value $yamlContent -Encoding UTF8
Write-Host "==> 已写入配置: $cfgPath"

if (-not $NoAutostart) {
  $regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  $regVal = "`"$exeDst`" --config `"$cfgPath`""
  Set-ItemProperty -Path $regPath -Name "ClashLensAgent" -Value $regVal
  Write-Host "==> 已启用 Windows 开机自启 (HKCU\...\Run\ClashLensAgent)"
}

Start-Process -FilePath $exeDst -ArgumentList "--config", "`"$cfgPath`"" -WorkingDirectory $installDir
Start-Sleep -Seconds 2
$proc = Get-Process -Name "clashlens-agent" -ErrorAction SilentlyContinue
if ($proc) {
  Write-Host "==> ClashLens 采集端已启动 (PID=$($proc.Id))，可在右下角系统托盘查看状态。"
} else {
  Write-Warning "进程未检测到，请检查 $exeDst 是否被安全软件拦截。"
}
