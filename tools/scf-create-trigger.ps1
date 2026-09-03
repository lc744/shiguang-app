# 通过腾讯云 SCF API 为 pushDue 创建每分钟定时触发器（TC3-HMAC-SHA256 签名）
$ErrorActionPreference = 'Stop'
$secret = Get-Content "$PWD\miniprogram\cloudfunctions\tts\secret.json" -Raw | ConvertFrom-Json
$secretId = $secret.secretId; $secretKey = $secret.secretKey

$hostName = 'scf.tencentcloudapi.com'
$service = 'scf'; $version = '2018-04-16'; $region = 'ap-guangzhou'
$ns = 'cloud1-d1guu0uxy037691f1'

function Get-HmacBytes([byte[]]$key, [string]$message){
  $h = New-Object System.Security.Cryptography.HMACSHA256
  $h.Key = $key
  , $h.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
}
function Get-Sha256Hex([string]$text){
  [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($text))).Replace('-', '').ToLower()
}

function Invoke-Tcf([string]$action, [string]$payload){
  $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $date = [DateTimeOffset]::FromUnixTimeSeconds($ts).UtcDateTime.ToString('yyyy-MM-dd')
  $hashedPayload = Get-Sha256Hex $payload
  $canonical = "POST`n/`n`ncontent-type:application/json; charset=utf-8`nhost:$hostName`nx-tc-action:$($action.ToLower())`n`ncontent-type;host;x-tc-action`n$hashedPayload"
  $hashedCanonical = Get-Sha256Hex $canonical
  $sts = "TC3-HMAC-SHA256`n$ts`n$date/$service/tc3_request`n$hashedCanonical"
  $sd = Get-HmacBytes ([Text.Encoding]::UTF8.GetBytes('TC3' + $secretKey)) $date
  $ss = Get-HmacBytes $sd $service
  $sk = Get-HmacBytes $ss 'tc3_request'
  $sig = [System.BitConverter]::ToString((Get-HmacBytes $sk $sts)).Replace('-', '').ToLower()
  $headers = @{
    'X-TC-Action'    = $action
    'X-TC-Version'   = $version
    'X-TC-Region'    = $region
    'X-TC-Timestamp' = $ts
    'X-TC-Language'  = 'zh-CN'
    'Authorization'  = "TC3-HMAC-SHA256 Credential=$secretId/$date/$service/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=$sig"
  }
  Invoke-RestMethod -Uri "https://$hostName" -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $payload
}

Write-Host '=== 列出函数，探明真实命名空间 ==='
$lf = Invoke-Tcf 'ListFunctions' '{"Limit":50,"Order":"desc"}'
$fns = @($lf.Response.Functions)
Write-Host ('共 ' + $fns.Count + ' 个函数：')
$fns | ForEach-Object { Write-Host ('  ' + $_.FunctionName + '  @ ' + $_.Namespace) }
$push = $fns | Where-Object { $_.FunctionName -eq 'pushDue' }
if(-not $push){ Write-Host '✗ 未找到 pushDue'; exit 1 }
$realNs = $push.Namespace
Write-Host ('pushDue 命名空间: ' + $realNs)

Write-Host "`n=== 创建定时触发器 pushDueTimer（每分钟） ==="
$r = Invoke-Tcf 'CreateTrigger' ('{"Enable":"OPEN","FunctionName":"pushDue","Namespace":"' + $realNs + '","TriggerDesc":"0 * * * * * *","TriggerName":"pushDueTimer","Type":"timer"}')
$r | ConvertTo-Json -Depth 5 | Write-Host

Write-Host "`n=== 验证：读取 pushDue 的触发器列表 ==="
$v = Invoke-Tcf 'GetFunction' ('{"FunctionName":"pushDue","Namespace":"' + $realNs + '"}')
$v.Response.Triggers | ConvertTo-Json -Depth 5 | Write-Host
