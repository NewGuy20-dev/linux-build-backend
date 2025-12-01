# Linux Builder Engine - AI Coding Agent Instructions

## Project Overview

**Linux Builder Engine** is a Node.js/Express backend that generates custom Linux OS builds (Docker images + ISOs) via REST API. The service accepts a `BuildSpec` (base distro, packages, security features, etc.), orchestrates the build lifecycle asynchronously, and stores artifacts in a PostgreSQL database.

Key pattern: **Async build lifecycle with fire-and-forget HTTP response** (202 Accepted) and real-time WebSocket logging.

## Architecture & Data Flow

### Core Build Lifecycle (`src/executor/lifecycle.ts`)
The build process runs **asynchronously** after HTTP response:
1. **Dockerfile Generation**: Distro-specific, handled by `src/builder/dockerfileGenerator.ts`
2. **Docker Build**: Container image creation from generated Dockerfile
3. **Registry Push or Export**: Push to Docker registry OR export as tarball
4. **ISO Generation**: Distro-specific ISO creation (Docker-based runners for Arch/Alpine, `live-build` for Debian/Ubuntu)
5. **Database Updates**: Status transitions (PENDING → IN_PROGRESS → SUCCESS/FAILED/CANCELLED)
6. **Cleanup**: Removes temporary workspace

**Critical design decision**: Each step checks `checkCancellation(buildId)` to support mid-build cancellation.

### API Request Flow
```
POST /api/build
  ↓ (validate with Zod schema)
  ↓ (create UserBuild record)
  ↓ (return 202 with buildId immediately)
  ↓ (runBuildLifecycle() runs in background)
     └→ Logs broadcast to WebSocket clients
     └→ Database updates status & artifacts
```

### Database Schema (`prisma/schema.prisma`)
- **UserBuild**: Core entity with status (`PENDING`/`IN_PROGRESS`/`SUCCESS`/`FAILED`/`CANCELLED`)
- **BuildLog**: Time-series logs per build (also broadcast via WebSocket)
- **BuildArtifact**: Generated files (Docker refs, ISO paths, tarballs)

## Distro-Specific Patterns

Each Linux distro uses different tooling and Dockerfile generation:

| Base | Docker Gen | ISO Gen | Special Handling |
|------|-----------|---------|------------------|
| **arch** | `FROM archlinux:latest` + `pacman` | Docker + `archiso` | Special package handlers (e.g., `oh-my-zsh`) in `ARCH_SPECIAL_PACKAGE_HANDLERS` |
| **debian** | `FROM debian:latest` + `apt-get` | `live-build` on host | Uses `bullseye` release |
| **ubuntu** | `FROM ubuntu:latest` + `apt-get` | `live-build` on host | Uses `focal` release + `universe` archive |
| **alpine** | `FROM alpine:latest` + `apk add` | Docker + custom Alpine build script | Uses `aports` Git repo |

**Key insight**: Arch and Alpine build ISOs inside Docker containers (privileged mode for Arch), while Debian/Ubuntu use `live-build` CLI tool on host.

### Package Flattening
`src/utils/packages.ts` flattens the hierarchical package input:
```typescript
// Input: { core: ["base", "linux"], tools: ["neovim"] }
// Output: ["base", "linux", "neovim"]
```

## Validation & Error Handling

- **Input validation**: Zod schema (`src/ai/schema.ts`) validates all build requests
- **Build-specific errors**: Caught in `lifecycle.ts`, status set to `FAILED`, logs written
- **Sanitization**: `src/utils/sanitizer.ts` prevents injection attacks (removes special chars from package names)
- **Cancellation**: Async cancellation flag read from database before each major step

## Logging & Real-Time Updates

**Two-part logging system** (`src/executor/logger.ts`):
1. **Database**: Each log entry saved to `BuildLog` table
2. **WebSocket**: JSON broadcast to all connected clients (format: `{ buildId, message }`)

```typescript
// Example usage in lifecycle
log(buildId, 'Generated Dockerfile');  // Saved + broadcast
```

## WebSocket Integration

- `src/ws/websocket.ts` initializes WebSocket server on HTTP upgrade
- `broadcast()` sends to all connected clients
- **No filtering by buildId**: All clients receive all build logs (frontend filters)

## Development Workflows

### Running Locally
```bash
npm install
npx prisma migrate dev     # Set up PostgreSQL
npm run dev               # Starts with ts-node + nodemon watching src/**
```

### Testing Builds
```bash
curl -X POST "http://localhost:3000/api/build" \
  -H "Content-Type: application/json" \
  -d '{
    "base": "arch",
    "packages": { "core": ["base"], "tools": ["git"] },
    "features": { "generateIso": true, "generateDocker": true }
  }'
# Returns: { "buildId": "cuid2_id_here" }

# Monitor status
curl "http://localhost:3000/api/build/status/cuid2_id_here"

# WebSocket logs
wscat -c ws://localhost:3000
```

### Key Environment Variables
- `DATABASE_URL`: PostgreSQL connection (required, supports Neon serverless)
- `DOCKER_REGISTRY_URL`: Optional Docker registry for push (falls back to tarball export)
- `PORT`: Server port (default 3000)
- `HOST`: Bind address (default 0.0.0.0)

## Code Organization

```
src/
├── api/               # Express routes & controllers
├── ai/                # Zod schemas & AI system prompts
├── builder/           # Dockerfile/ISO generation (distro-specific)
├── executor/          # Build lifecycle orchestration & logging
├── db/                # Prisma client initialization
├── ws/                # WebSocket server
└── utils/             # Sanitization, ID generation, FS ops, cancellation
```

## Conventions & Patterns

- **IDs**: CUID2 format (`src/utils/id.ts`), consistent across UserBuild and logs
- **Error messages**: Logged to both console and database, context includes buildId
- **Temp directories**: Created in `/tmp`, auto-cleaned after build (even on error)
- **Docker image names**: `build-{buildId}` for main builds, `{distro}-builder-{buildId}` for ISO builders
- **Relative paths**: Use `path.resolve()` to handle working directory changes

## When Adding Features

1. **New distro support**: Add case to `generateDockerfile()` and `generateIso()` switches
2. **New build output type**: Add `BuildArtifact` record in lifecycle with appropriate `fileType`
3. **New validation fields**: Extend `buildSchema` in `src/ai/schema.ts` with Zod
4. **New logging/metrics**: Extend `log()` function or add WebSocket message type
5. **Database schema changes**: Use `prisma migrate dev` and commit `.prisma/migrations/`

## Integration Points

- **Docker**: Required for building images and running ISO builders (requires `--privileged` for Arch)
- **Neon PostgreSQL**: Automatic adapter selection if `DATABASE_URL` contains `neon.tech`
- **File system**: Absolute paths required; temp cleanup on exit (success/failure)

## Known Limitations

- **Single machine**: Builds run sequentially (no clustering/queue system)
- **No auth**: All builds accepted; consider adding in production
- **No artifact cleanup**: ISO/tarball files remain on disk indefinitely
- **ISO generation**: Arch ISO requires `--privileged` Docker mode
- **Registry push**: Fails silently to tarball fallback if registry unreachable
