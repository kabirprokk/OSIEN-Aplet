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
    function Walk($folder, [string[]]$segments, [int]$depth) {
      if ($depth -gt 12) { throw 'Phone folder nesting exceeds the supported depth.' }
      foreach ($item in @($folder.Items())) {
        $parts = @($segments) + @($item.Name)
        if ($item.IsFolder) {
          try { Walk $item.GetFolder $parts ($depth + 1) }
          catch { $errors.Add(($parts -join '/') + ': ' + $_.Exception.Message) }
          continue
        }
        $filename = $item.ExtendedProperty('System.FileName')
        if (!$filename) { $filename = $item.Name }
        $ext = [IO.Path]::GetExtension($filename).ToLowerInvariant()
        $type = $null
        if ($ext -in @('.jpg','.jpeg','.png','.heic','.heif','.tif','.tiff','.gif','.bmp','.webp','.dng','.raw')) { $type = 'Photos' }
        if ($ext -in @('.mov','.mp4','.m4v','.3gp','.avi','.mkv')) { $type = 'Videos' }
        if (!$type) { continue }
        $date = $item.ExtendedProperty('System.Photo.DateTaken')
        $dateSource = 'capture date'
        if (!$date) { $date = $item.ExtendedProperty('System.Media.DateEncoded'); $dateSource = 'encoded date' }
        if (!$date) { $date = $item.ExtendedProperty('System.DateModified'); $dateSource = 'device file date' }
        $day = 'Unknown-date'
        if ($date -is [datetime] -and $date.Year -ge 1970) { $day = $date.ToString('yyyy-MM-dd') }
        $size = $item.ExtendedProperty('System.Size')
        if ($null -eq $size) { $size = $item.Size }
        $files.Add([pscustomobject]@{
          name=$filename; segments=$parts; type=$type; date=$day
          dateSource=$dateSource; size=[long]$size
        })
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
    if ([long]$size -ne [long]$request.size -or [long]$size -le 0) { throw 'The file size changed or is unavailable. Read the iPhone again.' }
    $filename = $current.ExtendedProperty('System.FileName')
    if (!$filename) { $filename = $current.Name }
    $target = Join-Path $request.destination $filename
    if (Test-Path -LiteralPath $target) { throw 'Staging file already exists.' }
    $folder = $shell.Namespace([string]$request.destination)
    if (!$folder) { throw 'Staging folder is unavailable.' }
    $folder.CopyHere($current, 1556)
    $deadline = [DateTime]::UtcNow.AddMinutes(20)
    $complete = $false
    while ([DateTime]::UtcNow -lt $deadline) {
      if (Test-Path -LiteralPath $target) {
        try {
          $stream = [IO.File]::Open($target, 'Open', 'Read', 'None')
          try { $complete = $stream.Length -eq [long]$size } finally { $stream.Dispose() }
          if ($complete) { break }
        } catch { }
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
