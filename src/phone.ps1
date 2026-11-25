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
    $script:lastPublish = $scanStarted
    $script:batch = New-Object System.Collections.Generic.List[object]
    $script:foundCount = 0
    $photoExts = [System.Collections.Generic.HashSet[string]]::new([string[]]@('.jpg','.jpeg','.png','.heic','.heif','.tif','.tiff','.gif','.bmp','.webp','.dng','.raw'), [StringComparer]::OrdinalIgnoreCase)
    $videoExts = [System.Collections.Generic.HashSet[string]]::new([string[]]@('.mov','.mp4','.m4v','.3gp','.avi','.mkv'), [StringComparer]::OrdinalIgnoreCase)
    function PublishScanProgress {
      if ($script:batch.Count -eq 0) { return }
      $now = [DateTime]::UtcNow
      [Console]::Out.WriteLine((@{
        progress=$true;found=$script:foundCount
        elapsedMs=[long]($now-$scanStarted).TotalMilliseconds
        items=@($script:batch.ToArray())
      } | ConvertTo-Json -Depth 5 -Compress))
      $script:batch.Clear()
      $script:lastPublish = $now
    }
    function Walk($folder, [string[]]$segments, [int]$depth) {
      if ($depth -gt 12) { throw 'Phone folder nesting exceeds the supported depth.' }
      # Enumerate lazily over a single STA WPD session (USB MTP is half-duplex and
      # deadlocks/thrashes under concurrent COM sessions).
      foreach ($item in $folder.Items()) {
        $rawName = [string]$item.Name
        if ($item.IsFolder) {
          $parts = @($segments) + @($rawName)
          try { Walk $item.GetFolder $parts ($depth + 1) }
          catch { $errors.Add(($parts -join '/') + ': ' + $_.Exception.Message) }
          continue
        }
        try {
          # Fast path: use Name directly if it already carries a known media extension,
          # avoiding an expensive COM/MTP ExtendedProperty('System.FileName') round-trip.
          $filename = $rawName
          $ext = [IO.Path]::GetExtension($filename)
          $type = $null
          if ($ext) {
            if ($photoExts.Contains($ext)) { $type = 'Photos' }
            elseif ($videoExts.Contains($ext)) { $type = 'Videos' }
          }
          if (!$type) {
            $extName = [string]$item.ExtendedProperty('System.FileName')
            if ($extName) {
              $filename = $extName
            } elseif (!$ext) {
              $typeName = [string]$item.Type
              $extensionMatch = [regex]::Match($typeName, '(?i)\b(JPEG|JPG|HEIC|HEIF|PNG|TIFF|TIF|GIF|BMP|WEBP|DNG|RAW|MOV|MP4|M4V|3GP|AVI|MKV)\b')
              if ($extensionMatch.Success) {
                $extension = $extensionMatch.Groups[1].Value.ToLowerInvariant()
                if ($extension -eq 'jpeg') { $extension = 'jpg' }
                $filename += '.' + $extension
              }
            }
            $ext = [IO.Path]::GetExtension($filename)
            if ($ext) {
              if ($photoExts.Contains($ext)) { $type = 'Photos' }
              elseif ($videoExts.Contains($ext)) { $type = 'Videos' }
            }
          }
          if (!$type) { continue }
          # Use FolderItem.ModifyDate directly — zero ExtendedProperty MTP round-trips.
          $date = $item.ModifyDate
          $day = 'Unknown-date'
          if ($date -is [datetime] -and $date.Year -ge 1970) { $day = $date.ToString('yyyy-MM-dd') }
          $file = [pscustomobject]@{
            name=$filename
            segments=@($segments) + @([pscustomobject]@{name=$rawName;filename=$filename})
            type=$type; date=$day
            dateSource='device file date'; size=0
          }
          $script:batch.Add($file)
          $script:foundCount++
          $batchThreshold = if ($script:foundCount -le 40) { 20 } else { 150 }
          if ($script:batch.Count -ge $batchThreshold -or ([DateTime]::UtcNow - $script:lastPublish).TotalMilliseconds -ge 250) {
            PublishScanProgress
          }
        } catch {
          $errors.Add(((@($segments) + @($rawName)) -join '/') + ': ' + $_.Exception.Message)
        }
      }
    }
    Walk $phone.GetFolder @() 0
    PublishScanProgress
    [pscustomobject]@{count=$script:foundCount;errors=@($errors.ToArray());device=$phone.Name} | ConvertTo-Json -Depth 5 -Compress
  } elseif ($request.action -eq 'copy') {
    CopyPhoneFile $request | ConvertTo-Json -Compress
  } else { throw 'Unknown phone operation.' }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
