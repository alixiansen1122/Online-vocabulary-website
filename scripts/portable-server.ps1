param(
  [string]$Root = (Join-Path $PSScriptRoot "..\dist"),
  [int]$Port = 4173,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$rootPath = [IO.Path]::GetFullPath($Root)
if (-not (Test-Path -LiteralPath $rootPath -PathType Container)) {
  throw "Web directory not found: $rootPath"
}

$mimeTypes = @{
  ".css" = "text/css; charset=utf-8"
  ".html" = "text/html; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".mjs" = "text/javascript; charset=utf-8"
  ".mp3" = "audio/mpeg"
  ".png" = "image/png"
  ".svg" = "image/svg+xml"
  ".webp" = "image/webp"
  ".woff" = "font/woff"
  ".woff2" = "font/woff2"
}

function Write-SimpleResponse {
  param(
    [Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [string]$Message
  )

  $body = [Text.Encoding]::UTF8.GetBytes($Message)
  $headers = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($body, 0, $body.Length)
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
$url = "http://127.0.0.1:$Port/"
Write-Host "Vocabulary web is running at $url"
Write-Host "Keep this window open. Press Ctrl+C to stop."
if (-not $NoBrowser) {
  Start-Process $url
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        continue
      }

      $requestParts = $requestLine.Split(" ")
      if ($requestParts.Length -lt 2) {
        Write-SimpleResponse $stream 400 "Bad Request" "Bad request"
        continue
      }

      $method = $requestParts[0].ToUpperInvariant()
      $target = $requestParts[1]
      $headers = @{}
      while ($true) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) { break }
        $separator = $line.IndexOf(":")
        if ($separator -gt 0) {
          $headers[$line.Substring(0, $separator).Trim().ToLowerInvariant()] = $line.Substring($separator + 1).Trim()
        }
      }

      if ($method -notin @("GET", "HEAD")) {
        Write-SimpleResponse $stream 405 "Method Not Allowed" "Method not allowed"
        continue
      }

      $urlPath = [Uri]::UnescapeDataString(($target -split "\?", 2)[0])
      if ($urlPath -eq "/") { $urlPath = "/index.html" }
      $relativePath = $urlPath.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar)
      $filePath = [IO.Path]::GetFullPath((Join-Path $rootPath $relativePath))
      $rootPrefix = $rootPath.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

      if (-not $filePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        Write-SimpleResponse $stream 403 "Forbidden" "Forbidden"
        continue
      }

      if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        $filePath = Join-Path $rootPath "index.html"
      }

      $bytes = [IO.File]::ReadAllBytes($filePath)
      $start = 0
      $length = $bytes.Length
      $statusCode = 200
      $statusText = "OK"
      $contentRange = ""

      if ($headers.ContainsKey("range") -and $headers["range"] -match "^bytes=(\d*)-(\d*)$") {
        $rangeStart = $Matches[1]
        $rangeEnd = $Matches[2]
        if ($rangeStart) {
          $start = [int64]$rangeStart
          $end = if ($rangeEnd) { [Math]::Min([int64]$rangeEnd, $bytes.Length - 1) } else { $bytes.Length - 1 }
        } elseif ($rangeEnd) {
          $suffixLength = [Math]::Min([int64]$rangeEnd, $bytes.Length)
          $start = $bytes.Length - $suffixLength
          $end = $bytes.Length - 1
        }
        if ($start -ge 0 -and $start -lt $bytes.Length -and $end -ge $start) {
          $length = $end - $start + 1
          $statusCode = 206
          $statusText = "Partial Content"
          $contentRange = "Content-Range: bytes $start-$end/$($bytes.Length)`r`n"
        }
      }

      $extension = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
      $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { "application/octet-stream" }
      $responseHeaders = "HTTP/1.1 $statusCode $statusText`r`nContent-Type: $contentType`r`nContent-Length: $length`r`nAccept-Ranges: bytes`r`n${contentRange}Cache-Control: no-cache`r`nConnection: close`r`n`r`n"
      $responseHeaderBytes = [Text.Encoding]::ASCII.GetBytes($responseHeaders)
      $stream.Write($responseHeaderBytes, 0, $responseHeaderBytes.Length)
      if ($method -eq "GET") {
        $stream.Write($bytes, [int]$start, [int]$length)
      }
    } catch {
      if ($client.Connected) {
        try { Write-SimpleResponse $client.GetStream() 500 "Internal Server Error" "Server error" } catch {}
      }
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
