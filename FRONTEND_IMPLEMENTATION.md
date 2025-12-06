# Frontend Implementation: Build Completion Notification & Artifact Download

## 🔧 Bug Fix: Download Button Not Showing

### Problem
The ISO download button is not showing after build completion even though the backend sends the `BUILD_COMPLETE` WebSocket notification.

### Root Causes to Check

1. **WebSocket message not being parsed correctly**
   - Ensure `JSON.parse(event.data)` is called on the message
   - Check if `data.type === 'BUILD_COMPLETE'` condition is working

2. **Artifacts may be partial**
   - Not all builds produce both Docker image AND ISO
   - ISO generation can fail while Docker push succeeds
   - Frontend must handle cases where only `dockerImage` exists (no `isoDownloadUrl`)

3. **Polling fallback not implemented**
   - If WebSocket notification is missed, poll `/api/build/status/:id`
   - Check `response.downloadUrls` object for available downloads

### Fix Implementation

```typescript
// Handle WebSocket message
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('WebSocket received:', data); // Debug logging
  
  if (data.type === 'BUILD_COMPLETE' && data.buildId === currentBuildId) {
    if (data.status === 'SUCCESS') {
      showDownloadPage({
        dockerImage: data.artifacts.dockerImage || null,
        isoDownloadUrl: data.artifacts.isoDownloadUrl || null,
        dockerTarDownloadUrl: data.artifacts.dockerTarDownloadUrl || null
      });
    } else {
      showErrorPage(data.status);
    }
  }
};

// Fallback: Poll status endpoint
const pollBuildStatus = async (buildId: string) => {
  const response = await fetch(`/api/build/status/${buildId}`);
  const data = await response.json();
  
  if (data.status === 'SUCCESS') {
    showDownloadPage({
      dockerImage: data.downloadUrls?.dockerImage || null,
      isoDownloadUrl: data.downloadUrls?.isoDownloadUrl || null,
      dockerTarDownloadUrl: data.downloadUrls?.dockerTarDownloadUrl || null
    });
    return true; // Stop polling
  } else if (data.status === 'FAILED' || data.status === 'CANCELLED') {
    showErrorPage(data.status);
    return true; // Stop polling
  }
  return false; // Continue polling
};

// Download page should handle partial artifacts
const showDownloadPage = (artifacts: {
  dockerImage: string | null;
  isoDownloadUrl: string | null;
  dockerTarDownloadUrl: string | null;
}) => {
  // Show Docker section if dockerImage exists
  if (artifacts.dockerImage) {
    showDockerPullCommand(`docker pull ${artifacts.dockerImage}`);
  }
  
  // Show ISO download button if isoDownloadUrl exists
  if (artifacts.isoDownloadUrl) {
    showIsoDownloadButton(artifacts.isoDownloadUrl);
  }
  
  // Show Docker tar download if pushed to Hub failed
  if (artifacts.dockerTarDownloadUrl) {
    showDockerTarDownloadButton(artifacts.dockerTarDownloadUrl);
  }
  
  // Show message if no artifacts available
  if (!artifacts.dockerImage && !artifacts.isoDownloadUrl && !artifacts.dockerTarDownloadUrl) {
    showNoArtifactsMessage();
  }
};
```

### Key Points
- **Always check for null/undefined** before showing download buttons
- **Use polling as backup** - WebSocket might disconnect during long builds
- **Log WebSocket messages** to debug what's being received
- **Handle partial success** - Docker might succeed while ISO fails

---

## Overview
Implement a feature to receive real-time build completion notifications via WebSocket and handle artifact downloads (Docker image and ISO).

## Backend API Reference

**Base URL:** `http://localhost:3000`

### REST Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/build/start` | Start a build. Body: `{"base": "alpine", "packages": ["curl", "vim"]}`. Returns `{"buildId": "xxx"}` |
| `GET` | `/api/build/status/:id` | Get build status, artifacts, and `downloadUrls` object |
| `GET` | `/api/build/download/:id/iso` | Download ISO/rootfs tar file (streams file) |
| `GET` | `/api/build/download/:id/docker` | Download Docker tar OR returns JSON with pull command if pushed to Docker Hub |

### Build Status Response
The `/api/build/status/:id` endpoint now returns a `downloadUrls` object:
```json
{
  "id": "buildId",
  "status": "SUCCESS",
  "artifacts": [...],
  "downloadUrls": {
    "dockerImage": "grk2012/linux-custom-distro:buildId",
    "isoDownloadUrl": "/api/build/download/buildId/iso",
    "dockerTarDownloadUrl": "/api/build/download/buildId/docker"
  }
}
```

**Frontend can use polling as fallback:** If WebSocket notification is missed, poll `/api/build/status/:id` until `status` is `SUCCESS`, then use `downloadUrls`.

### WebSocket
- **URL:** `ws://localhost:3000`
- **Message Type:** `BUILD_COMPLETE`

**WebSocket Message Payload:**
```typescript
interface BuildCompletePayload {
  type: 'BUILD_COMPLETE';
  buildId: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  artifacts: {
    dockerImage?: string;           // Docker Hub image reference (e.g., "grk2012/linux-custom-distro:buildId")
    isoDownloadUrl?: string;        // Relative URL: "/api/build/download/{buildId}/iso"
    dockerTarDownloadUrl?: string;  // Relative URL: "/api/build/download/{buildId}/docker" (only if not pushed to Hub)
  };
}
```

## Required Implementation

### 1. WebSocket Connection
- Connect to `ws://localhost:3000` on app load or when user starts a build
- Handle reconnection on disconnect
- Parse incoming JSON messages

### 2. Build Completion Handler
- Listen for messages with `type: 'BUILD_COMPLETE'`
- Match `buildId` to track which build completed
- Handle all three statuses: SUCCESS, FAILED, CANCELLED

### 3. Download Page/Modal
When `BUILD_COMPLETE` with `status: 'SUCCESS'` is received:
- Show a download page/modal
- Display Docker image pull command: `docker pull {artifacts.dockerImage}`
- Show ISO download button that triggers `GET /api/build/download/{buildId}/iso`

### 4. ISO Download
- Use `fetch()` or `<a download>` to download from `isoDownloadUrl`
- File is returned as `application/octet-stream` with `Content-Disposition: attachment`

### 5. Docker Image Handling
- If `artifacts.dockerImage` exists: Show pull command `docker pull {image}`
- If `artifacts.dockerTarDownloadUrl` exists: Provide download button for tar file

## Example Flow

```typescript
// 1. Connect WebSocket
const ws = new WebSocket('ws://localhost:3000');

// 2. Start build
const response = await fetch('/api/build/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ base: 'alpine', packages: ['curl', 'vim'] })
});
const { buildId } = await response.json();

// 3. Listen for completion
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'BUILD_COMPLETE' && data.buildId === buildId) {
    if (data.status === 'SUCCESS') {
      // Show download page with:
      // - Docker: data.artifacts.dockerImage
      // - ISO: data.artifacts.isoDownloadUrl
    }
  }
};

// 4. Download ISO (user clicks button)
window.location.href = `http://localhost:3000${data.artifacts.isoDownloadUrl}`;
```

## UI Requirements
- Show build progress/status indicator while waiting
- Display success page with:
  - Docker pull command (copyable)
  - ISO download button
- Handle error states (FAILED/CANCELLED) with appropriate messaging

## Build Specification Schema

When starting a build, the request body should conform to this schema:

```typescript
interface BuildSpec {
  base: 'alpine' | 'debian' | 'ubuntu' | 'arch';
  kernel?: string;
  init?: string;
  architecture?: string;
  display?: {
    server?: string;
    compositor?: string;
    bar?: string;
    launcher?: string;
    terminal?: string;
    notifications?: string;
    lockscreen?: string;
  };
  packages: string[] | Record<string, boolean>;
  securityFeatures?: string[];
  defaults?: {
    swappiness?: number;
    trim?: boolean;
    kernelParams?: string;
    dnsOverHttps?: boolean;
    macRandomization?: boolean;
  };
}
```

## Example Build Requests

### Minimal Alpine Build
```json
{
  "base": "alpine",
  "packages": ["curl", "vim", "htop"]
}
```

### Full Arch Linux Build
```json
{
  "base": "arch",
  "kernel": "linux-zen",
  "packages": ["firefox", "code", "docker"],
  "display": {
    "server": "wayland",
    "compositor": "hyprland",
    "terminal": "kitty"
  },
  "securityFeatures": ["firewall", "apparmor"],
  "defaults": {
    "swappiness": 10,
    "trim": true
  }
}
```
