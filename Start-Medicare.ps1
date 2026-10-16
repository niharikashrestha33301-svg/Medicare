$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$databaseRunning = Test-NetConnection -ComputerName localhost -Port 3306 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $databaseRunning) {
  $mysqlExecutable = 'C:\xampp\mysql\bin\mysqld.exe'
  if (-not (Test-Path -LiteralPath $mysqlExecutable)) { throw 'Start your MySQL server before starting Medicare.' }
  Start-Process -FilePath $mysqlExecutable -ArgumentList '--defaults-file=C:/xampp/mysql/bin/my.ini', '--standalone' -WorkingDirectory 'C:\xampp' -WindowStyle Hidden
  $databaseReady = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $connection = New-Object System.Net.Sockets.TcpClient
      $connection.Connect('localhost', 3306)
      $connection.Dispose()
      $databaseReady = $true
      break
    } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $databaseReady) { throw 'MySQL could not start. Check the XAMPP MySQL log before opening Medicare.' }
}
try {
  $null = Invoke-RestMethod 'http://localhost:5000/api/health' -TimeoutSec 2
  Start-Process 'http://localhost:5000'
  return
} catch {}
$server = Start-Process -FilePath 'node.exe' -ArgumentList 'server.js' -WorkingDirectory (Join-Path $PSScriptRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'backend/server-output.log') -RedirectStandardError (Join-Path $PSScriptRoot 'backend/server-error.log')
$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  try { $null = Invoke-RestMethod 'http://localhost:5000/api/health' -TimeoutSec 1; $ready = $true; break } catch { Start-Sleep -Milliseconds 250 }
}
if (-not $ready) { throw 'Medicare could not start. Check backend/server-error.log.' }
Start-Process 'http://localhost:5000'
Write-Host 'Medicare is running at http://localhost:5000. Keep this terminal open.'
Wait-Process -Id $server.Id
