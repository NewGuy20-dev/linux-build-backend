# Build Lifecycle Test Commands

## Prerequisites
- Server running on `http://localhost:3000`
- `jq` installed for JSON parsing (optional but recommended)

## 1. Start a Build

```bash
curl -X POST http://localhost:3000/api/build/start \
  -H "Content-Type: application/json" \
  -d '{
    "base": "arch",
    "architecture": "x86_64",
    "init": "systemd",
    "kernel": {
      "version": "linux-lts"
    },
    "packages": {
      "base": ["base", "linux-lts", "linux-firmware"],
      "development": ["git"],
      "utils": ["curl"]
    }
  }' | jq '.'
```

**Expected Response:**
```json
{
  "buildId": "clx1a2b3c4d5e6f7g8h9i0j1k",
  "spec": { ... }
}
```

Save the `buildId` for the next steps.

---

## 2. Check Build Status

Replace `BUILD_ID` with the ID from step 1:

```bash
BUILD_ID="clx1a2b3c4d5e6f7g8h9i0j1k"

curl -X GET http://localhost:3000/api/build/status/$BUILD_ID | jq '.'
```

**Expected Response:**
```json
{
  "id": "clx1a2b3c4d5e6f7g8h9i0j1k",
  "createdAt": "2025-12-10T10:07:31.494Z",
  "updatedAt": "2025-12-10T10:07:35.123Z",
  "status": "RUNNING",
  "baseDistro": "arch",
  "spec": { ... },
  "logs": [ ... ],
  "artifacts": [ ... ],
  "downloadUrls": {
    "dockerImage": "...",
    "dockerTarDownloadUrl": "/api/build/download/BUILD_ID/docker",
    "isoDownloadUrl": "/api/build/download/BUILD_ID/iso"
  }
}
```

**Status Values:**
- `PENDING` - Build queued
- `RUNNING` - Build in progress
- `COMPLETED` - Build finished successfully
- `FAILED` - Build failed
- `CANCELLED` - Build was cancelled

---

## 3. Poll for Completion

```bash
BUILD_ID="clx1a2b3c4d5e6f7g8h9i0j1k"

# Poll every 5 seconds until complete
while true; do
  STATUS=$(curl -s http://localhost:3000/api/build/status/$BUILD_ID | jq -r '.status')
  echo "Status: $STATUS"
  
  if [[ "$STATUS" == "COMPLETED" || "$STATUS" == "FAILED" || "$STATUS" == "CANCELLED" ]]; then
    break
  fi
  
  sleep 5
done
```

---

## 4. Download Artifacts

### Download Docker Image TAR

```bash
BUILD_ID="clx1a2b3c4d5e6f7g8h9i0j1k"

curl -X GET http://localhost:3000/api/build/download/$BUILD_ID/docker \
  -o build-$BUILD_ID.tar
```

### Download ISO

```bash
BUILD_ID="clx1a2b3c4d5e6f7g8h9i0j1k"

curl -X GET http://localhost:3000/api/build/download/$BUILD_ID/iso \
  -o build-$BUILD_ID.iso
```

### Get Docker Hub Reference (if available)

```bash
BUILD_ID="clx1a2b3c4d5e6f7g8h9i0j1k"

curl -X GET http://localhost:3000/api/build/download/$BUILD_ID/docker | jq '.'
```

---

## 5. Get Artifact Info

```bash
BUILD_ID="clx1a2b3c4d5e6f7g8h9i0j1k"

curl -X GET http://localhost:3000/api/build/artifact/$BUILD_ID | jq '.'
```

---

## Complete Lifecycle Test Script

Save as `test-build.sh` and run with `bash test-build.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"

# Start build
echo "Starting build..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/build/start" \
  -H "Content-Type: application/json" \
  -d '{
    "base": "arch",
    "architecture": "x86_64",
    "init": "systemd",
    "kernel": {"version": "linux-lts"},
    "packages": {
      "base": ["base", "linux-lts"],
      "utils": ["curl"]
    }
  }')

BUILD_ID=$(echo "$RESPONSE" | jq -r '.buildId')
echo "Build ID: $BUILD_ID"

# Poll for completion
echo "Waiting for build to complete..."
while true; do
  STATUS=$(curl -s "$BASE_URL/api/build/status/$BUILD_ID" | jq -r '.status')
  echo "Status: $STATUS"
  
  if [[ "$STATUS" == "COMPLETED" || "$STATUS" == "FAILED" ]]; then
    break
  fi
  
  sleep 5
done

# Get final status
echo "Final status:"
curl -s "$BASE_URL/api/build/status/$BUILD_ID" | jq '.'
```

---

## Error Handling

### Invalid Build Spec

```bash
curl -X POST http://localhost:3000/api/build/start \
  -H "Content-Type: application/json" \
  -d '{"base": "invalid"}' | jq '.'
```

**Expected Response (400):**
```json
{
  "error": "Invalid build specification",
  "details": "Invalid enum value. Expected 'arch' | 'debian' | 'ubuntu' | 'alpine' | 'fedora' | 'opensuse' | 'void' | 'gentoo'",
  "stack": [ ... ]
}
```

### Build Not Found

```bash
curl -X GET http://localhost:3000/api/build/status/invalid-id | jq '.'
```

**Expected Response (404):**
```json
{
  "error": "Build not found"
}
```

---

## Valid Base Distros

- `arch` - Arch Linux
- `debian` - Debian
- `ubuntu` - Ubuntu
- `alpine` - Alpine Linux
- `fedora` - Fedora
- `opensuse` - openSUSE
- `void` - Void Linux
- `gentoo` - Gentoo

## Valid Init Systems

- `systemd` - systemd
- `openrc` - OpenRC
- `runit` - runit
- `s6` - s6

## Valid Kernel Versions

- `linux-lts` - Linux LTS
- `linux-zen` - Linux Zen
- `linux-hardened` - Linux Hardened
