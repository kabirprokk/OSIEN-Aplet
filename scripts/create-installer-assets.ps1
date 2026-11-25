$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$output = Join-Path $root 'build'
$logoPath = Join-Path $root 'src\assets\osien-logo.png'
New-Item -ItemType Directory -Force -Path $output | Out-Null

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-RadialGlow($graphics, [float]$cx, [float]$cy, [float]$radius, [System.Drawing.Color]$centerColor) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($cx - $radius, $cy - $radius, $radius * 2, $radius * 2)
  $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
  $brush.CenterPoint = New-Object System.Drawing.PointF($cx, $cy)
  $brush.CenterColor = $centerColor
  $brush.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, $centerColor.R, $centerColor.G, $centerColor.B))
  $graphics.FillPath($brush, $path)
  $brush.Dispose()
  $path.Dispose()
}

function Draw-Sidebar([string]$path, [bool]$isUninstaller) {
  $width = 164
  $height = 314
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $bgTop = [System.Drawing.Color]::FromArgb(11, 20, 33)         # #0B1421
  $bgBottom = if ($isUninstaller) {
    [System.Drawing.Color]::FromArgb(24, 24, 38)                # calm slate-indigo
  } else {
    [System.Drawing.Color]::FromArgb(16, 36, 52)                # deep glass navy
  }
  $accent = [System.Drawing.Color]::FromArgb(155, 245, 239)     # #9BF5EF
  $accentStrong = [System.Drawing.Color]::FromArgb(103, 229, 222) # #67E5DE
  $text = [System.Drawing.Color]::FromArgb(241, 246, 250)       # #F1F6FA
  $muted = [System.Drawing.Color]::FromArgb(165, 179, 192)      # #A5B3C0
  $quiet = [System.Drawing.Color]::FromArgb(115, 131, 147)      # #738393

  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Rectangle(0, 0, $width, $height)),
    $bgTop, $bgBottom, [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
  )
  $graphics.FillRectangle($bgBrush, 0, 0, $width, $height)
  $bgBrush.Dispose()

  # Ambient radial glow behind logo
  $glowColor = if ($isUninstaller) {
    [System.Drawing.Color]::FromArgb(42, 165, 179, 220)
  } else {
    [System.Drawing.Color]::FromArgb(52, 103, 229, 222)
  }
  Draw-RadialGlow $graphics 82 84 74 $glowColor
  Draw-RadialGlow $graphics 18 286 68 ([System.Drawing.Color]::FromArgb(24, 155, 245, 239))

  # Subtle frosted glass card behind logo
  $cardPath = New-RoundedRectPath 42 44 80 80 18
  $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 19, 33, 47))
  $cardPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(55, 205, 237, 248), 1)
  $graphics.FillPath($cardBrush, $cardPath)
  $graphics.DrawPath($cardPen, $cardPath)
  $cardBrush.Dispose()
  $cardPen.Dispose()
  $cardPath.Dispose()

  $logo = [System.Drawing.Image]::FromFile($logoPath)
  $graphics.DrawImage($logo, 52, 54, 60, 60)
  $logo.Dispose()

  $center = New-Object System.Drawing.StringFormat
  $center.Alignment = [System.Drawing.StringAlignment]::Center

  $brandFont = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
  $subFont = New-Object System.Drawing.Font('Segoe UI', 9.5, [System.Drawing.FontStyle]::Bold)
  $pillFont = New-Object System.Drawing.Font('Segoe UI', 7.2, [System.Drawing.FontStyle]::Bold)
  $captionFont = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Regular)
  $footerFont = New-Object System.Drawing.Font('Segoe UI', 7, [System.Drawing.FontStyle]::Regular)

  $textBrush = New-Object System.Drawing.SolidBrush($text)
  $accentBrush = New-Object System.Drawing.SolidBrush($accent)
  $mutedBrush = New-Object System.Drawing.SolidBrush($muted)
  $quietBrush = New-Object System.Drawing.SolidBrush($quiet)

  $graphics.DrawString('OSIEN', $brandFont, $textBrush, (New-Object System.Drawing.RectangleF(8, 136, ($width - 16), 24)), $center)
  $graphics.DrawString('MEMORIES', $subFont, $accentBrush, (New-Object System.Drawing.RectangleF(8, 161, ($width - 16), 18)), $center)

  # Accent pill badge
  $pillText = if ($isUninstaller) { 'UNINSTALLER' } else { 'PRIVATE STUDIO' }
  $pillPath = New-RoundedRectPath 32 190 100 20 10
  $pillBg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(30, 155, 245, 239))
  $pillPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(65, 155, 245, 239), 1)
  $graphics.FillPath($pillBg, $pillPath)
  $graphics.DrawPath($pillPen, $pillPath)
  $graphics.DrawString($pillText, $pillFont, $accentBrush, (New-Object System.Drawing.RectangleF(32, 193, 100, 16)), $center)
  $pillBg.Dispose()
  $pillPen.Dispose()
  $pillPath.Dispose()

  # Tagline
  if ($isUninstaller) {
    $graphics.DrawString('Your imported media', $captionFont, $mutedBrush, (New-Object System.Drawing.RectangleF(12, 228, ($width - 24), 16)), $center)
    $graphics.DrawString('stays completely safe.', $captionFont, $mutedBrush, (New-Object System.Drawing.RectangleF(12, 244, ($width - 24), 16)), $center)
  } else {
    $graphics.DrawString('Your memories,', $captionFont, $mutedBrush, (New-Object System.Drawing.RectangleF(12, 228, ($width - 24), 16)), $center)
    $graphics.DrawString('beautifully kept.', $captionFont, $mutedBrush, (New-Object System.Drawing.RectangleF(12, 244, ($width - 24), 16)), $center)
  }

  # Subtle bottom divider + local-first badge
  $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(40, 205, 237, 248), 1)
  $graphics.DrawLine($linePen, 24, 276, ($width - 24), 276)
  $graphics.DrawString('LOCAL-FIRST · ZERO CLOUD', $footerFont, $quietBrush, (New-Object System.Drawing.RectangleF(8, 286, ($width - 16), 16)), $center)

  # Subtle right edge hairline
  $edgePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(45, 205, 237, 248), 1)
  $graphics.DrawLine($edgePen, ($width - 1), 0, ($width - 1), $height)

  $linePen.Dispose()
  $edgePen.Dispose()
  $textBrush.Dispose()
  $accentBrush.Dispose()
  $mutedBrush.Dispose()
  $quietBrush.Dispose()
  $brandFont.Dispose()
  $subFont.Dispose()
  $pillFont.Dispose()
  $captionFont.Dispose()
  $footerFont.Dispose()
  $center.Dispose()

  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $graphics.Dispose()
  $bitmap.Dispose()
}

function Draw-Header([string]$path) {
  $width = 150
  $height = 57
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $bg = [System.Drawing.Color]::FromArgb(11, 20, 33) # #0B1421
  $graphics.Clear($bg)

  # Soft aqua glow behind right-aligned logo mark
  Draw-RadialGlow $graphics 122 28 32 ([System.Drawing.Color]::FromArgb(45, 103, 229, 222))

  $logo = [System.Drawing.Image]::FromFile($logoPath)
  $graphics.DrawImage($logo, 106, 12, 32, 32)
  $logo.Dispose()

  # Clean right-aligned wordmark that fits comfortably inside 150x57
  $right = New-Object System.Drawing.StringFormat
  $right.Alignment = [System.Drawing.StringAlignment]::Far
  $brandFont = New-Object System.Drawing.Font('Segoe UI', 9.5, [System.Drawing.FontStyle]::Bold)
  $subFont = New-Object System.Drawing.Font('Segoe UI', 7.2, [System.Drawing.FontStyle]::Bold)
  $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(241, 246, 250))
  $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(155, 245, 239))

  $graphics.DrawString('OSIEN', $brandFont, $textBrush, (New-Object System.Drawing.RectangleF(8, 13, 92, 16)), $right)
  $graphics.DrawString('MEMORIES', $subFont, $accentBrush, (New-Object System.Drawing.RectangleF(8, 29, 92, 14)), $right)

  # Subtle bottom accent line
  $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(45, 205, 237, 248), 1)
  $graphics.DrawLine($linePen, 0, ($height - 1), $width, ($height - 1))

  $linePen.Dispose()
  $textBrush.Dispose()
  $accentBrush.Dispose()
  $brandFont.Dispose()
  $subFont.Dispose()
  $right.Dispose()

  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $graphics.Dispose()
  $bitmap.Dispose()
}

Draw-Header (Join-Path $output 'installerHeader.bmp')
Draw-Sidebar (Join-Path $output 'installerSidebar.bmp') $false
Draw-Sidebar (Join-Path $output 'uninstallerSidebar.bmp') $true
Write-Output "Created OSIEN Memories installer and uninstaller artwork in $output"
