# Linux Builder Engine - Security & Enhancement Implementation Plan

**Created:** 2025-12-10  
**Version:** 1.0  
**Status:** Active  

---

## Executive Summary

This document provides a detailed implementation plan for security fixes, stability improvements, and feature enhancements for the Linux Builder Engine Backend. The plan is organized into 12 phases with clear priorities, dependencies, and acceptance criteria.

### Current State Assessment

After code review, several security measures are **already implemented**:

| Finding | Status | Location |
|---------|--------|----------|
| Shell injection in tarExporter | ✅ Fixed | `src/builder/tarExporter.ts` - uses `escapeShellArg()` |
| Dotfiles URL validation | ✅ Fixed | `src/builder/dockerfileGenerator.ts` - uses `validateGitUrl()` |
| Base distro validation | ✅ Fixed | `src/builder/isoGenerator.ts` - `validateBaseDistro()` |
| HTTP timeout for Ollama | ✅ Fixed | `src/ai/ollama.ts` - AbortController with configurable timeout |
| AppArmor profile validation | ✅ Fixed | `src/utils/securityConfig.ts` - pattern validation |
| Backup destination sanitization | ✅ Fixed | `src/utils/backupConfig.ts` - `sanitizeDestination()` |
| Trust proxy configuration | ✅ Fixed | `src/index.ts` - conditional trust proxy |
| API key caching by hash | ✅ Fixed | `src/middleware/auth.ts` - cache by hash |
| Build lifecycle error handling | ✅ Fixed | `src/api/build.controller.ts` - `.catch()` handler |
| Rate limiting order | ✅ Fixed | `src/api/build.routes.ts` - rate limit before auth |

### Remaining Work

This plan focuses on items that still require implementation or enhancement.

---

## 🔴 PHASE 1: Critical Security Fixes

**Priority:** CRITICAL  
**Timeline:** Week 1  
**Risk Level:** High if not addressed  

### 1.1 Refactor exec() to execFile() in Executor

**File:** `src/executor/executor.ts`  
**Current State:** Uses `exec()` which spawns a shell  
**Risk:** Shell metacharacter injection if escaping fails  

#### Implementation Steps

```typescript
// src/executor/executor.ts - Add execFile variant

import { exec, execFile, ExecOptions, ExecFileOptions } from "child_process";

// New secure function for commands with known arguments
export const executeCommandSecureArgs = (
  command: string,
  args: string[],
  buildId: string,
  options?: ExecFileOptions
): Promise<string> => {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      const out = stdout?.toString() || "";
      const err = stderr?.toString() || "";

      if (error) {
        log(buildId, `Error executing: ${command}`);
        log(buildId, maskSensitiveData(err));
        reject(err);
        return;
      }

      log(buildId, `Successfully executed: ${command}`);
      resolve(out);
    });
  });
};
```

#### Tasks

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 1.1.1 | Add `executeCommandSecureArgs()` function | Function exists and uses `execFile()` |
| 1.1.2 | Refactor `tarExporter.ts` to use new function | `docker save` uses `execFile()` |
| 1.1.3 | Refactor simple docker commands in `isoGenerator.ts` | Commands with static args use `execFile()` |
| 1.1.4 | Add unit tests for new executor function | Tests pass with various inputs |

#### Dependencies
- None

#### Risks
- Some complex shell commands may still require `exec()` (pipes, redirects)
- Mitigation: Keep `exec()` for complex commands, use `execFile()` where possible

---

### 1.2 Header Injection Prevention

**File:** `src/api/build.controller.ts`  
**Current State:** `Content-Disposition` header uses filename directly  
**Risk:** Header injection via malicious filenames  

#### Implementation

```typescript
// In downloadArtifact function, around line 175
const fileName = path.basename(filePath);
// Sanitize filename for Content-Disposition header
const safeFilename = fileName.replace(/[^\w.-]/g, '_').slice(0, 255);
res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
```

#### Tasks

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 1.2.1 | Add filename sanitization before header | Regex removes non-alphanumeric chars |
| 1.2.2 | Add length limit (255 chars) | Filenames truncated appropriately |
| 1.2.3 | Add test for malicious filenames | Test with `file\r\nX-Injected: header` fails safely |

#### Dependencies
- None

---

## 🟠 PHASE 2: Access Control Enhancements

**Priority:** HIGH  
**Timeline:** Week 2  
**Risk Level:** Medium  

### 2.1 Migrate from IP-based to API Key-only Ownership

**Files:** 
- `prisma/schema.prisma`
- `src/api/build.controller.ts`

**Current State:** `ownerKey` can be IP hash or API key hash  
**Risk:** IP addresses can be shared (NAT), spoofed, or change  

#### Implementation Steps

1. Update `getOwnerKey()` to require API key for ownership:

```typescript
// src/api/build.controller.ts
const getOwnerKey = (req: Request): string | null => {
  if (req.apiKey) {
    return req.apiKey; // Already hashed in auth middleware
  }
  // Return null for unauthenticated requests - they won't own builds
  return null;
};
```

2. Update build creation to handle null ownership:

```typescript
// In startBuild
const ownerKey = getOwnerKey(req);
if (!ownerKey) {
  // Anonymous builds - consider rejecting or using session token
  logger.warn('Build created without ownership - consider requiring auth');
}
```

#### Tasks

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 2.1.1 | Update `getOwnerKey()` to prefer API key only | IP fallback removed or deprecated |
| 2.1.2 | Add migration for existing builds | Legacy builds remain accessible |
| 2.1.3 | Update documentation | API key requirement documented |
| 2.1.4 | Add deprecation warning for IP-based access | Warning logged when IP used |

#### Dependencies
- API key system must be fully functional

---

### 2.2 Enhanced Build Ownership Verification

**File:** `src/api/build.controller.ts`

#### Tasks

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 2.2.1 | Add tenant-based ownership check | Builds scoped to tenant |
| 2.2.2 | Implement admin override capability | Admin API keys can access all builds |
| 2.2.3 | Add audit logging for ownership checks | Failed access attempts logged |

---

## 🟡 PHASE 3: Stability & Code Quality

**Priority:** MEDIUM  
**Timeline:** Weeks 3-4  
**Risk Level:** Low  

### 3.1 Code Quality Improvements

#### 3.1.1 Remove Double Masking in Executor

**File:** `src/executor/executor.ts`

```typescript
// Current (lines 16-28) - logs already masked command
// Remove redundant maskSensitiveData calls where logger already masks
```

#### 3.1.2 Combine Dockerfile RUN Layers

**File:** `src/builder/dockerfileGenerator.ts`

```typescript
// Instead of multiple echo commands:
// RUN echo "line1" >> file
// RUN echo "line2" >> file

// Combine into:
// RUN echo -e "line1\nline2" >> file
```

#### 3.1.3 Fix Step Numbering in Lifecycle

**File:** `src/executor/lifecycle.ts`

Review and fix inconsistent step numbering in comments (lines 130-141).

### 3.2 Package.json Cleanup

**File:** `package.json`

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 3.2.1 | Remove duplicate scripts | No duplicate dev scripts |
| 3.2.2 | Align Prisma versions | `@prisma/adapter-neon` matches `@prisma/client` |

---

## 📋 PHASE 4: Nitpicks & Cleanup

**Priority:** LOW  
**Timeline:** When convenient  

### 4.1 Test Script Updates

**Files:** 
- `quick-curl-test.sh`
- `test-build-lifecycle.sh`

Add authentication headers to test scripts:

```bash
# Add to test scripts
API_KEY="${API_KEY:-test-key}"
curl -H "Authorization: Bearer $API_KEY" ...
```

### 4.2 Documentation Updates

| # | Task | File |
|---|------|------|
| 4.2.1 | Document duplicate script purpose | `package.json` |
| 4.2.2 | Add inline comments for complex regex | `src/utils/sanitizer.ts` |

---

## 📋 PHASE 5: Testing & Quality Assurance

**Priority:** HIGH  
**Timeline:** Weeks 3-4  
**Target:** 70% coverage on security-critical paths  

### 5.1 Unit Test Coverage

#### Existing Tests (Enhance)

| File | Current | Target | Focus Areas |
|------|---------|--------|-------------|
| `sanitizer.test.ts` | Exists | 90% | Edge cases, injection attempts |
| `securityConfig.test.ts` | Exists | 90% | Invalid inputs, boundary conditions |
| `backupConfig.test.ts` | Exists | 90% | Malicious destinations |
| `apiKey.test.ts` | Exists | 90% | Expiration, revocation |

#### New Tests Required

| File | Priority | Coverage Target |
|------|----------|-----------------|
| `executor.test.ts` | HIGH | 80% |
| `lifecycle.test.ts` | HIGH | 70% |
| `isoGenerator.test.ts` | MEDIUM | 60% |
| `dockerfileGenerator.test.ts` | MEDIUM | 60% |
| `build.controller.test.ts` | HIGH | 80% |

### 5.2 Security-Focused Tests

```typescript
// Example: src/utils/sanitizer.test.ts additions
describe('escapeShellArg', () => {
  it('should escape command injection attempts', () => {
    expect(escapeShellArg('test; rm -rf /')).toBe("'test; rm -rf /'");
    expect(escapeShellArg('$(whoami)')).toBe("'$(whoami)'");
    expect(escapeShellArg('`id`')).toBe("'`id`'");
  });

  it('should handle nested quotes', () => {
    expect(escapeShellArg("test'quote")).toBe("'test'\\''quote'");
  });
});
```

### 5.3 Integration Tests

| Test Scenario | Components | Priority |
|---------------|------------|----------|
| Full build lifecycle | Controller → Lifecycle → Executor | HIGH |
| Auth flow with API keys | Auth middleware → Controller | HIGH |
| Rate limiting under load | Rate limit middleware | MEDIUM |
| WebSocket build updates | WS server → Lifecycle | MEDIUM |

### 5.4 Test Commands

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- src/utils/sanitizer.test.ts

# Watch mode during development
npm run test:watch
```

---

## 📚 PHASE 6: Documentation

**Priority:** MEDIUM  
**Timeline:** Weeks 5-6  

### 6.1 API Documentation

#### OpenAPI/Swagger Enhancement

**File:** `src/api/swagger.ts`

```typescript
// Enhance existing swagger config
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Linux Builder Engine API',
      version: '1.0.0',
      description: 'API for generating custom Linux OS builds',
    },
    servers: [
      { url: '/api', description: 'API server' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
        apiKeyHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    },
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  },
  apis: ['./src/api/*.ts'],
};
```

### 6.2 Security Documentation

Create `SECURITY.md`:

```markdown
# Security Policy

## Reporting Vulnerabilities
- Email: security@example.com
- Response time: 48 hours

## Security Controls
- API key authentication required
- Rate limiting: 10 builds/hour, 100 API calls/minute
- Input validation on all endpoints
- Shell command escaping for all user inputs

## API Key Management
- Keys prefixed with `lbk_`
- SHA-256 hashed storage
- Automatic expiration support
- Scope-based permissions
```

### 6.3 Deployment Guide

Create `docs/DEPLOYMENT.md`:

```markdown
# Deployment Guide

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| DATABASE_URL | Yes | - | Neon PostgreSQL connection |
| PORT | No | 3000 | Server port |
| HOST | No | 0.0.0.0 | Server host |
| API_KEYS | No | - | Comma-separated API keys |
| TRUST_PROXY | No | false | Enable trust proxy |
| OLLAMA_URL | No | http://127.0.0.1:11434 | Ollama API URL |
| OLLAMA_TIMEOUT | No | 30000 | Ollama request timeout (ms) |

## Docker Deployment

```bash
docker build -t linux-builder .
docker run -p 3000:3000 --env-file .env linux-builder
```

## Proxy Configuration

When behind nginx/traefik, set `TRUST_PROXY=true` or `NODE_ENV=production`.
```

---

## 🔍 PHASE 7: Monitoring & Observability

**Priority:** MEDIUM  
**Timeline:** Weeks 5-6  

### 7.1 Structured Logging Enhancement

**File:** `src/utils/logger.ts`

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-key"]', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
});

// Request ID middleware
export const requestIdMiddleware = (req, res, next) => {
  req.id = req.headers['x-request-id'] || generateId();
  res.setHeader('X-Request-ID', req.id);
  next();
};
```

### 7.2 Health Check Enhancement

**File:** `src/api/health.routes.ts`

```typescript
router.get('/health/detailed', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    docker: await checkDocker(),
    ollama: await checkOllama(),
    redis: await checkRedis(),
  };
  
  const healthy = Object.values(checks).every(c => c.status === 'ok');
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});
```

### 7.3 Metrics Export

**File:** `src/utils/metrics.ts` (enhance existing)

```typescript
// Add build-specific metrics
export const buildMetrics = {
  buildsTotal: new Counter({
    name: 'builds_total',
    help: 'Total number of builds',
    labelNames: ['status', 'distro'],
  }),
  buildDuration: new Histogram({
    name: 'build_duration_seconds',
    help: 'Build duration in seconds',
    labelNames: ['distro'],
    buckets: [60, 120, 300, 600, 1200, 1800],
  }),
};
```

---

## 🏗️ PHASE 8: Architecture Improvements

**Priority:** MEDIUM  
**Timeline:** Weeks 7-8  

### 8.1 Build Queue Enhancement

**Files:** `src/queue/buildQueue.ts`, `src/queue/buildWorker.ts`

Current implementation uses BullMQ. Enhancements needed:

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 8.1.1 | Add job prioritization | Premium tier jobs processed first |
| 8.1.2 | Implement per-user concurrency limits | Max 2 concurrent builds per user |
| 8.1.3 | Add exponential backoff retry | Failed jobs retry with backoff |
| 8.1.4 | Add dead letter queue | Failed jobs moved to DLQ after max retries |

### 8.2 API Key Management Endpoints

**File:** `src/api/apiKey.routes.ts` (new)

```typescript
// Admin-only endpoints
router.post('/admin/api-keys', adminAuth, createApiKey);
router.delete('/admin/api-keys/:id', adminAuth, revokeApiKey);
router.get('/admin/api-keys', adminAuth, listApiKeys);
router.post('/admin/api-keys/:id/rotate', adminAuth, rotateApiKey);
```

### 8.3 Artifact Storage Strategy

**File:** `src/utils/artifactStorage.ts` (enhance existing)

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 8.3.1 | Add S3 storage backend | Artifacts uploadable to S3 |
| 8.3.2 | Implement TTL-based cleanup | Artifacts deleted after configurable TTL |
| 8.3.3 | Add checksum verification | SHA-256 checksums stored and verified |

---

## 🔐 PHASE 9: Additional Security Hardening

**Priority:** MEDIUM  
**Timeline:** Weeks 9-10  

### 9.1 Docker Build Security

**File:** `src/utils/dockerSecurity.ts` (enhance existing)

```typescript
// Add resource limits to docker run commands
export const DOCKER_LIMITS = {
  memory: '2g',
  cpus: '2',
  pidsLimit: 100,
  networkMode: 'none', // Disable network during build
};

export function getDockerRunArgs(buildId: string): string[] {
  return [
    '--rm',
    `--memory=${DOCKER_LIMITS.memory}`,
    `--cpus=${DOCKER_LIMITS.cpus}`,
    `--pids-limit=${DOCKER_LIMITS.pidsLimit}`,
    `--network=${DOCKER_LIMITS.networkMode}`,
    '--security-opt=no-new-privileges',
  ];
}
```

### 9.2 Network Security Headers

**File:** `src/index.ts`

```typescript
// Add additional security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
```

### 9.3 Request Signing for Webhooks

**File:** `src/utils/webhooks.ts` (enhance existing)

Verify HMAC signatures on incoming webhooks and sign outgoing webhook payloads.

---

## ⚡ PHASE 10: Performance Optimizations

**Priority:** LOW  
**Timeline:** Weeks 9-10  

### 10.1 Database Optimizations

**File:** `prisma/schema.prisma`

Indexes already exist. Additional optimizations:

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 10.1.1 | Add composite index for common queries | Query performance improved |
| 10.1.2 | Implement connection pooling | Pool size configurable |
| 10.1.3 | Add query result caching | Redis cache for frequent queries |

### 10.2 Docker Layer Caching

```typescript
// Pre-pull common base images on startup
const BASE_IMAGES = ['archlinux:latest', 'debian:bookworm', 'ubuntu:24.04', 'alpine:latest', 'fedora:latest'];

async function prePullImages() {
  for (const image of BASE_IMAGES) {
    await executeCommand(`docker pull ${image}`, 'system').catch(() => {});
  }
}
```

---

## 🔄 PHASE 11: CI/CD & DevOps

**Priority:** MEDIUM  
**Timeline:** Weeks 11-12  

### 11.1 GitHub Actions Workflow

**File:** `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v4

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
```

### 11.2 Pre-commit Hooks

**File:** `.husky/pre-commit`

```bash
#!/bin/sh
npm run lint
npm run test -- --run
```

### 11.3 Dependabot Configuration

**File:** `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

---

## 📊 PHASE 12: Future Features - Core

**Priority:** LOW  
**Timeline:** Month 4+  

### 12.1 Multi-tenancy Enhancements

- Organization/team support
- Role-based access control (RBAC)
- Resource quotas per tenant
- Usage tracking and billing

### 12.2 AI Enhancements

- Conversational build spec refinement
- Build spec validation with AI suggestions
- Automatic error fix generation
- Intelligent package recommendations

---

## 🎨 PHASE 13: Build Customization & Templates

**Priority:** MEDIUM  
**Timeline:** Month 4-5  

### 13.1 Build Template Marketplace

| # | Feature | Description | Priority |
|---|---------|-------------|----------|
| 13.1.1 | Community template library | Users share/discover pre-configured build specs | HIGH |
| 13.1.2 | Template versioning | Fork and iterate on existing templates | HIGH |
| 13.1.3 | Ratings & reviews | Surface quality templates | MEDIUM |
| 13.1.4 | One-click deploy | Deploy from template gallery | HIGH |

#### Database Schema Addition

```prisma
model BuildTemplate {
  id          String   @id @default(cuid())
  name        String
  description String?
  spec        Json
  version     String   @default("1.0.0")
  authorId    String
  parentId    String?  // For forked templates
  downloads   Int      @default(0)
  rating      Float?
  tags        String[]
  isPublic    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([authorId])
  @@index([isPublic, rating])
}

model TemplateReview {
  id         String   @id @default(cuid())
  templateId String
  userId     String
  rating     Int      // 1-5
  comment    String?
  createdAt  DateTime @default(now())
  
  @@unique([templateId, userId])
}
```

### 13.2 Build Presets & Profiles

| Preset Type | Use Case | Default Packages |
|-------------|----------|------------------|
| Developer Workstation | Daily dev work | git, docker, nodejs, python, vscode |
| Production Server | Minimal server | nginx, fail2ban, logrotate |
| Edge Device | IoT/embedded | busybox, dropbear, minimal kernel |
| Gaming Rig | Gaming desktop | steam, wine, vulkan-tools, gamemode |
| Pentesting Box | Security testing | nmap, metasploit, burpsuite, wireshark |

#### Implementation

```typescript
// src/templates/presets.ts
export const BUILD_PRESETS: Record<string, Partial<BuildSpec>> = {
  'developer-workstation': {
    base: 'arch',
    packages: ['git', 'docker', 'nodejs', 'python', 'code'],
    desktop: { environment: 'gnome', displayManager: 'gdm' },
  },
  'production-server': {
    base: 'debian',
    packages: ['nginx', 'fail2ban', 'logrotate', 'unattended-upgrades'],
    securityFeatures: { firewall: { enabled: true, policy: 'deny' } },
  },
  // ... more presets
};
```

### 13.3 Advanced Customization

| # | Feature | Implementation |
|---|---------|----------------|
| 13.3.1 | Custom package repos | Add `customRepos[]` to BuildSpec |
| 13.3.2 | Build hooks | Pre/post build script execution |
| 13.3.3 | Custom builder images | User-provided Docker base |
| 13.3.4 | Build overlays | Layer multiple configurations |

#### Build Hooks Schema

```typescript
// Add to BuildSpec
interface BuildHooks {
  preBuild?: string[];   // Commands before build starts
  postBuild?: string[];  // Commands after build completes
  prePackage?: string[]; // Before packaging artifacts
  postPackage?: string[];// After packaging
}
```

---

## 🤝 PHASE 14: Collaboration & Team Features

**Priority:** MEDIUM  
**Timeline:** Month 5-6  

### 14.1 Team Workspaces

| # | Feature | Acceptance Criteria |
|---|---------|---------------------|
| 14.1.1 | Shared build libraries | Builds visible to team members |
| 14.1.2 | Team roles | Admin, Builder, Viewer permissions |
| 14.1.3 | Approval workflows | Require review for production builds |
| 14.1.4 | Audit logs | Track all team actions |

#### Database Schema

```prisma
model Team {
  id        String       @id @default(cuid())
  name      String
  slug      String       @unique
  createdAt DateTime     @default(now())
  members   TeamMember[]
  builds    UserBuild[]
}

model TeamMember {
  id     String @id @default(cuid())
  teamId String
  userId String
  role   String @default("viewer") // admin, builder, viewer
  team   Team   @relation(fields: [teamId], references: [id])
  
  @@unique([teamId, userId])
}

model BuildApproval {
  id        String   @id @default(cuid())
  buildId   String
  status    String   @default("pending") // pending, approved, rejected
  reviewerId String?
  comment   String?
  createdAt DateTime @default(now())
}
```

### 14.2 Build Versioning & History

| # | Feature | Description |
|---|---------|-------------|
| 14.2.1 | Version control | Git-like versioning for specs |
| 14.2.2 | Diff viewer | Compare spec versions |
| 14.2.3 | Rollback | Revert to previous working specs |
| 14.2.4 | Branching | Branch and merge configurations |

### 14.3 Collaborative Editing

- Real-time collaborative spec editing (WebSocket-based)
- Comments and annotations on build specs
- Change suggestions with review workflow
- @mention notifications

---

## 🔗 PHASE 15: Integrations & Automation

**Priority:** HIGH  
**Timeline:** Month 5-6  

### 15.1 CI/CD Platform Integrations

| Platform | Integration Type | Priority |
|----------|------------------|----------|
| GitHub Actions | Native action | HIGH |
| GitLab CI | Pipeline component | HIGH |
| Jenkins | Plugin | MEDIUM |
| CircleCI | Orb | LOW |

#### GitHub Action Example

```yaml
# .github/actions/linux-builder/action.yml
name: 'Linux Builder'
description: 'Build custom Linux images'
inputs:
  api-key:
    required: true
  spec-file:
    required: false
    default: 'build-spec.json'
runs:
  using: 'node20'
  main: 'dist/index.js'
```

### 15.2 Infrastructure as Code

| Tool | Implementation | Priority |
|------|----------------|----------|
| Terraform | Provider plugin | HIGH |
| Pulumi | SDK package | MEDIUM |
| Ansible | Playbook collection | MEDIUM |
| Kubernetes | CRD + Operator | LOW |

#### Terraform Provider Example

```hcl
resource "linuxbuilder_build" "webserver" {
  base = "debian"
  packages = ["nginx", "certbot"]
  
  security_features {
    firewall_enabled = true
  }
}
```

### 15.3 Notification Channels

| Channel | Events | Priority |
|---------|--------|----------|
| Slack | Build status, failures | HIGH |
| Discord | Build status | MEDIUM |
| Email | All events, customizable | HIGH |
| SMS | Critical failures only | LOW |
| PagerDuty | On-call alerts | MEDIUM |

#### Webhook Payload Schema

```typescript
interface WebhookPayload {
  event: 'build.started' | 'build.completed' | 'build.failed';
  buildId: string;
  timestamp: string;
  data: {
    status: string;
    duration?: number;
    artifactUrl?: string;
    error?: string;
  };
}
```

---

## 📊 PHASE 16: Analytics & Insights

**Priority:** MEDIUM  
**Timeline:** Month 6-7  

### 16.1 Build Analytics Dashboard

| Metric | Visualization | Update Frequency |
|--------|---------------|------------------|
| Success/failure trends | Line chart | Real-time |
| Build duration by distro | Bar chart | Hourly |
| Resource usage | Area chart | Per-build |
| Popular packages | Pie chart | Daily |
| Cost analysis | Table + chart | Daily |

#### Metrics Collection

```typescript
// src/analytics/collector.ts
interface BuildMetrics {
  buildId: string;
  distro: string;
  duration: number;
  cpuSeconds: number;
  memoryPeakMb: number;
  diskUsageMb: number;
  packageCount: number;
  cacheHitRate: number;
  status: 'success' | 'failed';
}
```

### 16.2 Performance Insights

| Insight | Detection Method | Action |
|---------|------------------|--------|
| Slow package downloads | Duration > 2x average | Suggest mirror |
| Long compile times | CPU time analysis | Suggest prebuilt |
| Low cache hit rate | Cache metrics | Optimize layers |
| Build vs community avg | Comparative analysis | Recommendations |

### 16.3 Security Insights

| Feature | Implementation | Priority |
|---------|----------------|----------|
| CVE scanning | Trivy integration | HIGH |
| Outdated packages | Version comparison | HIGH |
| CIS benchmarks | Compliance checks | MEDIUM |
| License compliance | License scanner | MEDIUM |

---

## 🔐 PHASE 17: Advanced Security & Compliance

**Priority:** HIGH  
**Timeline:** Month 6-7  

### 17.1 Security Scanning

| Feature | Tool | Output |
|---------|------|--------|
| Vulnerability scan | Trivy | CVE report |
| SBOM generation | Syft | SPDX/CycloneDX |
| Image signing | Cosign | Signature |
| SLSA attestation | in-toto | Provenance |

#### SBOM Generation

```typescript
// src/security/sbom.ts
export async function generateSBOM(buildId: string, artifactPath: string): Promise<SBOM> {
  const result = await executeCommand(
    `syft ${artifactPath} -o spdx-json`,
    buildId
  );
  return JSON.parse(result);
}
```

### 17.2 Compliance Profiles

| Profile | Standards | Auto-checks |
|---------|-----------|-------------|
| HIPAA | Healthcare data | Encryption, audit logs |
| PCI-DSS | Payment card | Network segmentation, access control |
| SOC2 | Service org | Security controls |
| FedRAMP | Government | NIST 800-53 |

### 17.3 Secrets Management

| Integration | Use Case | Priority |
|-------------|----------|----------|
| Built-in vault | Simple secrets | HIGH |
| HashiCorp Vault | Enterprise | MEDIUM |
| AWS Secrets Manager | AWS deployments | MEDIUM |
| Azure Key Vault | Azure deployments | LOW |

---

## 🚀 PHASE 18: Build Optimization & Performance

**Priority:** MEDIUM  
**Timeline:** Month 7-8  

### 18.1 Intelligent Caching

| Cache Layer | Scope | TTL |
|-------------|-------|-----|
| Base images | Global | 24h |
| Package cache | Per-distro | 1h |
| Build artifacts | Per-user | 7d |
| Compiled objects | Per-spec-hash | 30d |

#### Cache Strategy

```typescript
// src/cache/strategy.ts
interface CacheConfig {
  layers: {
    baseImages: { enabled: true, ttl: 86400 };
    packages: { enabled: true, ttl: 3600 };
    artifacts: { enabled: true, ttl: 604800 };
  };
  distributed: boolean;
  warmingEnabled: boolean;
}
```

### 18.2 Parallel & Distributed Builds

| Feature | Implementation | Benefit |
|---------|----------------|---------|
| Multi-stage parallel | Concurrent package install | 2-3x faster |
| Distributed nodes | Kubernetes workers | Horizontal scale |
| Priority queues | BullMQ priorities | SLA compliance |
| Resource optimization | Auto-scaling | Cost efficiency |

### 18.3 Incremental Builds

- Smart rebuild detection (hash-based layer comparison)
- Partial artifact reuse from previous builds
- Delta updates for large artifacts

---

## 🧪 PHASE 19: Developer Experience

**Priority:** HIGH  
**Timeline:** Month 7-8  

### 19.1 CLI Tool & SDKs

| Component | Language | Priority |
|-----------|----------|----------|
| CLI | Go/Rust | HIGH |
| Python SDK | Python | HIGH |
| JavaScript SDK | TypeScript | HIGH |
| Go SDK | Go | MEDIUM |
| VS Code Extension | TypeScript | MEDIUM |

#### CLI Commands

```bash
# CLI usage examples
lbuild init                    # Initialize new spec
lbuild validate spec.json      # Validate spec
lbuild start spec.json         # Start build
lbuild status <build-id>       # Check status
lbuild logs <build-id> -f      # Stream logs
lbuild download <build-id>     # Download artifact
lbuild templates list          # List templates
lbuild presets apply developer # Apply preset
```

### 19.2 Local Development Tools

| Tool | Purpose | Priority |
|------|---------|----------|
| Local simulation | Test before cloud build | HIGH |
| Dev container | VS Code integration | MEDIUM |
| Hot reload | Spec change detection | LOW |
| Artifact preview | Local inspection | MEDIUM |

### 19.3 Interactive Build Console

- Real-time log streaming with filtering
- Interactive troubleshooting (pause, inspect, resume)
- Shell access to failed builds
- Log search and analysis

---

## 🌍 PHASE 20: Community & Ecosystem

**Priority:** LOW  
**Timeline:** Month 8-9  

### 20.1 Community Hub

| Feature | Description |
|---------|-------------|
| Build showcase | Featured community builds |
| Discussion forums | Build help and tips |
| Tutorial library | Guides and walkthroughs |
| Monthly challenges | Prizes for best builds |

### 20.2 Plugin Ecosystem

| Component | Description |
|-----------|-------------|
| Plugin marketplace | Custom build steps |
| Open API | Third-party integrations |
| Sandboxing | Security isolation |
| Revenue sharing | Paid plugin support |

### 20.3 Certification Program

- Build certification (tested, verified, recommended)
- Builder badges (expert, contributor, maintainer)
- Sponsorship for popular templates

---

## 💰 PHASE 21: Business & Enterprise Features

**Priority:** MEDIUM  
**Timeline:** Month 9-10  

### 21.1 Cost Management

| Feature | Implementation |
|---------|----------------|
| Cost tracking | Per user/team/project |
| Budget alerts | Threshold notifications |
| Resource quotas | Tier-based limits |
| Billing reports | Detailed breakdowns |

### 21.2 Enterprise Features

| Feature | Description | Priority |
|---------|-------------|----------|
| SSO | SAML, OAuth, LDAP | HIGH |
| Advanced RBAC | Custom roles | HIGH |
| Private runners | On-prem/VPC | MEDIUM |
| SLA guarantees | Priority support | MEDIUM |
| Dedicated accounts | Enterprise support | LOW |

### 21.3 White-label Options

- Custom branding for enterprises
- Private instance deployment
- Custom domain support
- Reseller program

---

## 🔧 PHASE 22: Maintenance & Operations

**Priority:** MEDIUM  
**Timeline:** Month 10+  

### 22.1 Automated Maintenance

| Task | Frequency | Automation |
|------|-----------|------------|
| Package updates | Weekly | Dependabot-style |
| Vulnerability patching | On detection | Auto-PR |
| Stale build cleanup | Daily | Cron job |
| Health checks | Continuous | Monitoring |

### 22.2 Disaster Recovery

| Component | Strategy | RPO/RTO |
|-----------|----------|---------|
| Database | Multi-region replication | RPO: 1min, RTO: 5min |
| Artifacts | S3 cross-region | RPO: 1hr, RTO: 15min |
| Specs | Git backup | RPO: 0, RTO: 5min |
| Configs | IaC versioned | RPO: 0, RTO: 10min |

---

## 📅 Implementation Timeline

### Phase 1: Foundation (Months 1-3)

| Week | Phase | Focus | Deliverables |
|------|-------|-------|--------------|
| 1 | Phase 1 | Critical Security | execFile refactor, header injection fix |
| 2 | Phase 2 | Access Control | API key-only ownership, tenant scoping |
| 3-4 | Phase 3 + 5 | Stability + Testing | Code cleanup, 70% test coverage |
| 5-6 | Phase 6 + 7 | Docs + Monitoring | OpenAPI docs, structured logging |
| 7-8 | Phase 8 | Architecture | Queue enhancements, API key management |
| 9-10 | Phase 9 + 10 | Security + Performance | Docker hardening, caching |
| 11-12 | Phase 11 | CI/CD | GitHub Actions, pre-commit hooks |

### Phase 2: Growth (Months 4-6)

| Month | Phase | Focus | Deliverables |
|-------|-------|-------|--------------|
| 4 | Phase 12 | Core Future | Multi-tenancy, AI enhancements |
| 4-5 | Phase 13 | Templates | Template marketplace, presets, build hooks |
| 5-6 | Phase 14 | Collaboration | Team workspaces, versioning, approvals |
| 5-6 | Phase 15 | Integrations | GitHub Actions, Terraform, Slack |
| 6-7 | Phase 16 | Analytics | Dashboard, performance insights |
| 6-7 | Phase 17 | Compliance | SBOM, CVE scanning, compliance profiles |

### Phase 3: Scale (Months 7-10)

| Month | Phase | Focus | Deliverables |
|-------|-------|-------|--------------|
| 7-8 | Phase 18 | Optimization | Intelligent caching, parallel builds |
| 7-8 | Phase 19 | Developer Experience | CLI, SDKs, VS Code extension |
| 8-9 | Phase 20 | Community | Hub, plugin ecosystem, certifications |
| 9-10 | Phase 21 | Enterprise | SSO, RBAC, white-label |
| 10+ | Phase 22 | Operations | Auto-maintenance, disaster recovery |

---

## 🎯 Success Criteria

### Foundation Phase (Months 1-3)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Security vulnerabilities | 0 high/critical | Security scan results |
| Test coverage (security paths) | >70% | Coverage report |
| API response time (p95) | <500ms | Metrics dashboard |
| Build service uptime | >99.9% | Monitoring alerts |
| Documentation completeness | 100% endpoints | OpenAPI spec |
| CI/CD pipeline | Fully automated | GitHub Actions status |

### Growth Phase (Months 4-6)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Template library | 50+ community templates | Template count |
| Integration coverage | 5+ CI/CD platforms | Integration tests |
| Team adoption | 10+ active teams | User metrics |
| Build analytics | Real-time dashboard | Feature completion |
| Compliance profiles | 3+ standards | Audit reports |

### Scale Phase (Months 7-10)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Build speed improvement | 2x faster avg | Duration metrics |
| Cache hit rate | >80% | Cache analytics |
| CLI downloads | 1000+ | Package registry |
| Plugin ecosystem | 20+ plugins | Marketplace count |
| Enterprise customers | 5+ | Sales metrics |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking changes during refactor | Medium | High | Comprehensive test coverage first |
| Performance regression | Low | Medium | Benchmark before/after changes |
| API key migration issues | Medium | Medium | Gradual rollout with fallback |
| Docker security limits too restrictive | Medium | Low | Configurable limits per build type |
| Template marketplace abuse | Medium | Medium | Review process, rate limiting |
| Plugin security vulnerabilities | High | High | Sandboxing, code review |
| Scaling bottlenecks | Medium | High | Load testing, horizontal scaling |
| Compliance certification delays | Medium | Medium | Early engagement with auditors |

---

## Appendix A: File Change Summary

### Foundation Phase (Phases 1-11)

| File | Phase | Changes |
|------|-------|---------|
| `src/executor/executor.ts` | 1 | Add `execFile` variant |
| `src/api/build.controller.ts` | 1, 2 | Header sanitization, ownership changes |
| `src/utils/sanitizer.ts` | 5 | Additional test coverage |
| `src/api/swagger.ts` | 6 | Enhanced OpenAPI spec |
| `src/utils/logger.ts` | 7 | Request ID, structured logging |
| `src/api/health.routes.ts` | 7 | Detailed health checks |
| `src/queue/buildQueue.ts` | 8 | Priority, concurrency limits |
| `src/utils/dockerSecurity.ts` | 9 | Resource limits |
| `.github/workflows/ci.yml` | 11 | CI pipeline |

### Growth Phase (Phases 12-17)

| File | Phase | Changes |
|------|-------|---------|
| `prisma/schema.prisma` | 13, 14 | Templates, teams, approvals |
| `src/templates/presets.ts` | 13 | Build presets |
| `src/templates/marketplace.ts` | 13 | Template CRUD |
| `src/api/team.routes.ts` | 14 | Team management |
| `src/api/team.controller.ts` | 14 | Team logic |
| `src/integrations/github.ts` | 15 | GitHub Actions |
| `src/integrations/slack.ts` | 15 | Slack webhooks |
| `src/analytics/collector.ts` | 16 | Metrics collection |
| `src/analytics/dashboard.ts` | 16 | Dashboard API |
| `src/security/sbom.ts` | 17 | SBOM generation |
| `src/security/compliance.ts` | 17 | Compliance checks |

### Scale Phase (Phases 18-22)

| File | Phase | Changes |
|------|-------|---------|
| `src/cache/strategy.ts` | 18 | Multi-layer caching |
| `src/cache/distributed.ts` | 18 | Redis distributed cache |
| `src/build/parallel.ts` | 18 | Parallel build orchestration |
| `cli/` | 19 | CLI tool (separate repo) |
| `sdk/` | 19 | SDK packages (separate repos) |
| `src/plugins/loader.ts` | 20 | Plugin system |
| `src/plugins/sandbox.ts` | 20 | Plugin isolation |
| `src/enterprise/sso.ts` | 21 | SSO integration |
| `src/enterprise/rbac.ts` | 21 | Advanced RBAC |
| `src/ops/maintenance.ts` | 22 | Auto-maintenance |
| `src/ops/backup.ts` | 22 | Disaster recovery |

---

## Appendix B: Commands Reference

```bash
# Development
npm run dev              # Start dev server
npm run lint             # Type check
npm run test             # Run tests
npm run test:coverage    # Coverage report

# Database
npx prisma migrate dev   # Run migrations
npx prisma generate      # Generate client
npx prisma studio        # Database GUI

# Docker
docker build -t linux-builder .
docker run -p 3000:3000 linux-builder

# CLI (Future - Phase 19)
lbuild init              # Initialize new spec
lbuild validate spec.json
lbuild start spec.json
lbuild status <build-id>
lbuild logs <build-id> -f
lbuild download <build-id>
lbuild templates list
lbuild presets apply developer
```

---

## Appendix C: Feature Dependency Graph

```
Phase 1 (Security) ─────────────────────────────────────────────────────────┐
    │                                                                        │
Phase 2 (Access Control) ───────────────────────────────────────────────────┤
    │                                                                        │
Phase 3-5 (Stability + Testing) ────────────────────────────────────────────┤
    │                                                                        │
Phase 6-7 (Docs + Monitoring) ──────────────────────────────────────────────┤
    │                                                                        │
Phase 8 (Architecture) ─────────────────────────────────────────────────────┤
    │                                                                        │
Phase 9-11 (Security + CI/CD) ──────────────────────────────────────────────┤
    │                                                                        │
    └──────────────────────────────────────────────────────────────────────┐│
                                                                           ││
Phase 12 (Core Future) ◄───────────────────────────────────────────────────┘│
    │                                                                        │
    ├── Phase 13 (Templates) ◄── Phase 20 (Community)                       │
    │       │                                                                │
    │       └── Phase 14 (Collaboration) ◄── Phase 21 (Enterprise)          │
    │               │                                                        │
    │               └── Phase 15 (Integrations)                              │
    │                       │                                                │
    │                       └── Phase 16 (Analytics)                         │
    │                               │                                        │
    │                               └── Phase 17 (Compliance)                │
    │                                                                        │
    └── Phase 18 (Optimization) ◄── Phase 19 (DevEx) ◄── Phase 22 (Ops) ◄──┘
```

---

## Appendix D: API Endpoint Roadmap

### Current Endpoints (Phases 1-11)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/build` | Start new build |
| POST | `/api/build/start` | Start new build (alias) |
| POST | `/api/build/generate` | Generate spec from prompt |
| GET | `/api/build/status/:id` | Get build status |
| GET | `/api/build/artifact/:id` | Get artifact info |
| GET | `/api/build/download/:id/:type` | Download artifact |
| GET | `/api/health` | Health check |

### Phase 13-14 Endpoints (Templates & Teams)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/templates` | List templates |
| POST | `/api/templates` | Create template |
| GET | `/api/templates/:id` | Get template |
| PUT | `/api/templates/:id` | Update template |
| DELETE | `/api/templates/:id` | Delete template |
| POST | `/api/templates/:id/fork` | Fork template |
| POST | `/api/templates/:id/review` | Add review |
| GET | `/api/presets` | List presets |
| POST | `/api/presets/:name/apply` | Apply preset |
| GET | `/api/teams` | List teams |
| POST | `/api/teams` | Create team |
| GET | `/api/teams/:id/builds` | Team builds |
| POST | `/api/teams/:id/members` | Add member |
| POST | `/api/builds/:id/approve` | Approve build |

### Phase 15-17 Endpoints (Integrations & Analytics)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks` | Register webhook |
| GET | `/api/analytics/builds` | Build analytics |
| GET | `/api/analytics/performance` | Performance metrics |
| GET | `/api/security/scan/:buildId` | Security scan results |
| GET | `/api/security/sbom/:buildId` | Get SBOM |
| GET | `/api/compliance/:buildId` | Compliance report |

### Phase 21 Endpoints (Enterprise)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List users |
| POST | `/api/admin/roles` | Create role |
| GET | `/api/billing/usage` | Usage report |
| GET | `/api/billing/costs` | Cost breakdown |

---

*Document maintained by the development team. Last updated: 2025-12-10*
