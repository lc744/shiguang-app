Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$W = 1600; $H = 960
$out = Join-Path $PSScriptRoot 'model_lineup.png'

function Hex([string]$h) { return [System.Drawing.ColorTranslator]::FromHtml($h) }
function HexA([string]$h, [int]$a) { $c = Hex $h; return [System.Drawing.Color]::FromArgb($a, $c.R, $c.G, $c.B) }

function RoundedRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return ,$p
}

# pick a font family that handles Latin + CJK
$famName = $null
foreach ($f in @('Microsoft YaHei UI','Microsoft YaHei','Segoe UI','Arial')) {
  try { [void][System.Drawing.FontFamily]::new($f); $famName = $f; break } catch {}
}
if (-not $famName) { $famName = 'Arial' }

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# background: 3-stop diagonal gradient
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.RectangleF(0, 0, $W, $H)),
  (Hex '#0B1122'), (Hex '#0A0F20'), 45.0)
$blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
$blend.Colors  = [System.Drawing.Color[]]@((Hex '#0B1122'), (Hex '#111B36'), (Hex '#0A0F20'))
$blend.Positions = [single[]]@(0.0, 0.55, 1.0)
$bgBrush.InterpolationColors = $blend
$g.FillRectangle($bgBrush, 0, 0, $W, $H)
$bgBrush.Dispose()

# soft glows
foreach ($gl in @(
  @{ cx = 260;  cy = 160; rx = 440; ry = 260; c = '#3B6BFF'; a = 76 },
  @{ cx = 1370; cy = 850; rx = 480; ry = 290; c = '#8B5CF6'; a = 66 },
  @{ cx = 800;  cy = 520; rx = 520; ry = 330; c = '#2DD4BF'; a = 30 })) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(($gl.cx - $gl.rx), ($gl.cy - $gl.ry), (2 * $gl.rx), (2 * $gl.ry))
  $pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
  $pgb.CenterColor = (HexA $gl.c $gl.a)
  $pgb.SurroundColors = [System.Drawing.Color[]]@((HexA $gl.c 0))
  $g.FillPath($pgb, $path)
  $pgb.Dispose(); $path.Dispose()
}

# fonts
$fTitle = New-Object System.Drawing.Font($famName, 50, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fSub   = New-Object System.Drawing.Font($famName, 18, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fProv  = New-Object System.Drawing.Font($famName, 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fName  = New-Object System.Drawing.Font($famName, 24, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fNameSm = New-Object System.Drawing.Font($famName, 20, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fDesc  = New-Object System.Drawing.Font($famName, 15, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fChip  = New-Object System.Drawing.Font($famName, 12, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fFoot  = New-Object System.Drawing.Font($famName, 14, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

$whiteBrush = [System.Drawing.Brushes]::White

# title with gradient fill
$sfCenter = New-Object System.Drawing.StringFormat
$sfCenter.Alignment = [System.Drawing.StringAlignment]::Center
$sfCenter.LineAlignment = [System.Drawing.StringAlignment]::Center

$titleBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.RectangleF(400, 60, 800, 80)),
  (Hex '#FFFFFF'), (Hex '#9DB8FF'), 0.0)
$g.DrawString('AI 大模型阵容', $fTitle, $titleBrush, (New-Object System.Drawing.RectangleF(0, 62, $W, 70)), $sfCenter)
$titleBrush.Dispose()
$g.DrawString('9 个模型 · 5 家厂商', $fSub, (New-Object System.Drawing.SolidBrush((Hex '#93A6CE'))), (New-Object System.Drawing.RectangleF(0, 146, $W, 30)), $sfCenter)

# accent bar under header
$accBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.RectangleF(755, 184, 90, 4)),
  (Hex '#4D8DFF'), (Hex '#A78BFA'), 0.0)
$accPath = RoundedRect 755 184 90 4 2
$g.FillPath($accBrush, $accPath)
$accBrush.Dispose(); $accPath.Dispose()

$models = @(
  @{ x = 100;  y = 250; name = 'deepseek-v4-flash';           prov = 'DeepSeek';     desc = '极速响应 · 轻量旗舰'; chip = 'DS';  color = '#4D8DFF'; small = $false },
  @{ x = 580;  y = 250; name = 'deepseek-v4-flash-vision-exp'; prov = 'DeepSeek';     desc = '视觉多模态 · 实验预览'; chip = 'DS';  color = '#4D8DFF'; small = $true  },
  @{ x = 1060; y = 250; name = 'deepseek-v4-pro';             prov = 'DeepSeek';     desc = '旗舰级 Pro';        chip = 'DS';  color = '#4D8DFF'; small = $false },
  @{ x = 100;  y = 450; name = 'glm-5.2';                     prov = 'Z.ai · 智谱';  desc = '上一代稳定版';      chip = 'GLM'; color = '#2DD4BF'; small = $false },
  @{ x = 580;  y = 450; name = 'glm-5.3';                     prov = 'Z.ai · 智谱';  desc = '当前旗舰';          chip = 'GLM'; color = '#2DD4BF'; small = $false },
  @{ x = 1060; y = 450; name = 'glm-5.3-flash';               prov = 'Z.ai · 智谱';  desc = '高速推理版';        chip = 'GLM'; color = '#2DD4BF'; small = $false },
  @{ x = 100;  y = 650; name = 'kimi-k3';                     prov = 'Moonshot AI';  desc = 'K3 旗舰';           chip = 'KM';  color = '#F472B6'; small = $false },
  @{ x = 580;  y = 650; name = 'minimax-m3';                  prov = 'MiniMax';      desc = 'M3 旗舰';           chip = 'MM';  color = '#FBBF24'; small = $false },
  @{ x = 1060; y = 650; name = 'qwen3.8-max';                 prov = 'Qwen · 通义';  desc = 'Max 级旗舰';        chip = 'QW';  color = '#A78BFA'; small = $false }
)

$cardFill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(13, 255, 255, 255))
$cardPen  = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(26, 255, 255, 255), 1)

foreach ($m in $models) {
  $x = [single]$m.x; $y = [single]$m.y
  $c = Hex $m.color

  # card body
  $cardPath = RoundedRect $x $y 440 170 18
  $g.FillPath($cardFill, $cardPath)
  $g.DrawPath($cardPen, $cardPath)
  $cardPath.Dispose()

  # provider dot + label
  $provBrush = New-Object System.Drawing.SolidBrush($c)
  $g.FillEllipse($provBrush, ($x + 37), ($y + 49), 14, 14)
  $g.DrawString($m.prov, $fProv, $provBrush, ([single]($x + 60)), ([single]($y + 47)))

  # chip top-right
  $chipRect = New-Object System.Drawing.RectangleF(($x + 372), ($y + 28), 44, 26)
  $chipPath = RoundedRect $chipRect.X $chipRect.Y $chipRect.Width $chipRect.Height 8
  $chipFill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(36, $c.R, $c.G, $c.B))
  $g.FillPath($chipFill, $chipPath)
  $g.DrawString($m.chip, $fChip, $provBrush, $chipRect, $sfCenter)
  $chipFill.Dispose(); $chipPath.Dispose()

  # model name + description
  $nameFont = if ($m.small) { $fNameSm } else { $fName }
  $g.DrawString($m.name, $nameFont, $whiteBrush, ([single]($x + 44)), ([single]($y + 86)))
  $g.DrawString($m.desc, $fDesc, (New-Object System.Drawing.SolidBrush((Hex '#9DB0D6'))), ([single]($x + 44)), ([single]($y + 128)))
  $provBrush.Dispose()
}

$cardFill.Dispose(); $cardPen.Dispose()

# footer
$g.DrawString('DEEPSEEK · GLM · KIMI · MINIMAX · QWEN', $fFoot, (New-Object System.Drawing.SolidBrush((Hex '#5E739E'))), (New-Object System.Drawing.RectangleF(0, 870, $W, 26)), $sfCenter)

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
"SAVED: $out ($((Get-Item $out).Length) bytes), font=$famName"
