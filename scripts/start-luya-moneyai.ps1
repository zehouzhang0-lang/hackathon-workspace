[CmdletBinding()]
param(
    [string]$MoneyAIHome = $env:MONEYAI_HOME,
    [string]$ProjectDir,
    [ValidateRange(1, 65535)][int]$MoneyAIPort = 31416,
    [ValidateRange(1, 65535)][int]$DemoPort = 4188,
    [string]$ProviderId,
    [switch]$ConfigureProviderKey,
    [switch]$VerifyProvider,
    [switch]$EnableAnalysis,
    [switch]$EnableExtraction,
    [switch]$EnableHistory,
    [switch]$HistoryReadVerified,
    [string]$PythonExe = "python"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-MoneyAIHome {
    param([string]$Requested)

    $candidates = @($Requested, "D:\MoneyAI-Agents", "C:\MoneyAI-Agents") |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    foreach ($candidate in $candidates) {
        $node = Join-Path $candidate "nodejs\node.exe"
        $server = Join-Path $candidate "server-dist.js"
        if ((Test-Path -LiteralPath $node -PathType Leaf) -and (Test-Path -LiteralPath $server -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    throw "找不到 MoneyAI-Agents。请用 -MoneyAIHome 指向其安装目录。"
}

function Test-TcpListener {
    param([int]$Port)

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne(250)) { return $false }
        $client.EndConnect($pending)
        return $true
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Invoke-MoneyAIAdmin {
    param(
        [string]$Route,
        [hashtable]$Payload
    )

    $uri = "http://127.0.0.1:$MoneyAIPort/api/admin/$Route"
    $jsonBody = $Payload | ConvertTo-Json -Depth 8 -Compress
    return Invoke-RestMethod -Uri $uri -Method Post -ContentType "application/json" -Body $jsonBody -TimeoutSec 30
}

function Assert-Success {
    param($Response, [string]$Action)

    if ($null -eq $Response -or $Response.success -ne $true) {
        $detail = if ($null -ne $Response -and $Response.PSObject.Properties.Name -contains "error") {
            [string]$Response.error
        } else {
            "未知错误"
        }
        throw "$Action 失败：$detail"
    }
}

if (($ConfigureProviderKey -or $VerifyProvider) -and [string]::IsNullOrWhiteSpace($ProviderId)) {
    throw "使用 -ConfigureProviderKey 或 -VerifyProvider 时必须同时指定 -ProviderId。"
}
if ($HistoryReadVerified -and -not $EnableHistory) {
    throw "-HistoryReadVerified 只能与 -EnableHistory 一起使用。"
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$resolvedMoneyAIHome = Resolve-MoneyAIHome -Requested $MoneyAIHome
$nodeExe = Join-Path $resolvedMoneyAIHome "nodejs\node.exe"
$serverDist = Join-Path $resolvedMoneyAIHome "server-dist.js"

if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        throw "LOCALAPPDATA 不可用；请显式传入 -ProjectDir（必须在仓库外）。"
    }
    $ProjectDir = Join-Path $env:LOCALAPPDATA "Luya\MoneyAI"
}
$resolvedProjectDir = [IO.Path]::GetFullPath($ProjectDir)
$repoPrefix = $repoRoot.TrimEnd("\") + "\"
if ($resolvedProjectDir.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "MoneyAI 项目空间必须放在仓库外，避免本地记录被提交。"
}
New-Item -ItemType Directory -Path $resolvedProjectDir -Force | Out-Null

if (Test-TcpListener -Port $MoneyAIPort) {
    throw "端口 $MoneyAIPort 已被占用。脚本不会停止未知进程；请关闭自己的旧 sidecar 或改用 -MoneyAIPort。"
}
if (Test-TcpListener -Port $DemoPort) {
    throw "端口 $DemoPort 已被占用。脚本不会停止未知进程；请关闭自己的旧 Demo 或改用 -DemoPort。"
}

foreach ($value in @($serverDist, $resolvedProjectDir)) {
    if ($value.Contains('"')) { throw "路径不能包含双引号：$value" }
}
$sidecarArguments = '"{0}" --port {1} --agent-dir "{2}" --no-pre-warm' -f $serverDist, $MoneyAIPort, $resolvedProjectDir
$sidecar = Start-Process -FilePath $nodeExe -ArgumentList $sidecarArguments -WorkingDirectory $resolvedMoneyAIHome -WindowStyle Hidden -PassThru

try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($sidecar.HasExited) { throw "MoneyAI sidecar 启动后立即退出（exit $($sidecar.ExitCode)）。" }
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$MoneyAIPort/health" -Method Get -TimeoutSec 1
            if ($health.status -eq "ok") { $ready = $true; break }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    if (-not $ready) { throw "MoneyAI sidecar 在 10 秒内未就绪。" }

    $providerVerified = $false
    if (-not [string]::IsNullOrWhiteSpace($ProviderId)) {
        $list = Invoke-MoneyAIAdmin -Route "model/list" -Payload @{}
        Assert-Success -Response $list -Action "读取 Provider 列表"
        $matches = @($list.data | Where-Object { $_.id -eq $ProviderId })
        if ($matches.Count -ne 1) {
            $known = (@($list.data | Where-Object { $_.enabled } | Select-Object -ExpandProperty id) -join ", ")
            throw "Provider '$ProviderId' 不存在或不唯一。当前可用 ID：$known"
        }
        $providerVerified = $matches[0].status -eq "valid"

        if ($ConfigureProviderKey) {
            $secureKey = Read-Host "输入 $ProviderId 的 API Key（仅写入本机 MoneyAI 配置，不进入仓库）" -AsSecureString
            $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
            try {
                $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
                if ([string]::IsNullOrWhiteSpace($plainKey)) { throw "API Key 不能为空。" }
                $setKey = Invoke-MoneyAIAdmin -Route "model/set-key" -Payload @{ id = $ProviderId; apiKey = $plainKey }
                Assert-Success -Response $setKey -Action "保存 API Key"
                $providerVerified = $false
            } finally {
                if ($keyPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
                $plainKey = $null
                $secureKey = $null
            }
        }

        $setDefault = Invoke-MoneyAIAdmin -Route "model/set-default" -Payload @{ id = $ProviderId }
        Assert-Success -Response $setDefault -Action "设置默认 Provider"

        if ($VerifyProvider) {
            Write-Host "正在由 MoneyAI 验证 Provider；这可能产生一次极小的模型调用。"
            $verification = Invoke-MoneyAIAdmin -Route "model/verify" -Payload @{ id = $ProviderId }
            Assert-Success -Response $verification -Action "验证 Provider"
            $providerVerified = $true
        }

        $reset = Invoke-RestMethod -Uri "http://127.0.0.1:$MoneyAIPort/chat/reset" -Method Post -ContentType "application/json" -Body "{}" -TimeoutSec 10
        if ($null -eq $reset) { throw "MoneyAI 会话刷新失败。" }
    }

    if (($EnableAnalysis -or $EnableExtraction) -and -not $providerVerified) {
        throw "启用分析或提取前，需指定已验证的 -ProviderId，或本次加 -VerifyProvider。"
    }

    $env:LUYA_DEMO_PORT = [string]$DemoPort
    $env:LUYA_MONEYAI_URL = "http://127.0.0.1:$MoneyAIPort"
    $env:LUYA_MONEYAI_PROJECT_DIR = $resolvedProjectDir
    $env:LUYA_MONEYAI_ANALYSIS_ENABLED = $EnableAnalysis.ToString().ToLowerInvariant()
    $env:LUYA_MONEYAI_EXTRACTION_ENABLED = $EnableExtraction.ToString().ToLowerInvariant()
    $env:LUYA_MONEYAI_HISTORY_ENABLED = $EnableHistory.ToString().ToLowerInvariant()
    $env:LUYA_MONEYAI_HISTORY_READ_VERIFIED = $HistoryReadVerified.ToString().ToLowerInvariant()

    Write-Host "MoneyAI sidecar: http://127.0.0.1:$MoneyAIPort"
    Write-Host "路芽 Demo: http://127.0.0.1:$DemoPort/01-intake.html"
    Write-Host "按 Ctrl+C 停止；脚本只会结束本次由它启动的 sidecar。"
    Push-Location $repoRoot
    try {
        & $PythonExe -B -X utf8 server/app.py
        if ($LASTEXITCODE -ne 0) { throw "Demo 后端退出码：$LASTEXITCODE" }
    } finally {
        Pop-Location
    }
} finally {
    if ($null -ne $sidecar -and -not $sidecar.HasExited) {
        Stop-Process -Id $sidecar.Id -ErrorAction SilentlyContinue
        $sidecar.WaitForExit(3000) | Out-Null
    }
}
