param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("install", "uninstall", "stop")]
  [string]$Action
)

$root = $PSScriptRoot
$startup = [Environment]::GetFolderPath("Startup")
$lnk = Join-Path $startup "VoraToon Presence.lnk"

function Stop-Bridge {
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like "*server.js*--voratoon-bridge*" }
  foreach ($p in $procs) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
  return @($procs).Count
}

switch ($Action) {
  "install" {
    $shell = New-Object -ComObject WScript.Shell
    $s = $shell.CreateShortcut($lnk)
    $s.TargetPath = "wscript.exe"
    $s.Arguments = '"' + (Join-Path $root "start-hidden.vbs") + '"'
    $s.WorkingDirectory = $root
    $s.WindowStyle = 7
    $s.Save()
    Write-Host "Autostart terpasang: $lnk"
  }
  "uninstall" {
    if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host "Autostart dihapus." }
    else { Write-Host "Autostart memang belum terpasang." }
    $n = Stop-Bridge
    Write-Host "Bridge dihentikan ($n proses)."
  }
  "stop" {
    $n = Stop-Bridge
    Write-Host "Bridge dihentikan ($n proses)."
  }
}
