# Build Lifecycle Testing Guide

## Overview

The Linux Builder Engine has a complete build lifecycle with three main endpoints:

1. **Start Build** - `POST /api/build/start` - Initiates a new build
2. **Check Status** - `GET /api/build/status/:id` - Polls build progress
3. **Download Artifact** - `GET /api/build/download/:id/:type` - Downloads completed artifacts

## Build Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. POST /api/build/start                                    │
│    - Send BuildSpec JSON                                    │
│    - Returns: buildId + normalized spec                     │
│    - Status: PENDING                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Build Execution (Async)                                  │
│    - Status transitions: PENDING → RUNNING → COMPLETED      │
│    - Logs streamed to database                              │
│    - Artifacts generated                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. GET /api/build/status/:id (Poll)                         │
│    - Returns: Full build record with logs & artifacts       │
│    - Check status field for progress                        │
│    - Repeat until COMPLETED/FAILED/CANCELLED                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. GET /api/build/download/:id/:type                        │
│    - type: "docker" or "iso"                                │
│    - Returns: File stream or Docker reference               │
│    - Artifacts stored in /artifacts directory               │
└─────────────────────────────────────────────────────────────┘
```

## Minimal Test Command

Start a build with minimal configuration:

```bash
curl -X POST http://localhost:3000/api/build/start \
  -H "Content-Type: application/json" \
  -d '{
    "base": "arch",
    "init": "systemd",
    "kernel": {"version": "linux-lts"},
    "packages": {
      "base": ["base", "linux-lts"],
      "utils": ["curl"]
    }
  }' | jq '.buildId'
```

This returns a `buildId` like: `clx1a2b3c4d5e6f7g8h9i0j1k`

## Check Build Status

```bash
BUILD_ID="clx1a2b3c4d5e6f7g8h9i0j1k"
curl -s http://localhost:3000/api/build/status/$BUILD_ID | jq '.status'
```

Possible status values:
- `PENDING` - Queued, waiting to start
- `RUNNING` - Currently building
- `COMPLETED` - Successfully finished
- `FAILED` - Build encountered an error
- `CANCELLED` - Build was cancelled

## Poll Until Complete

```bash
BUILD_ID="clx1a2b3c4d5e6f7g8h9i0j1k"

while true; do
  STATUS=$(curl -s http://localhost:3000/api/build/status/$BUILD_ID | jq -r '.status')
  echo "Status: $STATUS"
  
  if [[ "$STATUS" == "COMPLETED" || "$STATUS" == "FAILED" ]]; then
    break
  fi
  
  sleep 5
done
```

## Get Full Build Details

```bash
BUILD_ID="clx1a2b3c4d5e6f7g8h9i0j1k"
curl -s http://localhost:3000/api/build/status/$BUILD_ID | jq '.'
```

Response includes:
- `id` - Build ID
- `status` - Current status
- `baseDistro` - Base distribution used
- `spec` - Full build specification
- `logs` - Array of build log entries
- `artifacts` - Array of generated artifacts
- `downloadUrls` - URLs for downloading artifacts

## Download Artifacts

### Docker Image TAR

```bash
BUILD_ID="clx1a2b3c4d5e6f7g8h9i0j1k"
curl -X GET http://localhost:3000/api/build/download/$BUILD_ID/docker \
  -o build-$BUILD_ID.tar
```

### ISO Image

```bash
BUILD_ID="clx1a2b3c4d5e6f7g8h9i0j1k"
curl -X GET http://localhost:3000/api/build/download/$BUILD_ID/iso \
  -o build-$BUILD_ID.iso
```

## Complete BuildSpec Example

```json
{
  "base": "arch",
  "architecture": "x86_64",
  "init": "systemd",
  "kernel": {
    "version": "linux-lts",
    "customFlags": [],
    "modules": {
      "enable": [],
      "disable": []
    }
  },
  "filesystem": {
    "root": "ext4",
    "encryption": null,
    "compression": false,
    "partitions": [],
    "lvm": false,
    "raid": false
  },
  "display": null,
  "packages": {
    "base": ["base", "linux-lts", "linux-firmware"],
    "development": ["git", "vim"],
    "utils": ["curl", "wget"]
  },
  "securityFeatures": {
    "firewall": {
      "backend": "nftables",
      "policy": "deny",
      "rules": []
    }
  },
  "customization": {
    "shell": "bash"
  }
}
```

## Valid Enum Values

### Base Distributions
- `arch` - Arch Linux
- `debian` - Debian
- `ubuntu` - Ubuntu
- `alpine` - Alpine Linux
- `fedora` - Fedora
- `opensuse` - openSUSE
- `void` - Void Linux
- `gentoo` - Gentoo

### Init Systems
- `systemd` - systemd
- `openrc` - OpenRC
- `runit` - runit
- `s6` - s6

### Kernel Versions
- `linux-lts` - Linux LTS
- `linux-zen` - Linux Zen
- `linux-hardened` - Linux Hardened

### Architectures
- `x86_64` - 64-bit x86
- `aarch64` - ARM 64-bit

### Filesystems
- `ext4` - ext4
- `btrfs` - Btrfs
- `xfs` - XFS
- `zfs` - ZFS

## Error Responses

### Invalid Build Spec (400)

```bash
curl -X POST http://localhost:3000/api/build/start \
  -H "Content-Type: application/json" \
  -d '{"base": "invalid"}'
```

Response:
```json
{
  "error": "Invalid build specification",
  "details": "Invalid enum value. Expected 'arch' | 'debian' | ...",
  "stack": [...]
}
```

### Build Not Found (404)

```bash
curl -X GET http://localhost:3000/api/build/status/invalid-id
```

Response:
```json
{
  "error": "Build not found"
}
```

## Testing Scripts

### Quick Test (2 minutes max)
```bash
bash quick-curl-test.sh
```

### Full Test with Polling
```bash
bash test-build-lifecycle.sh
```

### Manual Step-by-Step
See `curl-test-commands.md` for detailed commands

## Database Records

After a build completes, check the database:

```bash
# View build record
SELECT * FROM "UserBuild" WHERE id = 'BUILD_ID';

# View build logs
SELECT * FROM "BuildLog" WHERE "buildId" = 'BUILD_ID';

# View artifacts
SELECT * FROM "BuildArtifact" WHERE "buildId" = 'BUILD_ID';
```

## Troubleshooting

### Build Stuck in RUNNING
- Check server logs: `npm run dev` output
- Check database for logs: `SELECT * FROM "BuildLog" WHERE "buildId" = 'BUILD_ID' ORDER BY "createdAt" DESC;`
- Check Docker: `docker ps` and `docker logs`

### Artifact Not Found
- Verify build status is COMPLETED
- Check artifacts table: `SELECT * FROM "BuildArtifact" WHERE "buildId" = 'BUILD_ID';`
- Check filesystem: `ls -la artifacts/`

### Connection Refused
- Ensure server is running: `npm run dev`
- Check port: `lsof -i :3000`
- Verify BASE_URL in curl commands

## Performance Notes

- Minimal builds (base + utils): ~2-5 minutes
- Full builds (all packages): ~10-30 minutes
- Gentoo builds: 30+ minutes (compilation required)
- Database cleanup runs every 24 hours (removes artifacts older than 7 days)
