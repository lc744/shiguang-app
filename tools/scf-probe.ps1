# ASCII-only probe: list SCF functions, dump raw JSON
$ErrorActionPreference = 'Stop'
$secret = Get-Content "$PWD\miniprogram\cloudfunctions\tts\secret.json" -Raw | ConvertFrom-Json
$secretId = $secret.secretId; $secretKey = $secret.secretKey
$hostName = 'scf.tencentcloudapi.com'; $service = 'scf'; $version = '2018-04-16'; $region = 'ap-guangzhou'

function Get-HmacBytes([byte[]]$key, [string]$message){
  $h = New-Object System.Security.Cryptography.HMACSHA256; $h.Key = $key
  , $h.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
}
function Get-Sha256Hex([string]$text){
  [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($text))).Replace('-', '').ToLower()
}
function Invoke-Tcf([string]$action, [string]$payload){
  $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $date = [DateTimeOffset]::FromUnixTimeSeconds($ts).UtcDateTime.ToString('yyyy-MM-dd')
  $hp = Get-Sha256Hex $payload
  $canonical = "POST`n/`n`ncontent-type:application/json; charset=utf-8`nhost:$hostName`nx-tc-action:$($action.ToLower())`n`ncontent-type;host;x-tc-action`n$hp"
  $hc = Get-Sha256Hex $canonical
  $sts = "TC3-HMAC-SHA256`n$ts`n$date/$service/tc3_request`n$hc"
  $sd = Get-HmacBytes ([Text.Encoding]::UTF8.GetBytes('TC3' + $secretKey)) $date
  $ss = Get-HmacBytes $sd $service
  $sk = Get-HmacBytes $ss 'tc3_request'
  $sig = [System.BitConverter]::ToString((Get-HmacBytes $sk $sts)).Replace('-', '').ToLower()
  $headers = @{
    'X-TC-Action' = $action; 'X-TC-Version' = $version; 'X-TC-Region' = $region
    'X-TC-Timestamp' = $ts
    'Authorization' = "TC3-HMAC-SHA256 Credential=$secretId/$date/$service/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=$sig"
  }
  Invoke-RestMethod -Uri "https://$hostName" -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $payload
}

Write-Host '--- ListFunctions raw ---'
$lf = Invoke-Tcf 'ListFunctions' '{"Limit":20}'
$lf | ConvertTo-Json -Depth 8

