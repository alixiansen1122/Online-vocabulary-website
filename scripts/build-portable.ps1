$ErrorActionPreference = "Stop"
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$releaseRoot = Join-Path $projectRoot "release"
$packageDir = Join-Path $releaseRoot "word-memory-web"
$zipPath = Join-Path $releaseRoot "word-memory-web-portable.zip"

function Assert-InProject([string]$Path) {
  $resolved = [IO.Path]::GetFullPath($Path)
  $prefix = $projectRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify a path outside the project: $resolved"
  }
}

Assert-InProject $releaseRoot
Assert-InProject $packageDir
Assert-InProject $zipPath

Push-Location $projectRoot
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "Web build failed" }

  if (Test-Path -LiteralPath $packageDir) {
    Remove-Item -LiteralPath $packageDir -Recurse -Force
  }
  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }

  New-Item -ItemType Directory -Path (Join-Path $packageDir "www") -Force | Out-Null
  Copy-Item -Path (Join-Path $projectRoot "dist\*") -Destination (Join-Path $packageDir "www") -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "portable-server.ps1") -Destination $packageDir
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "start-portable.bat") -Destination (Join-Path $packageDir "start-portable.bat")
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "PORTABLE-README.txt") -Destination (Join-Path $packageDir "README.txt")

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zipStream = [IO.File]::Open($zipPath, [IO.FileMode]::CreateNew)
  $archive = [IO.Compression.ZipArchive]::new($zipStream, [IO.Compression.ZipArchiveMode]::Create)
  try {
    Get-ChildItem -LiteralPath $packageDir -Recurse -File | ForEach-Object {
      $entryName = $_.FullName.Substring($packageDir.Length + 1).Replace("\", "/")
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive,
        $_.FullName,
        $entryName,
        [IO.Compression.CompressionLevel]::NoCompression
      ) | Out-Null
    }
  } finally {
    $archive.Dispose()
    $zipStream.Dispose()
  }
  Write-Host "Portable package: $zipPath"
} finally {
  Pop-Location
}
