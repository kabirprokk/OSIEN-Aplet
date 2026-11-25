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
      if ($segment -isnot [string] -and $candidates.Count -gt 1) {
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
    Add-Type -TypeDefinition @'
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;

public static class FastPhoneScanner {
  static readonly HashSet<string> PhotoExts = new HashSet<string>(
    new[] { ".jpg",".jpeg",".png",".heic",".heif",".tif",".tiff",".gif",".bmp",".webp",".dng",".raw" },
    StringComparer.OrdinalIgnoreCase);
  static readonly HashSet<string> VideoExts = new HashSet<string>(
    new[] { ".mov",".mp4",".m4v",".3gp",".avi",".mkv" },
    StringComparer.OrdinalIgnoreCase);
  static readonly Regex TypeExtRegex = new Regex(
    @"\b(JPEG|JPG|HEIC|HEIF|PNG|TIFF|TIF|GIF|BMP|WEBP|DNG|RAW|MOV|MP4|M4V|3GP|AVI|MKV)\b",
    RegexOptions.IgnoreCase | RegexOptions.Compiled);
  static readonly Regex FolderDateRegex = new Regex(
    @"^((?:19|20)\d{2})(0[1-9]|1[0-2])",
    RegexOptions.Compiled);

  static object GetProp(object com, string name) {
    return com.GetType().InvokeMember(name, BindingFlags.GetProperty, null, com, null);
  }

  static void AppendJsonString(StringBuilder sb, string s) {
    sb.Append('"');
    if (s != null) {
      for (int i = 0; i < s.Length; i++) {
        char c = s[i];
        if (c == '"' || c == '\\') { sb.Append('\\').Append(c); }
        else if (c < 0x20) {
          if (c == '\n') sb.Append("\\n");
          else if (c == '\r') sb.Append("\\r");
          else if (c == '\t') sb.Append("\\t");
          else sb.Append("\\u").Append(((int)c).ToString("x4"));
        } else {
          sb.Append(c);
        }
      }
    }
    sb.Append('"');
  }

  public static void Scan(object phoneItem, string phoneName) {
    var errors = new List<string>();
    var sw = Stopwatch.StartNew();
    long lastFlushMs = 0;
    int found = 0;
    int batchCount = 0;
    var itemsJson = new StringBuilder(65536);

    Action flush = () => {
      if (batchCount == 0) return;
      var line = new StringBuilder(itemsJson.Length + 96);
      line.Append("{\"progress\":true,\"found\":").Append(found)
          .Append(",\"elapsedMs\":").Append(sw.ElapsedMilliseconds)
          .Append(",\"items\":[").Append(itemsJson).Append("]}");
      Console.Out.WriteLine(line.ToString());
      itemsJson.Length = 0;
      batchCount = 0;
      lastFlushMs = sw.ElapsedMilliseconds;
    };

    Action<object, string[], string, int, string, string> walk = null;
    walk = (folder, segments, segmentsJsonPrefix, depth, folderDay, folderDateSource) => {
      if (depth > 12) throw new InvalidOperationException("Phone folder nesting exceeds the supported depth.");
      var items = (IEnumerable)folder.GetType().InvokeMember("Items", BindingFlags.InvokeMethod, null, folder, null);
      foreach (object item in items) {
        string rawName = Convert.ToString(GetProp(item, "Name")) ?? "";
        bool isFolder = Convert.ToBoolean(GetProp(item, "IsFolder"));
        if (isFolder) {
          var nextSegs = new string[segments.Length + 1];
          Array.Copy(segments, nextSegs, segments.Length);
          nextSegs[segments.Length] = rawName;
          var segSb = new StringBuilder(segmentsJsonPrefix);
          if (segSb.Length > 0) segSb.Append(',');
          AppendJsonString(segSb, rawName);
          string nextDay = folderDay;
          string nextSource = folderDateSource;
          var fm = FolderDateRegex.Match(rawName);
          if (fm.Success) {
            nextDay = fm.Groups[1].Value + "-" + fm.Groups[2].Value + "-01";
            nextSource = "folder month";
          }
          try {
            object subFolder = GetProp(item, "GetFolder");
            walk(subFolder, nextSegs, segSb.ToString(), depth + 1, nextDay, nextSource);
          } catch (Exception ex) {
            errors.Add(string.Join("/", nextSegs) + ": " + ex.Message);
          }
          continue;
        }
        try {
          string filename = rawName;
          string ext = Path.GetExtension(filename);
          string mediaType = null;
          if (!string.IsNullOrEmpty(ext)) {
            if (PhotoExts.Contains(ext)) mediaType = "Photos";
            else if (VideoExts.Contains(ext)) mediaType = "Videos";
          }
          if (mediaType == null) {
            string typeName = Convert.ToString(GetProp(item, "Type")) ?? "";
            var m = TypeExtRegex.Match(typeName);
            if (m.Success) {
              string e = m.Groups[1].Value.ToLowerInvariant();
              if (e == "jpeg") e = "jpg";
              ext = "." + e;
              if (string.IsNullOrEmpty(Path.GetExtension(filename))) filename += ext;
              if (PhotoExts.Contains(ext)) mediaType = "Photos";
              else if (VideoExts.Contains(ext)) mediaType = "Videos";
            }
          }
          if (mediaType == null) continue;

          if (batchCount > 0) itemsJson.Append(',');
          itemsJson.Append("{\"name\":");
          AppendJsonString(itemsJson, filename);
          itemsJson.Append(",\"segments\":[");
          if (segmentsJsonPrefix.Length > 0) itemsJson.Append(segmentsJsonPrefix).Append(',');
          itemsJson.Append("{\"name\":");
          AppendJsonString(itemsJson, rawName);
          itemsJson.Append(",\"filename\":");
          AppendJsonString(itemsJson, filename);
          itemsJson.Append("}],\"type\":");
          AppendJsonString(itemsJson, mediaType);
          itemsJson.Append(",\"date\":");
          AppendJsonString(itemsJson, folderDay);
          itemsJson.Append(",\"dateSource\":");
          AppendJsonString(itemsJson, folderDateSource);
          itemsJson.Append(",\"size\":0}");

          batchCount++;
          found++;
          int threshold = found <= 40 ? 20 : 250;
          if (batchCount >= threshold || (sw.ElapsedMilliseconds - lastFlushMs) >= 200) {
            flush();
          }
        } catch (Exception ex) {
          errors.Add(string.Join("/", segments) + "/" + rawName + ": " + ex.Message);
        }
      }
    };

    object rootFolder = GetProp(phoneItem, "GetFolder");
    walk(rootFolder, new string[0], "", 0, "Unknown-date", "on import");
    flush();

    var finalSb = new StringBuilder(256);
    finalSb.Append("{\"count\":").Append(found).Append(",\"errors\":[");
    for (int i = 0; i < errors.Count; i++) {
      if (i > 0) finalSb.Append(',');
      AppendJsonString(finalSb, errors[i]);
    }
    finalSb.Append("],\"device\":");
    AppendJsonString(finalSb, phoneName);
    finalSb.Append('}');
    Console.Out.WriteLine(finalSb.ToString());
  }
}
'@
    [FastPhoneScanner]::Scan($phone, [string]$phone.Name)
  } elseif ($request.action -eq 'copy') {
    CopyPhoneFile $request | ConvertTo-Json -Compress
  } else { throw 'Unknown phone operation.' }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
