$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$output = Join-Path $root 'build'
$logoPath = Join-Path $root 'src\assets\osien-logo.png'
New-Item -ItemType Directory -Force -Path $output | Out-Null

function Draw-BrandCanvas([int]$width, [int]$height, [string]$path, [bool]$sidebar) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $background = [System.Drawing.Color]::FromArgb(16, 18, 20)
  $cyan = [System.Drawing.Color]::FromArgb(0, 217, 232)
  $white = [System.Drawing.Color]::FromArgb(245, 247, 250)
  $muted = [System.Drawing.Color]::FromArgb(161, 170, 178)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Rectangle(0, 0, $width, $height)),
    $background,
    [System.Drawing.Color]::FromArgb(19, 41, 44),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
  )
  $graphics.FillRectangle($brush, 0, 0, $width, $height)
  $brush.Dispose()

  $logo = [System.Drawing.Image]::FromFile($logoPath)
  if ($sidebar) {
    $size = 78
    $x = [int](($width - $size) / 2)
    $graphics.DrawImage($logo, $x, 35, $size, $size)
    $brandFont = New-Object System.Drawing.Font('Segoe UI', 17, [System.Drawing.FontStyle]::Bold)
    $titleFont = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Regular)
    $captionFont = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Regular)
    $center = New-Object System.Drawing.StringFormat
    $center.Alignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString('OSIEN', $brandFont, (New-Object System.Drawing.SolidBrush($white)), (New-Object System.Drawing.RectangleF(4, 129, ($width - 8), 28)), $center)
    $graphics.DrawString('MEMORIES', $titleFont, (New-Object System.Drawing.SolidBrush($cyan)), (New-Object System.Drawing.RectangleF(4, 158, ($width - 8), 23)), $center)
    $pen = New-Object System.Drawing.Pen($cyan, 2)
    $graphics.DrawLine($pen, 52, 196, 112, 196)
    $graphics.DrawString('Your moments,', $captionFont, (New-Object System.Drawing.SolidBrush($muted)), (New-Object System.Drawing.RectangleF(8, 214, ($width - 16), 18)), $center)
    $graphics.DrawString('kept in focus.', $captionFont, (New-Object System.Drawing.SolidBrush($muted)), (New-Object System.Drawing.RectangleF(8, 230, ($width - 16), 18)), $center)
    $pen.Dispose()
    $center.Dispose()
    $brandFont.Dispose()
    $titleFont.Dispose()
    $captionFont.Dispose()
  } else {
    $logoSize = 36
    $graphics.DrawImage($logo, 9, 10, $logoSize, $logoSize)
    $brandFont = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
    $titleFont = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Regular)
    $graphics.DrawString('OSIEN Memories', $brandFont, (New-Object System.Drawing.SolidBrush($white)), 52, 9)
    $graphics.DrawString('PRIVATE MEDIA STUDIO', $titleFont, (New-Object System.Drawing.SolidBrush($muted)), 53, 31)
    $brandFont.Dispose()
    $titleFont.Dispose()
  }
  $logo.Dispose()
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $graphics.Dispose()
  $bitmap.Dispose()
}

Draw-BrandCanvas 150 57 (Join-Path $output 'installerHeader.bmp') $false
Draw-BrandCanvas 164 314 (Join-Path $output 'installerSidebar.bmp') $true
Draw-BrandCanvas 164 314 (Join-Path $output 'uninstallerSidebar.bmp') $true
Write-Output "Created OSIEN Memories installer and uninstaller artwork in $output"
