# Linux Builder Engine - Enhancement Implementation Plan

**Created:** 2025-12-10  
**Status:** Planning  
**Total Estimated Duration:** 16-20 weeks  
**Priority:** Foundation → Security → Scalability → Operations → Features

---

## Executive Summary

This plan transforms the Linux Builder Engine from a functional prototype into a production-ready, scalable platform. Implementation follows a dependency-driven approach where each phase enables the next.

### Critical Path
```
Testing → CI/CD → Logging → API Keys → Queue System → Multi-tenancy
                     ↓
              Monitoring → Performance → Features
```

### Effort Estimation Key
| Size | Duration | Examples |
|------|----------|----------|
| XS | < 4 hours | Add single endpoint, config change |
| S | 4-8 hours | New utility module, simple integration |
| M | 2-3 days | New middleware system, API redesign |
| L | 1 week | Major subsystem (queue, auth) |
| XL | 2+ weeks | Architecture overhaul |

---

## Phase 1: Foundation (Weeks 1-3)

**Goal:** Enable safe, rapid iteration with confidence  
**Risk Level:** Low  
**Business Value:** High - Prevents regressions, enables all future work

### 1.1 Comprehensive Test Suite

#### 1.1.1 Unit Tests for Security Utilities
**Effort:** M (2-3 days)  
**Priority:** P0 - Critical  
**Files to test:**
- `src/utils/sanitizer.ts` - All validation/escape functions
- `src/utils/securityConfig.ts` - Firewall, AppArmor, SSH config generation
- `src/utils/backupConfig.ts` - Backup destination validation

**Test Cases:**
```typescript
// sanitizer.ts tests
describe('escapeShellArg', () => {
  it('escapes single quotes');
  it('handles empty strings');
  it('handles unicode characters');
  it('prevents command injection: $(whoami)');
  it('prevents command injection: `id`');
  it('prevents command injection: ; rm -rf /');
});

describe('validateBuildId', () => {
  it('accepts valid cuid2 format');
  it('rejects SQL injection attempts');
  it('rejects path traversal attempts');
  it('rejects empty/null values');
});

describe('validateGitUrl', () => {
  it('accepts github.com HTTPS URLs');
  it('rejects SSH URLs');
  it('rejects non-allowlisted hosts');
  it('rejects URLs with shell metacharacters');
});
```

**Success Criteria:**
- 100% coverage on sanitizer.ts
- All injection vectors tested
- Tests run in < 5 seconds

#### 1.1.2 Integration Tests for Build Lifecycle
**Effort:** L (1 week)  
**Priority:** P0 - Critical  
**Dependencies:** Unit tests complete

**Test Scenarios:**
```typescript
describe('Build Lifecycle', () => {
  describe('Happy Path', () => {
    it('creates build record in database');
    it('generates valid Dockerfile');
    it('executes Docker build');
    it('exports artifact');
    it('updates status to SUCCESS');
    it('broadcasts WebSocket completion');
  });

  describe('Error Handling', () => {
    it('handles invalid build spec gracefully');
    it('handles Docker build failure');
    it('handles cancellation mid-build');
    it('updates status to FAILED on error');
    it('cleans up temp files on failure');
  });

  describe('Security', () => {
    it('validates base distro against allowlist');
    it('sanitizes all shell arguments');
    it('prevents path traversal in artifacts');
  });
});
```

**Infrastructure Needed:**
- Docker-in-Docker test environment
- Test database (SQLite or test PostgreSQL)
- Mock Ollama server

#### 1.1.3 API Endpoint Tests
**Effort:** M (2-3 days)  
**Priority:** P1 - High

**Coverage:**
| Endpoint | Auth | Rate Limit | Validation | Error Cases |
|----------|------|------------|------------|-------------|
| POST /api/build/start | ✓ | ✓ | ✓ | ✓ |
| POST /api/build/generate | ✓ | ✓ | ✓ | ✓ |
| GET /api/build/status/:id | ✓ | ✓ | ✓ | ✓ |
| GET /api/build/artifact/:id | ✓ | ✓ | ✓ | ✓ |
| GET /api/build/download/:id/:type | ✓ | ✓ | ✓ | ✓ |

**Test Framework Setup:**
```typescript
// test/setup.ts
import { beforeAll, afterAll } from 'vitest';
import { createTestApp } from './helpers/app';
import { seedTestDatabase } from './helpers/db';

beforeAll(async () => {
  await seedTestDatabase();
});

afterAll(async () => {
  await cleanupTestDatabase();
});
```

### 1.2 CI/CD Pipeline

#### 1.2.1 GitHub Actions Workflow
**Effort:** S (1 day)  
**Priority:** P0 - Critical  
**Dependencies:** Test suite exists

**Workflow Structure:**
```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
        env:
          DATABASE_URL: "file:./test.db"
      - uses: codecov/codecov-action@v3

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=high
      - uses: aquasecurity/trivy-action@master

  build:
    needs: [lint, test, security]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
```

#### 1.2.2 Pre-commit Hooks
**Effort:** XS (2 hours)  
**Priority:** P1 - High

**Setup:**
```json
// package.json additions
{
  "scripts": {
    "prepare": "husky install"
  },
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"],
    "*.json": ["prettier --write"]
  }
}
```

```bash
# .husky/pre-commit
#!/bin/sh
npx lint-staged
npx tsc --noEmit
```

### 1.3 Structured Logging

#### 1.3.1 Logging Infrastructure
**Effort:** M (2 days)  
**Priority:** P1 - High

**Implementation:**
```typescript
// src/utils/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'linux-builder',
    version: process.env.npm_package_version,
  },
});

export const createRequestLogger = (requestId: string, buildId?: string) => {
  return logger.child({ requestId, buildId });
};

// Usage in middleware
export const requestIdMiddleware = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || generateId();
  req.log = createRequestLogger(req.requestId);
  next();
};
```

**Log Events to Capture:**
| Event | Level | Fields |
|-------|-------|--------|
| Request received | info | method, path, ip, requestId |
| Auth success/failure | info/warn | apiKey (masked), ip |
| Rate limit hit | warn | ip, endpoint, limit |
| Build started | info | buildId, distro, packages |
| Build step complete | info | buildId, step, duration |
| Build failed | error | buildId, error, stack |
| Security event | warn | type, ip, details |

### 1.4 API Documentation

#### 1.4.1 OpenAPI Specification
**Effort:** M (2 days)  
**Priority:** P1 - High

**Approach:** Use `swagger-jsdoc` to generate from route comments

```typescript
// src/api/build.routes.ts
/**
 * @openapi
 * /api/build/start:
 *   post:
 *     summary: Start a new Linux build
 *     tags: [Builds]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BuildSpec'
 *     responses:
 *       202:
 *         description: Build started
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BuildResponse'
 *       400:
 *         description: Invalid build specification
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/build/start', buildRateLimit, authMiddleware, startBuild);
```

---

## Phase 1 Deliverables Checklist

- [ ] Unit tests for sanitizer.ts (100% coverage)
- [ ] Unit tests for securityConfig.ts
- [ ] Unit tests for backupConfig.ts
- [ ] Integration tests for build lifecycle
- [ ] API endpoint tests
- [ ] GitHub Actions CI workflow
- [ ] Pre-commit hooks (Husky + lint-staged)
- [ ] Structured logging with pino
- [ ] Request ID tracking
- [ ] OpenAPI documentation
- [ ] Swagger UI endpoint

**Phase 1 Success Metrics:**
- All tests passing
- 70%+ code coverage on security-critical paths
- CI pipeline runs in < 5 minutes
- Zero high/critical npm audit findings


---

## Phase 2: Security & API Management (Weeks 4-6)

**Goal:** Production-ready security posture with proper API key management  
**Risk Level:** Medium (breaking changes to auth)  
**Business Value:** Very High - Enables monetization, proper access control

### 2.1 API Key Management System

#### 2.1.1 Database Schema Updates
**Effort:** S (4 hours)  
**Priority:** P0 - Critical

```prisma
// prisma/schema.prisma additions

model ApiKey {
  id          String    @id @default(cuid())
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  // Key storage (hashed)
  keyHash     String    @unique
  keyPrefix   String    // First 8 chars for identification (e.g., "lb_live_")
  
  // Ownership
  name        String    // User-provided name
  ownerId     String?   // Future: link to User model
  
  // Permissions
  scopes      String[]  @default(["build:create", "build:read"])
  
  // Limits
  rateLimit   Int       @default(100)  // requests per minute
  buildQuota  Int?      // monthly build limit (null = unlimited)
  
  // Status
  isActive    Boolean   @default(true)
  expiresAt   DateTime?
  lastUsedAt  DateTime?
  
  // Usage tracking
  totalBuilds Int       @default(0)
  
  builds      UserBuild[]
}

model UserBuild {
  // ... existing fields ...
  
  // Replace ownerKey with proper relation
  apiKeyId    String?
  apiKey      ApiKey?   @relation(fields: [apiKeyId], references: [id])
}
```

#### 2.1.2 Key Generation Service
**Effort:** M (2 days)  
**Priority:** P0 - Critical

```typescript
// src/services/apiKeyService.ts
import crypto from 'crypto';
import prisma from '../db/db';

const KEY_PREFIX = 'lb_live_';
const KEY_LENGTH = 32;

export interface CreateKeyOptions {
  name: string;
  scopes?: string[];
  rateLimit?: number;
  buildQuota?: number;
  expiresAt?: Date;
}

export const generateApiKey = async (options: CreateKeyOptions) => {
  // Generate cryptographically secure key
  const rawKey = crypto.randomBytes(KEY_LENGTH).toString('base64url');
  const fullKey = `${KEY_PREFIX}${rawKey}`;
  
  // Hash for storage
  const keyHash = crypto
    .createHash('sha256')
    .update(fullKey)
    .digest('hex');
  
  const apiKey = await prisma.apiKey.create({
    data: {
      keyHash,
      keyPrefix: fullKey.slice(0, 12),
      name: options.name,
      scopes: options.scopes || ['build:create', 'build:read'],
      rateLimit: options.rateLimit || 100,
      buildQuota: options.buildQuota,
      expiresAt: options.expiresAt,
    },
  });
  
  // Return full key only once - never stored
  return {
    id: apiKey.id,
    key: fullKey,  // Only time this is available
    prefix: apiKey.keyPrefix,
    name: apiKey.name,
    scopes: apiKey.scopes,
    createdAt: apiKey.createdAt,
  };
};

export const validateApiKey = async (key: string) => {
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
  });
  
  if (!apiKey) return null;
  if (!apiKey.isActive) return null;
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;
  
  // Update last used
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });
  
  return apiKey;
};

export const revokeApiKey = async (keyId: string) => {
  return prisma.apiKey.update({
    where: { id: keyId },
    data: { isActive: false },
  });
};
```

#### 2.1.3 Admin API Endpoints
**Effort:** M (2 days)  
**Priority:** P1 - High  
**Dependencies:** Key generation service

```typescript
// src/api/admin.routes.ts
router.post('/admin/keys', adminAuth, async (req, res) => {
  const { name, scopes, rateLimit, buildQuota, expiresAt } = req.body;
  const key = await generateApiKey({ name, scopes, rateLimit, buildQuota, expiresAt });
  res.status(201).json(key);
});

router.get('/admin/keys', adminAuth, async (req, res) => {
  const keys = await prisma.apiKey.findMany({
    select: {
      id: true,
      keyPrefix: true,
      name: true,
      scopes: true,
      isActive: true,
      lastUsedAt: true,
      totalBuilds: true,
      createdAt: true,
    },
  });
  res.json(keys);
});

router.delete('/admin/keys/:id', adminAuth, async (req, res) => {
  await revokeApiKey(req.params.id);
  res.status(204).send();
});

router.get('/admin/keys/:id/usage', adminAuth, async (req, res) => {
  const usage = await prisma.userBuild.groupBy({
    by: ['status'],
    where: { apiKeyId: req.params.id },
    _count: true,
  });
  res.json(usage);
});
```

### 2.2 Secrets Management

#### 2.2.1 Environment Variable Validation
**Effort:** S (4 hours)  
**Priority:** P1 - High

```typescript
// src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  
  // Server
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  
  // Security
  API_KEYS: z.string().optional(),
  ADMIN_API_KEY: z.string().min(32).optional(),
  
  // Docker
  DOCKER_IMAGE_REPO: z.string().optional(),
  DOCKER_HUB_USER: z.string().optional(),
  DOCKER_HUB_TOKEN: z.string().optional(),
  
  // Ollama
  OLLAMA_URL: z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('linux-builder'),
  OLLAMA_TIMEOUT: z.coerce.number().default(30000),
  
  // Optional integrations
  SENTRY_DSN: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);
```

#### 2.2.2 Secrets Rotation Support
**Effort:** M (2 days)  
**Priority:** P2 - Medium

```typescript
// src/services/secretsManager.ts
interface SecretsProvider {
  getSecret(name: string): Promise<string>;
  rotateSecret?(name: string): Promise<void>;
}

class EnvSecretsProvider implements SecretsProvider {
  async getSecret(name: string) {
    return process.env[name] || '';
  }
}

// Future: AWS Secrets Manager, Vault, etc.
class AWSSecretsProvider implements SecretsProvider {
  async getSecret(name: string) {
    // Implementation for AWS Secrets Manager
  }
}

export const secrets = new EnvSecretsProvider();
```

### 2.3 Container Security

#### 2.3.1 Resource Limits
**Effort:** S (1 day)  
**Priority:** P1 - High

```typescript
// src/executor/executor.ts
const RESOURCE_LIMITS = {
  memory: '2g',
  cpus: '2',
  pidsLimit: 100,
  timeout: 30 * 60 * 1000, // 30 minutes
};

export const executeCommand = async (
  command: string,
  buildId: string,
  options?: ExecuteOptions
) => {
  // Add resource limits to docker commands
  if (command.startsWith('docker run')) {
    command = command.replace(
      'docker run',
      `docker run --memory=${RESOURCE_LIMITS.memory} --cpus=${RESOURCE_LIMITS.cpus} --pids-limit=${RESOURCE_LIMITS.pidsLimit}`
    );
  }
  
  // Add timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOURCE_LIMITS.timeout);
  
  try {
    // ... execute with signal: controller.signal
  } finally {
    clearTimeout(timeoutId);
  }
};
```

#### 2.3.2 Network Isolation
**Effort:** M (2 days)  
**Priority:** P1 - High

```typescript
// Create isolated network for builds
const BUILD_NETWORK = 'linux-builder-isolated';

// On startup
await executeCommand(`docker network create --internal ${BUILD_NETWORK}`, 'system');

// For builds - no external network access during build
const dockerRunCmd = `docker run --network=${BUILD_NETWORK} ...`;
```

### 2.4 Security Documentation

#### 2.4.1 SECURITY.md
**Effort:** S (4 hours)  
**Priority:** P1 - High

```markdown
# Security Policy

## Supported Versions
| Version | Supported |
|---------|-----------|
| 1.x     | ✅        |

## Reporting a Vulnerability
Email: security@example.com
PGP Key: [link]

Response time: 48 hours
Disclosure policy: 90 days

## Security Controls
- All user inputs sanitized
- Shell arguments escaped
- Rate limiting on all endpoints
- API key authentication
- Build isolation via Docker
```

---

## Phase 2 Deliverables Checklist

- [ ] ApiKey database model
- [ ] Key generation service
- [ ] Key validation with caching
- [ ] Admin API endpoints
- [ ] Environment validation with Zod
- [ ] Docker resource limits
- [ ] Network isolation for builds
- [ ] SECURITY.md
- [ ] Migration script for existing builds
- [ ] API key documentation

**Phase 2 Success Metrics:**
- All builds associated with API keys
- Zero unauthenticated access to protected endpoints
- Resource limits enforced on all builds
- Admin can create/revoke keys


---

## Phase 3: Scalability (Weeks 7-9)

**Goal:** Handle production load with proper queuing and caching  
**Risk Level:** Medium (architecture changes)  
**Business Value:** Very High - Enables growth, reliability

### 3.1 Build Queue System

#### 3.1.1 BullMQ Integration
**Effort:** L (1 week)  
**Priority:** P0 - Critical  
**Dependencies:** Redis available

```typescript
// src/queue/buildQueue.ts
import { Queue, Worker, Job } from 'bullmq';
import { BuildSpec } from '../ai/schema';

const connection = { host: 'localhost', port: 6379 };

export const buildQueue = new Queue('builds', { connection });

interface BuildJobData {
  buildId: string;
  spec: BuildSpec;
  apiKeyId: string;
  priority: number;
}

// Producer
export const enqueueBuild = async (data: BuildJobData) => {
  return buildQueue.add('build', data, {
    priority: data.priority,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  });
};

// Consumer
export const buildWorker = new Worker<BuildJobData>(
  'builds',
  async (job: Job<BuildJobData>) => {
    const { buildId, spec } = job.data;
    
    job.updateProgress(0);
    await runBuildLifecycle(spec, buildId, (progress) => {
      job.updateProgress(progress);
    });
    job.updateProgress(100);
    
    return { buildId, status: 'complete' };
  },
  {
    connection,
    concurrency: parseInt(process.env.BUILD_CONCURRENCY || '2'),
    limiter: { max: 10, duration: 60000 }, // 10 builds per minute
  }
);

buildWorker.on('completed', (job) => {
  logger.info({ buildId: job.data.buildId }, 'Build completed');
});

buildWorker.on('failed', (job, err) => {
  logger.error({ buildId: job?.data.buildId, error: err.message }, 'Build failed');
});
```

#### 3.1.2 Priority Queuing
**Effort:** S (1 day)  
**Priority:** P1 - High

```typescript
// Priority levels based on API key tier
const PRIORITY_LEVELS = {
  free: 10,      // Lowest priority
  basic: 5,
  pro: 2,
  enterprise: 1, // Highest priority
};

export const getJobPriority = async (apiKeyId: string): Promise<number> => {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    select: { tier: true },
  });
  return PRIORITY_LEVELS[apiKey?.tier || 'free'];
};
```

#### 3.1.3 Concurrency Control
**Effort:** M (2 days)  
**Priority:** P1 - High

```typescript
// Per-user concurrency limits
const USER_CONCURRENCY_LIMITS = {
  free: 1,
  basic: 2,
  pro: 5,
  enterprise: 10,
};

// Check before enqueueing
export const canStartBuild = async (apiKeyId: string): Promise<boolean> => {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    select: { tier: true },
  });
  
  const activeBuilds = await prisma.userBuild.count({
    where: {
      apiKeyId,
      status: 'IN_PROGRESS',
    },
  });
  
  const limit = USER_CONCURRENCY_LIMITS[apiKey?.tier || 'free'];
  return activeBuilds < limit;
};
```

### 3.2 Caching Strategy

#### 3.2.1 Redis Cache Layer
**Effort:** M (2 days)  
**Priority:** P1 - High

```typescript
// src/cache/redis.ts
import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL);

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  },
  
  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  },
  
  async del(key: string): Promise<void> {
    await redis.del(key);
  },
  
  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  },
};
```

#### 3.2.2 Build Status Caching
**Effort:** S (4 hours)  
**Priority:** P1 - High

```typescript
// Cache build status for 30 seconds
export const getBuildStatus = async (buildId: string) => {
  const cacheKey = `build:status:${buildId}`;
  
  let status = await cache.get(cacheKey);
  if (status) return status;
  
  status = await prisma.userBuild.findUnique({
    where: { id: buildId },
    include: { logs: true, artifacts: true },
  });
  
  if (status) {
    // Cache completed builds longer
    const ttl = status.status === 'SUCCESS' || status.status === 'FAILED' ? 3600 : 30;
    await cache.set(cacheKey, status, ttl);
  }
  
  return status;
};
```

#### 3.2.3 Package Resolution Caching
**Effort:** S (4 hours)  
**Priority:** P2 - Medium

```typescript
// Cache resolved packages per distro
export const resolvePackagesWithCache = async (
  packages: string[],
  distro: string
): Promise<ResolvedPackages> => {
  const cacheKey = `packages:${distro}:${packages.sort().join(',')}`;
  
  let resolved = await cache.get<ResolvedPackages>(cacheKey);
  if (resolved) return resolved;
  
  resolved = resolvePackages(packages, distro);
  await cache.set(cacheKey, resolved, 86400); // 24 hours
  
  return resolved;
};
```

### 3.3 Database Optimizations

#### 3.3.1 Index Additions
**Effort:** XS (2 hours)  
**Priority:** P1 - High

```prisma
model UserBuild {
  // ... existing fields ...
  
  @@index([apiKeyId])
  @@index([status])
  @@index([createdAt])
  @@index([apiKeyId, status])
}

model ApiKey {
  // ... existing fields ...
  
  @@index([keyHash])
  @@index([isActive])
}
```

#### 3.3.2 Query Optimization
**Effort:** S (4 hours)  
**Priority:** P2 - Medium

```typescript
// Use select to limit returned fields
const builds = await prisma.userBuild.findMany({
  where: { apiKeyId },
  select: {
    id: true,
    status: true,
    baseDistro: true,
    createdAt: true,
    buildDuration: true,
  },
  orderBy: { createdAt: 'desc' },
  take: 20,
});

// Use cursor-based pagination for large lists
const builds = await prisma.userBuild.findMany({
  take: 20,
  skip: 1,
  cursor: { id: lastBuildId },
  orderBy: { createdAt: 'desc' },
});
```

### 3.4 Artifact Storage (Local)

> **Note:** This project uses local storage for artifacts. Docker images are pushed to your Docker Hub repo. ISOs are stored locally and deleted after user download or expiration. No cloud storage (S3) needed for this simple setup.

#### 3.4.1 Local Artifact Management
**Effort:** S (4 hours)  
**Priority:** P1 - High

```typescript
// src/storage/local.ts
import fs from 'fs/promises';
import path from 'path';

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || './artifacts';

export const getArtifactPath = (buildId: string, filename: string): string => {
  return path.join(ARTIFACTS_DIR, buildId, filename);
};

export const deleteArtifact = async (buildId: string): Promise<void> => {
  const artifactDir = path.join(ARTIFACTS_DIR, buildId);
  await fs.rm(artifactDir, { recursive: true, force: true });
};

export const artifactExists = async (buildId: string, filename: string): Promise<boolean> => {
  try {
    await fs.access(getArtifactPath(buildId, filename));
    return true;
  } catch {
    return false;
  }
};
```

#### 3.4.2 Auto-Cleanup After Download
**Effort:** S (4 hours)  
**Priority:** P1 - High

```typescript
// Delete ISO after successful download
router.get('/build/download/:id/:type', authMiddleware, async (req, res) => {
  const { id, type } = req.params;
  const filePath = getArtifactPath(id, `${id}.${type}`);
  
  res.download(filePath, async (err) => {
    if (!err && type === 'iso') {
      // Delete ISO after successful download
      await deleteArtifact(id);
      await prisma.buildArtifact.deleteMany({ where: { buildId: id } });
    }
  });
});
```

#### 3.4.3 Scheduled Cleanup for Unclaimed Artifacts
**Effort:** S (4 hours)  
**Priority:** P2 - Medium

```typescript
// Cleanup ISOs older than 24 hours (unclaimed)
const ISO_RETENTION_HOURS = 24;

export const cleanupExpiredArtifacts = async () => {
  const cutoff = new Date(Date.now() - ISO_RETENTION_HOURS * 60 * 60 * 1000);
  
  const expiredBuilds = await prisma.userBuild.findMany({
    where: {
      status: 'SUCCESS',
      createdAt: { lt: cutoff },
    },
    include: { artifacts: true },
  });
  
  for (const build of expiredBuilds) {
    await deleteArtifact(build.id);
    await prisma.buildArtifact.deleteMany({ where: { buildId: build.id } });
  }
  
  logger.info({ count: expiredBuilds.length }, 'Cleaned up expired artifacts');
};

// Run cleanup every hour
setInterval(cleanupExpiredArtifacts, 60 * 60 * 1000);
```

---

## Phase 3 Deliverables Checklist

- [ ] BullMQ queue setup
- [ ] Build worker with progress tracking
- [ ] Priority queuing by tier
- [ ] Per-user concurrency limits
- [ ] Redis cache layer
- [ ] Build status caching
- [ ] Package resolution caching
- [ ] Database indexes
- [ ] Local artifact storage with auto-cleanup
- [ ] Scheduled cleanup for expired artifacts
- [ ] Queue monitoring dashboard

**Phase 3 Success Metrics:**
- Builds processed via queue (not fire-and-forget)
- < 100ms API response times (cached)
- Zero lost builds on server restart
- Artifacts auto-deleted after download or 24h expiration


---

## Phase 4: Operations (Weeks 10-12)

**Goal:** Production observability and deployment automation  
**Risk Level:** Low  
**Business Value:** High - Enables proactive issue detection

### 4.1 Monitoring & Metrics

#### 4.1.1 Prometheus Metrics
**Effort:** M (2 days)  
**Priority:** P1 - High

```typescript
// src/metrics/prometheus.ts
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const registry = new Registry();

// Request metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [registry],
});

// Build metrics
export const buildsTotal = new Counter({
  name: 'builds_total',
  help: 'Total builds',
  labelNames: ['distro', 'status'],
  registers: [registry],
});

export const buildDuration = new Histogram({
  name: 'build_duration_seconds',
  help: 'Build duration',
  labelNames: ['distro'],
  buckets: [60, 120, 300, 600, 1200, 1800],
  registers: [registry],
});

export const activeBuilds = new Gauge({
  name: 'active_builds',
  help: 'Currently running builds',
  registers: [registry],
});

export const queueDepth = new Gauge({
  name: 'build_queue_depth',
  help: 'Builds waiting in queue',
  registers: [registry],
});

// Endpoint
router.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
```

#### 4.1.2 Health Check Expansion
**Effort:** S (4 hours)  
**Priority:** P1 - High

```typescript
// src/api/health.routes.ts
router.get('/health', async (req, res) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      docker: await checkDocker(),
      ollama: await checkOllama(),
      queue: await checkQueue(),
    },
  };
  
  const allHealthy = Object.values(checks.checks).every(c => c.status === 'ok');
  res.status(allHealthy ? 200 : 503).json(checks);
});

router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

router.get('/health/ready', async (req, res) => {
  const dbOk = await checkDatabase();
  res.status(dbOk.status === 'ok' ? 200 : 503).json(dbOk);
});

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latency: '< 10ms' };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

async function checkDocker() {
  try {
    await execAsync('docker info');
    return { status: 'ok' };
  } catch (e) {
    return { status: 'error', error: 'Docker not available' };
  }
}
```

### 4.2 Error Tracking

#### 4.2.1 Sentry Integration
**Effort:** S (4 hours)  
**Priority:** P1 - High

```typescript
// src/utils/sentry.ts
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Scrub sensitive data
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
      }
      return event;
    },
  });
}

export const captureException = (error: Error, context?: Record<string, any>) => {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
  logger.error({ error: error.message, ...context }, 'Exception captured');
};

// Express error handler
app.use(Sentry.Handlers.errorHandler());
```

### 4.3 Deployment Automation

#### 4.3.1 Docker Compose Production
**Effort:** S (4 hours)  
**Priority:** P1 - High

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  app:
    build: .
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3

  worker:
    build: .
    command: npm run worker
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    deploy:
      replicas: 2

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

#### 4.3.2 GitHub Actions Deployment
**Effort:** M (2 days)  
**Priority:** P1 - High

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run tests
        run: npm test
      
      - name: Build Docker image
        run: docker build -t linux-builder:${{ github.sha }} .
      
      - name: Push to registry
        run: |
          docker tag linux-builder:${{ github.sha }} ${{ secrets.REGISTRY }}/linux-builder:${{ github.sha }}
          docker push ${{ secrets.REGISTRY }}/linux-builder:${{ github.sha }}
      
      - name: Deploy to production
        run: |
          # Update deployment with new image
          kubectl set image deployment/linux-builder app=${{ secrets.REGISTRY }}/linux-builder:${{ github.sha }}
          kubectl rollout status deployment/linux-builder
      
      - name: Smoke test
        run: curl -f https://api.example.com/health
```

---

## Phase 4 Deliverables Checklist

- [ ] Prometheus metrics endpoint
- [ ] Request/build metrics
- [ ] Expanded health checks
- [ ] Sentry error tracking
- [ ] Docker Compose production config
- [ ] GitHub Actions deployment workflow
- [ ] Kubernetes manifests (optional)
- [ ] Runbook documentation

---

## Phase 5: Features (Weeks 13+)

**Goal:** Competitive features for growth  
**Risk Level:** Medium-High  
**Business Value:** High - Differentiation

### 5.1 Multi-tenancy

#### 5.1.1 Organization Model
**Effort:** XL (2+ weeks)  
**Priority:** P2 - Medium

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  
  // Billing
  tier      String   @default("free")
  
  // Limits
  buildQuota    Int  @default(100)
  storageQuota  BigInt @default(10737418240) // 10GB
  
  members   OrgMember[]
  apiKeys   ApiKey[]
  builds    UserBuild[]
}

model OrgMember {
  id        String   @id @default(cuid())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id])
  email     String
  role      String   @default("member") // owner, admin, member
  
  @@unique([orgId, email])
}
```

### 5.2 AI Enhancements

#### 5.2.1 Conversational Refinement
**Effort:** L (1 week)  
**Priority:** P2 - Medium

```typescript
// Multi-turn conversation for spec refinement
router.post('/build/chat', authMiddleware, async (req, res) => {
  const { conversationId, message } = req.body;
  
  const conversation = await getOrCreateConversation(conversationId);
  conversation.messages.push({ role: 'user', content: message });
  
  const response = await ollama.chat({
    model: 'linux-builder',
    messages: conversation.messages,
  });
  
  conversation.messages.push({ role: 'assistant', content: response });
  
  // Extract spec if complete
  const spec = extractSpecFromConversation(conversation);
  
  res.json({
    conversationId: conversation.id,
    message: response,
    spec: spec,
    isComplete: !!spec,
  });
});
```

### 5.3 Integrations

#### 5.3.1 Webhook Notifications
**Effort:** M (2 days)  
**Priority:** P2 - Medium

```typescript
// src/services/webhooks.ts
export const sendWebhook = async (
  url: string,
  event: string,
  payload: any,
  secret: string
) => {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
      'X-Webhook-Event': event,
    },
    body: JSON.stringify(payload),
  });
};

// On build complete
await sendWebhook(apiKey.webhookUrl, 'build.completed', {
  buildId,
  status: 'success',
  artifacts: [...],
});
```

#### 5.3.2 GitHub Actions Integration
**Effort:** L (1 week)  
**Priority:** P3 - Low

```yaml
# Example GitHub Action for users
name: Build Linux Image
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: linux-builder/action@v1
        with:
          api-key: ${{ secrets.LINUX_BUILDER_KEY }}
          spec-file: ./linux-spec.json
```

---

## Phase 5 Deliverables Checklist

- [ ] Organization model
- [ ] RBAC implementation
- [ ] Conversational AI refinement
- [ ] Webhook notifications
- [ ] GitHub Action
- [ ] Slack/Discord integration
- [ ] Build templates/presets

---

## Implementation Timeline Summary

```
Week  1-3:  Phase 1 - Foundation (Testing, CI/CD, Logging, Docs)
Week  4-6:  Phase 2 - Security (API Keys, Secrets, Container Security)
Week  7-9:  Phase 3 - Scalability (Queue, Cache, Storage)
Week 10-12: Phase 4 - Operations (Monitoring, Deployment)
Week 13+:   Phase 5 - Features (Multi-tenancy, AI, Integrations)
```

## Risk Register

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaking auth changes | High | Medium | Feature flags, gradual rollout |
| Queue system complexity | Medium | Medium | Start simple, iterate |
| Disk space for artifacts | Low | Low | Auto-cleanup after download/24h |
| Docker security escape | High | Low | Resource limits, network isolation |
| Database performance | Medium | Medium | Indexes, caching, monitoring |

## Success Metrics

| Metric | Current | Phase 1 | Phase 3 | Phase 5 |
|--------|---------|---------|---------|---------|
| Test coverage | 0% | 70% | 80% | 85% |
| API response time (p95) | ? | < 500ms | < 100ms | < 50ms |
| Build success rate | ? | 90% | 95% | 98% |
| Uptime | ? | 99% | 99.5% | 99.9% |
| Concurrent builds | 1 | 2 | 10 | 50 |

---

## Next Steps

1. **Immediate:** Set up test framework (Vitest)
2. **This week:** Write unit tests for sanitizer.ts
3. **Next week:** GitHub Actions CI pipeline
4. **Review:** Schedule architecture review for Phase 2
