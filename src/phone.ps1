param([switch]$Session)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  if (-not $Session) { $request = [Console]::In.ReadToEnd() | ConvertFrom-Json }
  $shell = New-Object -ComObject Shell.Application
  $phones = @($shell.Namespace(17).Items() | Where-Object { $_.Path -match 'vid_05ac' -or $_.Name -eq 'Apple iPhone' })
  if ($phones.Count -eq 0) { throw 'No iPhone storage found. Unlock the phone, tap Trust, and reconnect the cable.' }
  if ($phones.Count -gt 1) { throw 'Connect only one iPhone, then try again.' }
  $phone = $phones[0]
  $script:folderIndexCache = @{}
  function CopyPhoneFile($copyRequest) {
    $current = $phone
    $traversed = New-Object System.Collections.Generic.List[string]
    foreach ($segment in $copyRequest.segments) {
      $folderKey = [string]::Join([char]31, $traversed.ToArray())
      if (-not $script:folderIndexCache.ContainsKey($folderKey)) {
        $index = [System.Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
        foreach ($item in $current.GetFolder.Items()) {
          $name = [string]$item.Name
          if (-not $index.ContainsKey($name)) {
            $index.Add($name, (New-Object System.Collections.Generic.List[object]))
          }
          $index[$name].Add($item)
        }
        $script:folderIndexCache[$folderKey] = $index
      }
      $lookupName = if ($segment -is [string]) { $segment } else { [string]$segment.name }
      $index = $script:folderIndexCache[$folderKey]
      $candidates = @()
      if ($index.ContainsKey($lookupName)) { $candidates = @($index[$lookupName]) }
      if ($segment -isnot [string]) {
        $candidates = @($candidates | Where-Object {
          [string]$_.ExtendedProperty('System.FileName') -ceq $segment.filename
        })
      }
      if ($candidates.Count -ne 1) { throw 'The selected file is missing or ambiguous. Read the iPhone again.' }
      $current = $candidates[0]
      $traversed.Add($lookupName)
    }
    if ($current.IsFolder) { throw 'Expected a media file.' }
    $size = $current.ExtendedProperty('System.Size')
    if ($null -eq $size) { $size = $current.Size }
    if (([long]$copyRequest.size -gt 0 -and [long]$size -ne [long]$copyRequest.size) -or [long]$size -le 0) { throw 'The file size changed or is unavailable. Read the iPhone again.' }
    $filename = $current.ExtendedProperty('System.FileName')
    if (!$filename) { $filename = $current.Name }
    $target = Join-Path $copyRequest.destination $filename
    if (Test-Path -LiteralPath $target) { throw 'Staging file already exists.' }
    $folder = $shell.Namespace([string]$copyRequest.destination)
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
      Start-Sleep -Milliseconds 100
    }
    if (!$complete) { throw 'Transfer timed out. The staging folder is preserved; reconnect and scan again.' }
    return [pscustomobject]@{path=$target;size=[long]$size}
  }
  if ($Session) {
    [Console]::Out.WriteLine('{"ready":true}')
    while ($null -ne ($line = [Console]::In.ReadLine())) {
      try {
        $copyRequest = $line | ConvertFrom-Json
        if ($copyRequest.action -ne 'copy') { throw 'Unknown phone operation.' }
        $copyResult = CopyPhoneFile $copyRequest
        [Console]::Out.WriteLine((@{result=$true;path=$copyResult.path;size=$copyResult.size} | ConvertTo-Json -Compress))
      } catch {
        [Console]::Out.WriteLine((@{error=$true;message=$_.Exception.Message} | ConvertTo-Json -Compress))
      }
    }
  } elseif ($request.action -eq 'scan') {
    $errors = New-Object System.Collections.Generic.List[string]
    $scanStarted = [DateTime]::UtcNow
    $script:batch = New-Object System.Collections.Generic.List[object]
    $script:foundCount = 0
    function PublishScanProgress {
      if ($script:batch.Count -eq 0) { return }
      [Console]::Out.WriteLine((@{
        progress=$true;found=$script:foundCount
        elapsedMs=[long]([DateTime]::UtcNow-$scanStarted).TotalMilliseconds
        items=@($script:batch.ToArray())
      } | ConvertTo-Json -Depth 20 -Compress))
      $script:batch.Clear()
    }
    function Walk($folder, [string[]]$segments, [int]$depth) {
      if ($depth -gt 12) { throw 'Phone folder nesting exceeds the supported depth.' }
      # Enumerate lazily. Wrapping Items() in @() waits for the entire WPD folder
      # before the first file can be processed or reported.
      foreach ($item in $folder.Items()) {
        $parts = @($segments) + @($item.Name)
        if ($item.IsFolder) {
          try { Walk $item.GetFolder $parts ($depth + 1) }
          catch { $errors.Add(($parts -join '/') + ': ' + $_.Exception.Message) }
          continue
        }
        try {
        # Name often omits the real extension (for example IMG_1234.JPG).
        # FileName preserves it, avoiding guesses such as .jpeg for a .JPG.
        $filename = [string]$item.ExtendedProperty('System.FileName')
        if (!$filename) {
          $filename = [string]$item.Name
          if ([IO.Path]::GetExtension($filename) -eq '') {
            $typeName = [string]$item.Type
            $extensionMatch = [regex]::Match($typeName, '(?i)\b(JPEG|JPG|HEIC|HEIF|PNG|TIFF|TIF|GIF|BMP|WEBP|DNG|RAW|MOV|MP4|M4V|3GP|AVI|MKV)\b')
            if ($extensionMatch.Success) {
              $extension = $extensionMatch.Groups[1].Value.ToLowerInvariant()
              if ($extension -eq 'jpeg') { $extension = 'jpg' }
              $filename += '.' + $extension
            }
          }
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
        $file = [pscustomobject]@{
          name=$filename
          segments=@($segments) + @([pscustomobject]@{name=[string]$item.Name;filename=$filename})
          type=$type; date=$day
          dateSource=$dateSource; size=0
        }
        $script:batch.Add($file)
        $script:foundCount++
        if ($script:batch.Count -ge 100) { PublishScanProgress }
        } catch {
          $errors.Add(($parts -join '/') + ': ' + $_.Exception.Message)
        }
      }
    }
    Walk $phone.GetFolder @() 0
    PublishScanProgress
    [pscustomobject]@{count=$script:foundCount;errors=@($errors.ToArray());device=$phone.Name} | ConvertTo-Json -Depth 20 -Compress
  } elseif ($request.action -eq 'copy') {
    CopyPhoneFile $request | ConvertTo-Json -Compress
  } else { throw 'Unknown phone operation.' }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
