# Linux Builder Engine Backend - In-Depth Codebase Analysis

## Project Overview
A Node.js/TypeScript backend service that generates custom Linux OS builds using Docker containers. It accepts build specifications (either as JSON or AI-generated from prompts) and orchestrates a multi-step build lifecycle to produce Docker images and ISO files.

---

## Architecture & Design Patterns

### 1. **Layered Architecture**
```
API Layer (Express routes)
    ↓
Controller Layer (Request handling & validation)
    ↓
Business Logic Layer (Build lifecycle, AI generation)
    ↓
Infrastructure Layer (Docker execution, Database, WebSockets)
```

### 2. **Key Design Patterns**
- **Async/Await Pattern**: All I/O operations use async/await for clean error handling
- **Validation-First**: Zod schemas validate all inputs before processing
- **Event Broadcasting**: WebSocket broadcasts build completion events to connected clients
- **Retry Logic**: Database operations include exponential backoff retry mechanism
- **Graceful Degradation**: Non-critical failures (ISO generation) don't fail entire build

---

## Core Components

### 1. **API Layer** (`src/api/`)

#### `build.routes.ts`
- Routes: `/health`, `/build`, `/build/start`, `/build/generate`, `/build/status/:id`, `/build/artifact/:id`, `/build/download/:id/:type`
- Supports both direct JSON specs and AI-generated specs from prompts

#### `build.controller.ts`
- **startBuild()**: Accepts BuildSpec JSON or prompt string
  - If prompt: calls `generateBuildSpec()` via Ollama AI
  - If JSON: validates against buildSchema
  - Creates database record and triggers async build lifecycle
  - Returns 202 (Accepted) with buildId
  
- **getBuildStatus()**: Returns build status with logs, artifacts, and download URLs
  - Constructs download URLs based on artifact types
  
- **downloadArtifact()**: Streams artifact files (ISO, Docker tar)
  - Handles Docker Hub references separately
  
- **generateFromPrompt()**: Standalone endpoint for spec generation without building

### 2. **Build Execution** (`src/executor/`)

#### `lifecycle.ts` - Core Build Orchestration
**Build Steps (BuildStep enum)**:
1. PENDING → VALIDATING → GENERATING → BUILDING → ISO_GENERATING → UPLOADING → COMPLETE/FAILED

**Key Functions**:
- `runBuildLifecycle()`: Main orchestration function
  - Validates spec compatibility
  - Generates config files (firewall, fail2ban, kernel hardening, services, shell)
  - Builds Docker image
  - Exports/pushes Docker image
  - Generates ISO (non-fatal if fails)
  - Broadcasts completion via WebSocket
  
- `generateConfigFiles()`: Creates security and customization configs
  - Firewall rules (nftables/iptables/ufw)
  - Fail2ban configuration
  - Kernel hardening (sysctl)
  - Service enablement scripts
  - Shell configuration (.bashrc, .zshrc, config.fish)
  - Starship prompt config

- `updateStep()`: Updates database status and logs
- `moveToArtifacts()`: Moves build outputs to persistent artifacts directory
- `sendBuildCompleteNotification()`: Broadcasts via WebSocket

**Error Handling**:
- Catches cancellation signals
- Distinguishes between CANCELLED and FAILED states
- Cleans up workspace in finally block
- Non-fatal failures (ISO) don't stop build

#### `executor.ts`
- `executeCommand()`: Wraps child_process.exec with logging
- Captures stdout/stderr
- Logs all command execution for debugging

#### `logger.ts`
- Logs build events to database via Prisma
- Stores log level (info, warn, error)

### 3. **Build Specification & Validation** (`src/ai/`)

#### `schema.ts` - Zod Schema Definition
**Main BuildSpec Object**:
```typescript
{
  name?: string
  base: 'arch' | 'debian' | 'ubuntu' | 'alpine' | 'fedora' | 'opensuse' | 'void' | 'gentoo'
  architecture: 'x86_64' | 'aarch64' (default: x86_64)
  kernel: { version, customFlags, modules }
  init: 'systemd' | 'openrc' | 'runit' | 's6'
  filesystem: { root, encryption, compression, snapshots, partitions, lvm, raid }
  display: { server, compositor, bar, launcher, terminal, theme, notifications, lockscreen }
  packages: string[] | { base, development, ai_ml, security, networking, databases, servers, multimedia, utils } | Record<string, boolean>
  securityFeatures: { mac, firewall, ssh, updates, kernelHardening }
  services: { databases, monitoring, ai }
  backup: { tool, schedule, retention, destinations }
  customization: { shell, shellFramework, shellTheme, bootloader, dotfiles }
  postInstall: { scripts, systemTuning, services }
  defaults: { swappiness, trim, kernelParams, dnsOverHttps, macRandomization }
}
```

**Validation Function**: `validateCompatibility()`
- Checks MAC conflicts (AppArmor vs SELinux)
- Validates display server/compositor compatibility (Hyprland→Wayland, i3→Xorg)
- Verifies init system support per distro
- Generates warnings for complex configs (Gentoo, ZFS on Alpine, SELinux on Arch)

#### `ollama.ts` - AI Integration
- Calls Ollama API at `OLLAMA_URL/api/generate`
- Uses model specified in `OLLAMA_MODEL` env var
- Extracts JSON from response (handles thinking tags)
- Validates extracted JSON against buildSchema
- Returns validated BuildSpec

### 4. **Builder Modules** (`src/builder/`)

#### `dockerfileGenerator.ts`
- Generates multi-stage Dockerfile from BuildSpec
- Selects base image per distro (archlinux, debian, ubuntu, alpine, fedora, opensuse, voidlinux, gentoo)
- Installs packages via distro-specific package managers
- Configures shell (bash, zsh, fish) with frameworks (oh-my-zsh, starship)
- Sets up security features (AppArmor, SELinux, firewall, fail2ban)
- Enables services (databases, monitoring, AI)
- Applies kernel hardening and system tuning

#### `isoGenerator.ts`
- Generates bootable ISO from Docker image
- Configures bootloader (GRUB, systemd-boot)
- Sets up encryption (LUKS1/LUKS2)
- Handles kernel selection per distro
- Generates bootloader config with kernel parameters

#### `tarExporter.ts`
- Exports Docker image as tar archive
- Fallback when Docker Hub push fails

#### `packageMaps.ts`
- Maps package names across distros
- Provides distro-specific package managers (apt, pacman, dnf, apk, zypper, xbps, emerge)
- Handles package availability warnings

### 5. **Database Layer** (`src/db/`)

#### `db.ts` - Prisma Client with Retry Logic
- Uses Neon PostgreSQL serverless adapter
- Implements exponential backoff retry (3 attempts)
- Catches transient connection failures (ETIMEDOUT, fetch failed)
- Extends Prisma with retry middleware

#### `schema.prisma` - Data Models
**UserBuild**:
- id (cuid)
- createdAt, updatedAt
- status: PENDING | IN_PROGRESS | SUCCESS | FAILED | CANCELLED
- baseDistro, spec (JSON)
- kernelVersion, initSystem, architecture, securityLevel
- buildDuration (seconds)
- warnings (array)
- Relations: logs[], artifacts[]

**BuildLog**:
- id, createdAt
- message, level (info, warn, error)
- buildId (FK to UserBuild)

**BuildArtifact**:
- id, createdAt
- fileName, fileType (docker-image, docker-image-ref, iso, rootfs)
- url (file path or Docker Hub reference)
- size (bytes), checksum (sha256)
- buildId (FK to UserBuild)

### 6. **WebSocket Communication** (`src/ws/`)

#### `websocket.ts`
- Initializes WebSocket server on HTTP server
- Broadcasts build completion events
- Payload includes buildId, status, artifact URLs
- Clients receive notifications when builds complete

### 7. **Utilities** (`src/utils/`)

**Key Utilities**:
- `packages.ts`: Normalizes package formats (array, categorized object, boolean record)
- `id.ts`: Generates unique build IDs (cuid2)
- `fs.ts`: Creates/cleans temporary directories
- `cancellation.ts`: Checks for build cancellation signals
- `securityConfig.ts`: Generates firewall, fail2ban, kernel hardening configs
- `serviceConfig.ts`: Generates service enablement scripts
- `shellConfig.ts`: Generates shell RC files and Starship config
- `sanitizer.ts`: Sanitizes package names for security
- `artifactCleanup.ts`: Periodic cleanup of old artifacts

---

## Data Flow

### Build Initiation Flow
```
POST /api/build/start
    ↓
Controller validates input (JSON or prompt)
    ↓
If prompt: Call Ollama AI → generateBuildSpec()
    ↓
Create UserBuild record (status: PENDING)
    ↓
Trigger async runBuildLifecycle()
    ↓
Return 202 with buildId
```

### Build Execution Flow
```
runBuildLifecycle()
    ↓
Validate spec compatibility
    ↓
Create temp workspace
    ↓
Generate config files (firewall, fail2ban, kernel, services, shell)
    ↓
Generate Dockerfile
    ↓
Docker build → Docker image
    ↓
Push to Docker Hub OR export as tar
    ↓
Generate ISO (optional, non-fatal)
    ↓
Move artifacts to persistent directory
    ↓
Create BuildArtifact records
    ↓
Broadcast BUILD_COMPLETE via WebSocket
    ↓
Cleanup workspace
```

### Status Retrieval Flow
```
GET /api/build/status/:id
    ↓
Query UserBuild with logs and artifacts
    ↓
Construct download URLs
    ↓
Return full build status
```

---

## Key Features & Capabilities

### 1. **Multi-Distro Support**
- Arch, Debian, Ubuntu, Alpine, Fedora, openSUSE, Void, Gentoo
- Distro-specific package managers and kernel packages

### 2. **Flexible Package Management**
- Three input formats: array, categorized object, boolean record
- Automatic normalization
- Cross-distro package mapping

### 3. **Security Features**
- MAC systems (AppArmor, SELinux)
- Firewall backends (nftables, iptables, ufw)
- Fail2ban SSH protection
- Kernel hardening (sysctl parameters)
- LUKS encryption support

### 4. **Customization**
- Shell selection (bash, zsh, fish)
- Shell frameworks (oh-my-zsh)
- Prompt themes (Starship)
- Bootloader configuration (GRUB, systemd-boot)
- Dotfiles support

### 5. **AI-Powered Spec Generation**
- Natural language prompts → BuildSpec JSON
- Ollama integration for local LLM inference
- Fallback to direct JSON submission

### 6. **Artifact Management**
- Docker image export (tar) or Docker Hub push
- ISO generation with bootloader
- Persistent artifact storage
- Download URLs for client retrieval
- Automatic cleanup of old artifacts

### 7. **Real-Time Monitoring**
- WebSocket notifications on build completion
- Build logs stored in database
- Status tracking with step information
- Build duration tracking

---

## Error Handling & Resilience

### 1. **Database Resilience**
- Exponential backoff retry (3 attempts)
- Catches transient connection failures
- Non-fatal DB errors don't crash build

### 2. **Build Resilience**
- Cancellation support (checkCancellation())
- Non-fatal failures (ISO generation) don't stop build
- Graceful degradation (Docker push failure → tar export)

### 3. **Validation**
- Zod schema validation on all inputs
- Cross-field compatibility checks
- Warnings for complex configurations

### 4. **Logging**
- All operations logged to database
- Log levels: info, warn, error
- Timestamps for debugging

---

## Environment Configuration

**Required**:
- `DATABASE_URL`: Neon PostgreSQL connection string
- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 0.0.0.0)

**Optional**:
- `OLLAMA_URL`: Ollama API endpoint (default: http://127.0.0.1:11434)
- `OLLAMA_MODEL`: Ollama model name (default: linux-builder)
- `DOCKER_IMAGE_REPO`: Docker Hub repository for pushing images
- `DOCKER_HUB_USER`: Docker Hub username
- `DOCKER_HUB_TOKEN`: Docker Hub authentication token

---

## Performance Considerations

1. **Async Build Execution**: Builds run asynchronously, returning immediately with buildId
2. **Workspace Cleanup**: Temporary files cleaned up after build
3. **Artifact Persistence**: Built artifacts stored in persistent directory
4. **Database Connection Pooling**: Neon adapter handles connection management
5. **WebSocket Broadcasting**: Efficient event notification to all connected clients

---

## Security Considerations

1. **Input Validation**: All inputs validated via Zod schemas
2. **Package Sanitization**: Package names sanitized before execution
3. **Command Injection Prevention**: Uses child_process.exec safely
4. **CORS**: Configured to allow all origins (should be restricted in production)
5. **No Secrets in Code**: Secrets loaded from environment variables
6. **Artifact Access**: Direct file path access (should add authentication in production)

---

## Potential Improvements

1. **Authentication/Authorization**: Add user authentication and build ownership
2. **Rate Limiting**: Prevent abuse of build API
3. **Build Queuing**: Queue builds instead of running all concurrently
4. **Artifact Expiration**: Automatic deletion of old artifacts
5. **Build Cancellation**: Implement proper build cancellation mechanism
6. **Monitoring**: Add metrics/observability (Prometheus, etc.)
7. **Error Recovery**: More granular error handling and recovery strategies
8. **Testing**: Add comprehensive unit and integration tests
9. **Documentation**: API documentation (OpenAPI/Swagger)
10. **Caching**: Cache generated Dockerfiles and configs for similar specs
