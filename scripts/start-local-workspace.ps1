param(
  [string]$WorkspaceRoot = (Split-Path -Parent $PSScriptRoot),
  [int]$BasePort = 3000
)

$resolvedRoot = (Resolve-Path -LiteralPath $WorkspaceRoot).Path
$projects = Get-ChildItem -LiteralPath $resolvedRoot -Directory -Recurse -Depth 2 |
  Where-Object {
    $_.FullName -notmatch '[\\/](node_modules|dist|build|\.git)([\\/]|$)' -and
    (Test-Path -LiteralPath (Join-Path $_.FullName 'package.json'))
  }

if (Test-Path -LiteralPath (Join-Path $resolvedRoot 'package.json')) {
  $projects = @((Get-Item -LiteralPath $resolvedRoot)) + @($projects)
}

$port = $BasePort
foreach ($project in $projects | Sort-Object FullName -Unique) {
  $logDir = Join-Path $project.FullName '.local-server'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $stdout = Join-Path $logDir 'stdout.log'
  $stderr = Join-Path $logDir 'stderr.log'
  $env:PORT = [string]$port
  $env:DISABLE_HMR = 'false'
  $env:HMR_PORT = [string]($port + 10000)
  $process = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $project.FullName -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  [pscustomobject]@{ Project = $project.Name; Port = $port; ProcessId = $process.Id; Url = "http://localhost:$port"; Logs = $logDir }
  $port++
}
