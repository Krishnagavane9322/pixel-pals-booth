# create-shortcut.ps1
$userProfile = $env:USERPROFILE
$desktops = @(
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $userProfile "OneDrive\Desktop"),
    (Join-Path $userProfile "Desktop")
)

$content = "[InternetShortcut]`nURL=https://pixel-pals-booth.vercel.app`nIconIndex=0`nIconFile=C:\Windows\System32\shell32.dll`n"

foreach ($d in $desktops) {
    if (Test-Path $d) {
        $target = Join-Path $d "ROVI Photo Booth.url"
        Set-Content -Path $target -Value $content -Force
        Write-Host "Created shortcut at: $target"
    }
}
