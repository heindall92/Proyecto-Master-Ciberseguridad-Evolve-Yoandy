# Valhalla SOC - Database Backup Script
$backupDir = ".\backups"
if (!(Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir }

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dbFile = ".\backend\valhalla.db"
$backupFile = "$backupDir\valhalla_backup_$timestamp.db"

if (Test-Path $dbFile) {
    Copy-Item $dbFile $backupFile
    Write-Host "✅ Backup created successfully: $backupFile" -ForegroundColor Green
} else {
    Write-Host "❌ Database file not found at $dbFile" -ForegroundColor Red
}
