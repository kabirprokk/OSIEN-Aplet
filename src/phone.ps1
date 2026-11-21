$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $shell = New-Object -ComObject Shell.Application
  $phones = @($shell.Namespace(17).Items() | Where-Object { $_.Path -match 'vid_05ac' -or $_.Name -eq 'Apple iPhone' })
  if ($phones.Count -eq 0) { throw 'No iPhone storage found. Unlock the phone, tap Trust, and reconnect the cable.' }
  if ($phones.Count -gt 1) { throw 'Connect only one iPhone, then try again.' }
  $phone = $phones[0]
  if ($request.action -eq 'scan') {
    $files = New-Object System.Collections.Generic.List[object]
    $errors = New-Object System.Collections.Generic.List[string]
    $scanStarted = [DateTime]::UtcNow
    function Walk($folder, [string[]]$segments, [int]$depth) {
      if ($depth -gt 12) { throw 'Phone folder nesting exceeds the supported depth.' }
      [Console]::Out.WriteLine((@{progress=$true;found=$files.Count;elapsedMs=[long]([DateTime]::UtcNow-$scanStarted).TotalMilliseconds} | ConvertTo-Json -Compress))
      foreach ($item in @($folder.Items())) {
        $parts = @($segments) + @($item.Name)
        if ($item.IsFolder) {
          try { Walk $item.GetFolder $parts ($depth + 1) }
          catch { $errors.Add(($parts -join '/') + ': ' + $_.Exception.Message) }
          continue
        }
        # WPD often hides extensions in Name. Derive them from Shell's type
        # rather than asking the provider for another per-file property.
        $typeName = [string]$item.Type
        $extensionMatch = [regex]::Match($typeName, '(?i)\b(JPEG|JPG|HEIC|HEIF|PNG|TIFF|TIF|GIF|BMP|WEBP|DNG|RAW|MOV|MP4|M4V|3GP|AVI|MKV)\b')
        $filename = $item.Name
        if ($extensionMatch.Success) {
          $extension = '.' + $extensionMatch.Groups[1].Value.ToLowerInvariant()
          if ([IO.Path]::GetExtension($filename) -eq '') { $filename += $extension }
        } else {
          $filename = $item.ExtendedProperty('System.FileName')
          if (!$filename) { $filename = $item.Name }
        }
        $ext = [IO.Path]::GetExtension($filename).ToLowerInvariant()
        $type = $null
        if ($ext -in @('.jpg','.jpeg','.png','.heic','.heif','.tif','.tiff','.gif','.bmp','.webp','.dng','.raw')) { $type = 'Photos' }
        if ($ext -in @('.mov','.mp4','.m4v','.3gp','.avi','.mkv')) { $type = 'Videos' }
        if (!$type) { continue }
        if ($type -eq 'Photos') {
          $date = $item.ExtendedProperty('System.Photo.DateTaken')
          $dateSource = 'capture date'
        } else {
          $date = $item.ExtendedProperty('System.Media.DateEncoded')
          $dateSource = 'encoded date'
        }
        if (!$date) { $date = $item.ExtendedProperty('System.DateModified'); $dateSource = 'device file date' }
        $day = 'Unknown-date'
        if ($date -is [datetime] -and $date.Year -ge 1970) { $day = $date.ToString('yyyy-MM-dd') }
        $files.Add([pscustomobject]@{
          name=$filename; segments=$parts; type=$type; date=$day
          dateSource=$dateSource; size=0
        })
        if ($files.Count % 100 -eq 0) {
          [Console]::Out.WriteLine((@{progress=$true;found=$files.Count;elapsedMs=[long]([DateTime]::UtcNow-$scanStarted).TotalMilliseconds} | ConvertTo-Json -Compress))
        }
      }
    }
    Walk $phone.GetFolder @() 0
    [pscustomobject]@{files=@($files.ToArray());errors=@($errors.ToArray());device=$phone.Name} | ConvertTo-Json -Depth 20 -Compress
  } elseif ($request.action -eq 'copy') {
    $current = $phone
    foreach ($segment in $request.segments) {
      $matches = @($current.GetFolder.Items() | Where-Object { $_.Name -ceq $segment })
      if ($matches.Count -ne 1) { throw 'The selected file is missing or ambiguous. Read the iPhone again.' }
      $current = $matches[0]
    }
    if ($current.IsFolder) { throw 'Expected a media file.' }
    $size = $current.ExtendedProperty('System.Size')
    if ($null -eq $size) { $size = $current.Size }
    if (([long]$request.size -gt 0 -and [long]$size -ne [long]$request.size) -or [long]$size -le 0) { throw 'The file size changed or is unavailable. Read the iPhone again.' }
    $filename = $current.ExtendedProperty('System.FileName')
    if (!$filename) { $filename = $current.Name }
    $target = Join-Path $request.destination $filename
    if (Test-Path -LiteralPath $target) { throw 'Staging file already exists.' }
    $folder = $shell.Namespace([string]$request.destination)
    if (!$folder) { throw 'Staging folder is unavailable.' }
    $folder.CopyHere($current, 1556)
    $deadline = [DateTime]::UtcNow.AddMinutes(20)
    $complete = $false
    $lastReported = -1
    while ([DateTime]::UtcNow -lt $deadline) {
      if (Test-Path -LiteralPath $target) {
        try {
          $written = (Get-Item -LiteralPath $target).Length
          if ($written -ne $lastReported) {
            [Console]::Out.WriteLine((@{progress=$true;bytes=[long]$written;totalBytes=[long]$size} | ConvertTo-Json -Compress))
            $lastReported = $written
          }
        } catch { $written = -1 }
        if ($written -lt 0) { $written = $lastReported }
        try {
          $stream = [IO.File]::Open($target, 'Open', 'Read', 'None')
          try { $complete = $stream.Length -eq [long]$size } finally { $stream.Dispose() }
          if ($complete) { break }
        } catch { $complete = $false }
      }
      Start-Sleep -Milliseconds 250
    }
    if (!$complete) { throw 'Transfer timed out. The staging folder is preserved; reconnect and scan again.' }
    [pscustomobject]@{path=$target;size=[long]$size} | ConvertTo-Json -Compress
  } else { throw 'Unknown phone operation.' }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
