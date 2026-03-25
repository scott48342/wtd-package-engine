<#
.SYNOPSIS
    Posts to the Warehouse Tire Facebook page
.PARAMETER PostId
    The post ID from facebook-posts.json to publish
.PARAMETER DryRun
    If specified, shows what would be posted without actually posting
#>
param(
    [Parameter(Mandatory=$true)]
    [int]$PostId,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Load credentials and posts
$configDir = "C:\Users\Scott-Pc\clawd\config"
$creds = Get-Content "$configDir\facebook-credentials.json" | ConvertFrom-Json
$postsFile = "$configDir\facebook-posts.json"
$postsData = Get-Content $postsFile | ConvertFrom-Json

# Find the post
$post = $postsData.posts | Where-Object { $_.id -eq $PostId }
if (-not $post) {
    Write-Error "Post ID $PostId not found"
    exit 1
}

if ($post.status -eq "posted") {
    Write-Host "Post $PostId already posted on $($post.postedAt)"
    exit 0
}

# Build the message with link
$message = "$($post.copy)`n`n$($post.url)"

Write-Host "=== Facebook Post #$PostId ===" -ForegroundColor Cyan
Write-Host "Type: $($post.type)"
Write-Host "Scheduled: $($post.date) $($post.time)"
Write-Host "---"
Write-Host $post.copy
Write-Host ""
Write-Host $post.url -ForegroundColor Blue
Write-Host "---"

if ($DryRun) {
    Write-Host "[DRY RUN] Would post to page $($creds.pageId)" -ForegroundColor Yellow
    exit 0
}

# Post to Facebook Graph API
$uri = "https://graph.facebook.com/v19.0/$($creds.pageId)/feed"
$body = @{
    message = $message
    access_token = $creds.accessToken
}

try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -Body $body
    $postIdFb = $response.id
    
    # Update status in posts file
    $post.status = "posted"
    $post | Add-Member -NotePropertyName "postedAt" -NotePropertyValue (Get-Date -Format "yyyy-MM-dd HH:mm:ss") -Force
    $post | Add-Member -NotePropertyName "fbPostId" -NotePropertyValue $postIdFb -Force
    
    $postsData | ConvertTo-Json -Depth 10 | Set-Content $postsFile
    
    Write-Host "SUCCESS: Posted to Facebook" -ForegroundColor Green
    Write-Host "FB Post ID: $postIdFb"
    
    # Log to posting history
    $logFile = "C:\Users\Scott-Pc\clawd\logs\facebook-posts.log"
    $logEntry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Post #$PostId | $($post.type) | $postIdFb | $($post.url)"
    Add-Content -Path $logFile -Value $logEntry
    
    exit 0
}
catch {
    Write-Error "Failed to post: $_"
    
    # Log failure
    $logFile = "C:\Users\Scott-Pc\clawd\logs\facebook-posts.log"
    $logEntry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Post #$PostId | FAILED | $($_.Exception.Message)"
    Add-Content -Path $logFile -Value $logEntry
    
    exit 1
}
