# Linux Builder Engine - Remaining Work Plan

**Generated:** 2025-12-12  
**Based on:** IMPLEMENTATION_PLAN.md analysis against current codebase  

---

## Executive Summary

After comprehensive analysis of the codebase against IMPLEMENTATION_PLAN.md:

| Phase Range | Status | Completion |
|-------------|--------|------------|
| Phase 1-11 (Foundation) | ✅ Nearly Complete | ~95% |
| Phase 12-17 (Growth) | ✅ Mostly Complete | ~85% |
| Phase 18-22 (Scale) | ⚠️ Partial | ~40% |

**Overall Progress: ~75% of planned features implemented**

---

## 🟢 COMPLETED PHASES (No Action Required)

### Phase 1: Critical Security ✅
- `executeCommandSecureArgs()` in `executor.ts`
- Header injection prevention in `build.controller.ts`
- `tarExporter.ts` uses secure execution

### Phase 2: Access Control ✅
- API key-only ownership with IP deprecation warning
- Tenant-scoped ownership checks with audit logging

### Phase 3: Stability ✅
- Code quality improvements done
- Package.json cleaned

### Phase 5: Testing ✅
- 13 test files covering critical paths

### Phase 6: Documentation ✅
- `swagger.ts`, `SECURITY.md`, `docs/DEPLOYMENT.md`

### Phase 7: Monitoring ✅
- Pino structured logging, health checks, Prometheus metrics

### Phase 8: Architecture ✅
- BullMQ with priorities, DLQ, per-user concurrency

### Phase 9: Security Hardening ✅
- Docker resource limits, security headers, HMAC webhooks

### Phase 11: CI/CD ✅
- GitHub Actions workflow, Dependabot

### Phase 12: Multi-tenancy ✅
- Tenant model with quotas, RBAC middleware

### Phase 13: Templates & Presets ✅
- Full template CRUD, 6 presets, reviews

### Phase 14: Collaboration ✅
- Teams, members, approval workflows

### Phase 16: Analytics ✅
- Build metrics collection and reporting

### Phase 22: Maintenance ✅
- Automated cleanup, health checks, usage reset

---

## 🟡 REMAINING WORK - PRIORITIZED

### Priority 1: Quick Wins (1-2 days each)

#### 1.1 Test Script Authentication (Phase 4)
**Effort:** 1 hour  
**Files:** `quick-curl-test.sh`, `test-build-lifecycle.sh`

```bash
# Add to test scripts
API_KEY="${API_KEY:-test-key}"
curl -H "Authorization: Bearer $API_KEY" ...
```

#### 1.2 Lifecycle Test Coverage (Phase 5)
**Effort:** 4 hours  
**File:** `src/executor/lifecycle.test.ts` (new)

```typescript
// Test full build lifecycle
describe('lifecycle', () => {
  it('should complete build lifecycle', async () => {
    // Mock docker commands
    // Test step progression
    // Verify artifact creation
  });
});
```

#### 1.3 isoGenerator Test Coverage (Phase 5)
**Effort:** 4 hours  
**File:** `src/builder/isoGenerator.test.ts` (new)

---

### Priority 2: Compliance Profiles (Phase 17)
**Effort:** 2-3 days  
**Priority:** HIGH (enterprise requirement)

#### Files to Create:
- `src/security/compliance.ts`
- `src/security/profiles/hipaa.ts`
- `src/security/profiles/pci-dss.ts`
- `src/security/profiles/soc2.ts`

#### Implementation:

```typescript
// src/security/compliance.ts
export interface ComplianceProfile {
  name: string;
  checks: ComplianceCheck[];
}

export interface ComplianceCheck {
  id: string;
  description: string;
  check: (buildSpec: any) => Promise<{ passed: boolean; details: string }>;
}

export const COMPLIANCE_PROFILES: Record<string, ComplianceProfile> = {
  'hipaa': {
    name: 'HIPAA',
    checks: [
      { id: 'encryption-at-rest', description: 'Data encryption at rest', check: checkEncryption },
      { id: 'audit-logging', description: 'Audit logging enabled', check: checkAuditLogs },
      { id: 'access-controls', description: 'Access controls configured', check: checkAccessControls },
    ],
  },
  'pci-dss': {
    name: 'PCI-DSS',
    checks: [
      { id: 'firewall', description: 'Firewall configured', check: checkFirewall },
      { id: 'no-default-passwords', description: 'No default passwords', check: checkPasswords },
    ],
  },
};

export const runComplianceCheck = async (buildId: string, profile: string) => {
  const p = COMPLIANCE_PROFILES[profile];
  if (!p) throw new Error(`Unknown profile: ${profile}`);
  
  const results = await Promise.all(p.checks.map(c => c.check(buildSpec)));
  // Store results in SecurityScan table
};
```

#### Database Update:
```prisma
// Add to SecurityScan model
complianceProfile String?  // hipaa, pci-dss, soc2
```

---

### Priority 3: CI/CD Platform Integrations (Phase 15)
**Effort:** 3-5 days  
**Priority:** HIGH (user adoption)

#### 3.1 GitHub Action Package
**Location:** `integrations/github-action/` (separate package)

```yaml
# action.yml
name: 'Linux Builder'
description: 'Build custom Linux images'
inputs:
  api-key:
    required: true
  spec-file:
    required: false
    default: 'build-spec.json'
  api-url:
    required: false
    default: 'https://api.linuxbuilder.io'
runs:
  using: 'node20'
  main: 'dist/index.js'
```

```typescript
// index.ts
import * as core from '@actions/core';

async function run() {
  const apiKey = core.getInput('api-key', { required: true });
  const specFile = core.getInput('spec-file');
  const apiUrl = core.getInput('api-url');
  
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  
  const res = await fetch(`${apiUrl}/api/build/start`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });
  
  const { buildId } = await res.json();
  core.setOutput('build-id', buildId);
  
  // Poll for completion
  await waitForBuild(apiUrl, apiKey, buildId);
}
```

#### 3.2 GitLab CI Component
**Location:** `integrations/gitlab-ci/`

```yaml
# .gitlab-ci.yml template
linux-build:
  image: node:20
  script:
    - npm install -g @linuxbuilder/cli
    - lbuild start --spec build-spec.json --wait
```

---

### Priority 4: Build Optimization (Phase 18)
**Effort:** 5-7 days  
**Priority:** MEDIUM

#### 4.1 Distributed Caching
**File:** `src/cache/distributed.ts`

```typescript
import { redis } from '../utils/redis';
import { createHash } from 'crypto';

interface DistributedCacheConfig {
  nodes: string[];  // Redis cluster nodes
  replication: number;
}

export class DistributedCache {
  async getLayerCache(layerHash: string): Promise<Buffer | null> {
    const key = `layer:${layerHash}`;
    return redis.getBuffer(key);
  }
  
  async setLayerCache(layerHash: string, data: Buffer, ttl: number) {
    await redis.setex(`layer:${layerHash}`, ttl, data);
  }
  
  async warmCache(baseImages: string[]) {
    // Pre-populate cache with common layers
  }
}
```

#### 4.2 Parallel Build Steps
**File:** `src/build/parallel.ts`

```typescript
export const runParallelSteps = async (steps: BuildStep[], maxConcurrency = 4) => {
  const queue = [...steps];
  const running: Promise<void>[] = [];
  
  while (queue.length || running.length) {
    while (running.length < maxConcurrency && queue.length) {
      const step = queue.shift()!;
      if (step.dependencies.every(d => completedSteps.has(d))) {
        running.push(executeStep(step));
      } else {
        queue.push(step); // Re-queue
      }
    }
    await Promise.race(running);
  }
};
```

---

### Priority 5: Developer Experience (Phase 19)
**Effort:** 2-3 weeks  
**Priority:** MEDIUM (user adoption)

#### 5.1 CLI Tool
**Location:** `cli/` (separate package)
**Language:** TypeScript (for consistency)

```
cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── commands/
│   │   ├── init.ts
│   │   ├── start.ts
│   │   ├── status.ts
│   │   ├── logs.ts
│   │   ├── download.ts
│   │   └── templates.ts
│   └── utils/
│       ├── api.ts
│       └── config.ts
```

```typescript
// cli/src/index.ts
#!/usr/bin/env node
import { Command } from 'commander';
import { init, start, status, logs, download } from './commands';

const program = new Command();

program
  .name('lbuild')
  .version('1.0.0')
  .description('Linux Builder CLI');

program.command('init').description('Initialize build spec').action(init);
program.command('start <spec>').description('Start build').action(start);
program.command('status <buildId>').description('Check status').action(status);
program.command('logs <buildId>').option('-f, --follow', 'Follow logs').action(logs);
program.command('download <buildId>').option('-t, --type <type>', 'Artifact type').action(download);

program.parse();
```

#### 5.2 TypeScript SDK
**Location:** `sdk/typescript/`

```typescript
// sdk/typescript/src/index.ts
export class LinuxBuilderClient {
  constructor(private apiKey: string, private baseUrl = 'https://api.linuxbuilder.io') {}
  
  async startBuild(spec: BuildSpec): Promise<{ buildId: string }> {
    const res = await fetch(`${this.baseUrl}/api/build/start`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(spec),
    });
    return res.json();
  }
  
  async getStatus(buildId: string): Promise<BuildStatus> { ... }
  async streamLogs(buildId: string, onLog: (log: string) => void): Promise<void> { ... }
  async downloadArtifact(buildId: string, type: 'iso' | 'docker'): Promise<Buffer> { ... }
  
  private headers() {
    return { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }
}
```

---

### Priority 6: Plugin Sandboxing (Phase 20)
**Effort:** 3-5 days  
**Priority:** LOW (security for plugin ecosystem)

**File:** `src/plugins/sandbox.ts`

```typescript
import { VM } from 'vm2';

export const runPluginSandboxed = async (code: string, context: PluginContext) => {
  const vm = new VM({
    timeout: 30000,
    sandbox: {
      context,
      console: { log: (...args) => logger.info({ plugin: context.pluginName }, ...args) },
      // Limited API surface
      fetch: sandboxedFetch,
    },
  });
  
  return vm.run(code);
};
```

---

### Priority 7: Enterprise Features (Phase 21)
**Effort:** 1-2 weeks  
**Priority:** LOW (enterprise tier)

#### 7.1 Custom RBAC Roles
**File:** `src/middleware/customRoles.ts`

```typescript
// Add to schema.prisma
model CustomRole {
  id          String   @id @default(cuid())
  tenantId    String
  name        String
  permissions String[] // build:read, build:write, team:manage, etc.
  
  @@unique([tenantId, name])
}

// Middleware
export const checkPermission = (permission: string) => async (req, res, next) => {
  const role = await getCustomRole(req.tenantId, req.userId);
  if (!role.permissions.includes(permission)) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  next();
};
```

#### 7.2 Billing/Cost Tracking
**Files:** `src/billing/tracker.ts`, `src/api/billing.routes.ts`

```prisma
model UsageRecord {
  id        String   @id @default(cuid())
  tenantId  String
  type      String   // build, storage, api_call
  quantity  Int
  unitCost  Float
  timestamp DateTime @default(now())
  
  @@index([tenantId, timestamp])
}
```

---

## 📅 Recommended Implementation Timeline

### Week 1-2: Quick Wins + Compliance
| Day | Task | Effort |
|-----|------|--------|
| 1 | Test script auth headers | 1h |
| 1-2 | Lifecycle tests | 4h |
| 2-3 | isoGenerator tests | 4h |
| 3-5 | Compliance profiles (HIPAA, PCI-DSS) | 16h |

### Week 3-4: Integrations
| Day | Task | Effort |
|-----|------|--------|
| 1-3 | GitHub Action package | 12h |
| 4-5 | GitLab CI component | 8h |

### Week 5-6: Build Optimization
| Day | Task | Effort |
|-----|------|--------|
| 1-3 | Distributed caching | 12h |
| 4-5 | Parallel build steps | 8h |

### Week 7-9: Developer Experience
| Day | Task | Effort |
|-----|------|--------|
| 1-5 | CLI tool | 20h |
| 6-10 | TypeScript SDK | 20h |

### Week 10+: Enterprise (As Needed)
- Custom RBAC roles
- Billing/cost tracking
- Plugin sandboxing

---

## 📊 Effort Summary

| Category | Items | Total Effort |
|----------|-------|--------------|
| Quick Wins | 3 | ~10 hours |
| Compliance | 1 | ~16 hours |
| Integrations | 2 | ~20 hours |
| Build Optimization | 2 | ~20 hours |
| Developer Experience | 2 | ~40 hours |
| Enterprise | 3 | ~40 hours |
| **Total** | **13** | **~146 hours** |

---

## 🎯 Success Metrics

| Milestone | Target | Measurement |
|-----------|--------|-------------|
| Test coverage | >80% on security paths | `npm run test:coverage` |
| Compliance profiles | 3 profiles (HIPAA, PCI-DSS, SOC2) | Feature complete |
| CI/CD integrations | GitHub + GitLab | Published packages |
| CLI downloads | 100+ in first month | npm stats |
| Build speed improvement | 30% faster with caching | Duration metrics |

---

## 🚨 Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking changes during refactor | Comprehensive test coverage first |
| Plugin security vulnerabilities | Sandboxing with vm2 |
| CI/CD integration complexity | Start with GitHub (most users) |
| SDK maintenance burden | Generate from OpenAPI spec |

---

*Document generated from codebase analysis on 2025-12-12*
