# 健康透镜 HealthLens · Copyright © 2026 dofen. Licensed under the MIT License.
# 健康透镜：在桌面、开始菜单和程序文件夹里创建快捷方式
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cands = @()
try {
  $p = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe' -ErrorAction Stop).'(default)'
  if ($p) { $cands += $p }
} catch { }
$cands += "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$cands += "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
$cands += "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
$edge = $cands | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $edge) {
  Write-Host '没有找到 Microsoft Edge，无法创建快捷方式。可以直接双击「健康透镜.cmd」，会用默认浏览器打开。' -ForegroundColor Yellow
  exit 1
}
$index = Join-Path $root 'app\index.html'
if (-not (Test-Path -LiteralPath $index)) { Write-Host "找不到 $index，请确认文件夹完整。" -ForegroundColor Red; exit 1 }
$url = (New-Object System.Uri $index).AbsoluteUri
$profileDir = Join-Path $root 'data\edge-profile'
$arguments = "--app=`"$url`" --user-data-dir=`"$profileDir`" --no-first-run --no-default-browser-check --window-size=1480,940"
$icon = Join-Path $root 'app\img\icon.ico'
$shell = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) '健康透镜.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) '健康透镜.lnk'),
  (Join-Path $root '健康透镜.lnk')
)
foreach ($t in $targets) {
  try {
    $s = $shell.CreateShortcut($t)
    $s.TargetPath = $edge
    $s.Arguments = $arguments
    $s.WorkingDirectory = $root
    $s.IconLocation = "$icon,0"
    $s.Description = '健康透镜：查看和分析 iPhone「健康」导出的数据（© 2026 dofen）'
    $s.Save()
    Write-Host "已创建：$t"
  } catch {
    Write-Host "没能创建 $t ：$($_.Exception.Message)" -ForegroundColor Yellow
  }
}
Write-Host ''
Write-Host "Edge 位置：$edge"
Write-Host '完成。以后双击桌面上的「健康透镜」就能打开；也可以右键它「固定到任务栏」。' -ForegroundColor Green
