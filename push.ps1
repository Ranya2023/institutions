# push.ps1
# Run this from inside the extracted project folder — the one that
# contains README.md, admin.html, css/, js/, supabase/, etc.

$repoUrl = "https://github.com/Ranya2023/institutions.git"
$commitMessage = "Update: teacher-stage restriction, QR cards, read/unread, Azkar, new icon, sizing pass"

# First time running git in this folder? Connect it to the repo.
if (-not (Test-Path ".git")) {
    Write-Host "No git repo here yet — setting one up and connecting to GitHub..." -ForegroundColor Cyan
    git init
    git branch -M main
    git remote add origin $repoUrl
}

# Stage and commit everything
git add -A
git commit -m $commitMessage

# Try a normal push first
git push -u origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Normal push was rejected (this is expected if the folder wasn't already synced with GitHub)." -ForegroundColor Yellow
    Write-Host "This will fully replace what's on GitHub with what's in this folder." -ForegroundColor Yellow
    $confirm = Read-Host "Force push instead? This is safe for this project (type y to continue)"
    if ($confirm -eq "y") {
        git push -u origin main --force
        Write-Host "Pushed." -ForegroundColor Green
    } else {
        Write-Host "Cancelled. Nothing was force-pushed." -ForegroundColor Red
    }
} else {
    Write-Host "Pushed successfully." -ForegroundColor Green
}
