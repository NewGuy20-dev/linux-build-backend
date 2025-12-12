# Security & Code Quality Implementation Plan

**Project:** Linux Builder Engine Backend  
**Created:** 2025-12-10  
**Status:** Ready for Implementation

---

## Executive Summary

This plan addresses **5 critical**, **6 major**, **4 minor**, and **3 nitpick** issues identified during security review. Implementation is organized into 4 phases with estimated completion time of 2-3 hours for all fixes.

### Existing Security Utilities (Leverage These)
- `escapeShellArg()` - wraps in single quotes, escapes existing quotes
- `validateBuildId()` - validates cuid2 format  
- `validateGitUrl()` - HTTPS only, allowed hosts whitelist
- `maskSensitiveData()` - redacts tokens/passwords in logs
- `sanitizePackageName()` - alphanumeric, hyphens, underscores, dots only
- `DOCKER_IMAGES` allowlist in `dockerfileGenerator.ts`

---

## Phase 1: Critical Security Fixes (Priority: IMMEDIATE)

### 1.1 Shell Injection in tarExporter.ts

**File:** `src/builder/tarExporter.ts`  
**Line:** ~8  
**Risk:** HIGH - Arbitrary command execution via malicious image names

**Current Code:**
```typescript
const cmd = `docker save ${imageName} -o ${outputPath}`;
```

**Fix:** Use existing `escapeShellArg()` utility
```typescript
import { escapeShellArg } from '../utils/sanitizer';

const cmd = `docker save ${escapeShellArg(imageName)} -o ${escapeShellArg(outputPath)}`;
```

**Validation:** Add image name format validation
```typescript
function validateImageName(name: string): boolean {
  // Docker image name: [registry/][namespace/]repository[:tag]
  return /^[a-z0-9][a-z0-9._\-\/]*[a-z0-9](:[a-z0-9._\-]+)?$/i.test(name) && name.length <= 256;
}
```

---

### 1.2 HTTP Timeout Missing in ollama.ts

**File:** `src/ai/ollama.ts`  
**Risk:** HIGH - Resource exhaustion, hanging connections, DoS vector

**Current Code:**
```typescript
const response = await fetch(url, { method: 'POST', body, headers });
```

**Fix:** Add AbortController with timeout
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

try {
  const response = await fetch(url, {
    method: 'POST',
    body,
    headers,
    signal: controller.signal,
  });
  // ... handle response
} finally {
  clearTimeout(timeoutId);
}
```

---

### 1.3 Greedy Regex in extractJson() - ReDoS Risk

**File:** `src/ai/ollama.ts`  
**Risk:** MEDIUM-HIGH - Regex Denial of Service, CPU exhaustion

**Current Code (likely):**
```typescript
const match = text.match(/\{[\s\S]*\}/);
```

**Fix:** Use non-greedy quantifier and add input length limit
```typescript
function extractJson(text: string): string | null {
  if (text.length > 100000) return null; // Limit input size
  
  // Non-greedy match for JSON object
  const match = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
  return match ? match[0] : null;
}
```

**Alternative (safer):** Find balanced braces manually
```typescript
function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  
  let depth = 0;
  for (let i = start; i < text.length && i < start + 50000; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
```

---

### 1.4 AppArmor Profile Injection

**File:** `src/utils/securityConfig.ts`  
**Function:** `generateAppArmorProfile()`  
**Risk:** HIGH - Arbitrary AppArmor profile content injection

**Current Code:**
```typescript
function generateAppArmorProfile(appName: string): string {
  return `profile ${appName} flags=(attach_disconnected) { ... }`;
}
```

**Fix:** Validate and sanitize appName
```typescript
function validateAppArmorName(name: string): boolean {
  // AppArmor profile names: alphanumeric, underscores, hyphens, dots
  return /^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/.test(name);
}

function generateAppArmorProfile(appName: string): string {
  if (!validateAppArmorName(appName)) {
    throw new Error(`Invalid AppArmor profile name: ${appName}`);
  }
  const safeName = appName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `profile ${safeName} flags=(attach_disconnected) { ... }`;
}
```

---

### 1.5 Backup Config Shell Injection

**File:** `src/utils/backupConfig.ts`  
**Risk:** HIGH - Command injection via backup destinations

**Current Code:**
```typescript
const script = `rsync -av ${source} ${destinations[0]}`;
```

**Fix:** Validate destinations and use escapeShellArg
```typescript
import { escapeShellArg } from './sanitizer';

function validateBackupDestination(dest: string): boolean {
  // Allow: local paths, rsync URLs (user@host:path), s3:// URLs
  const localPath = /^\/[a-zA-Z0-9._\-\/]+$/;
  const rsyncUrl = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+:[a-zA-Z0-9._\-\/]+$/;
  const s3Url = /^s3:\/\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._\-\/]*$/;
  
  return localPath.test(dest) || rsyncUrl.test(dest) || s3Url.test(dest);
}

function generateBackupScript(source: string, destinations: string[]): string {
  for (const dest of destinations) {
    if (!validateBackupDestination(dest)) {
      throw new Error(`Invalid backup destination: ${dest}`);
    }
  }
  
  const safeDest = escapeShellArg(destinations[0]);
  const safeSource = escapeShellArg(source);
  return `rsync -av ${safeSource} ${safeDest}`;
}
```

---

## Phase 2: Major Security & Architecture Fixes

### 2.1 Trust Proxy Configuration

**File:** `src/index.ts`  
**Risk:** MEDIUM - Incorrect client IP detection behind reverse proxy

**Fix:** Add trust proxy configuration
```typescript
// Add after app creation, before middleware
if (process.env.NODE_ENV === 'production') {
  // Trust first proxy (adjust based on infrastructure)
  app.set('trust proxy', 1);
}
```

**Environment Variable Option:**
```typescript
const trustProxy = process.env.TRUST_PROXY || false;
app.set('trust proxy', trustProxy === 'true' ? 1 : trustProxy);
```

---

### 2.2 Rate Limiting Before Authentication

**File:** `src/api/build.routes.ts`  
**Risk:** MEDIUM - Brute force attacks bypass rate limiting

**Current Order:**
```typescript
router.post('/start', authMiddleware, buildRateLimit, startBuild);
```

**Fix:** Rate limit BEFORE auth
```typescript
router.post('/start', buildRateLimit, authMiddleware, startBuild);
```

**Apply to all routes:**
```typescript
// Apply general rate limit to all routes first
router.use(apiRateLimit);

// Then specific limits before auth
router.post('/start', buildRateLimit, authMiddleware, startBuild);
router.post('/generate', generateRateLimit, authMiddleware, generateSpec);
```

---

### 2.3 Fire-and-Forget Async Error Handling

**File:** `src/api/build.controller.ts`  
**Risk:** MEDIUM - Unhandled promise rejections, silent failures

**Current Code:**
```typescript
runBuildLifecycle(buildId, spec);  // No await, no catch
res.json({ buildId });
```

**Fix:** Add error handling
```typescript
runBuildLifecycle(buildId, spec).catch((error) => {
  console.error(`Build lifecycle failed for ${buildId}:`, maskSensitiveData(error.message));
  // Update build status to failed in database
  prisma.userBuild.update({
    where: { id: buildId },
    data: { status: 'FAILED', error: error.message },
  }).catch(console.error);
});

res.json({ buildId });
```

---

### 2.4 Base Distro Validation in isoGenerator.ts

**File:** `src/builder/isoGenerator.ts`  
**Risk:** MEDIUM - Arbitrary base image usage

**Fix:** Use existing DOCKER_IMAGES allowlist
```typescript
import { DOCKER_IMAGES } from './dockerfileGenerator';

function validateBaseDistro(distro: string): boolean {
  return distro in DOCKER_IMAGES;
}

// In generateIso or relevant function:
if (!validateBaseDistro(spec.baseDistro)) {
  throw new Error(`Unsupported base distribution: ${spec.baseDistro}`);
}
```

---

### 2.5 Owner Key IP Handling

**File:** `src/api/build.controller.ts`  
**Function:** `getOwnerKey()`  
**Risk:** MEDIUM - Incorrect IP extraction without trust proxy

**Current Code:**
```typescript
function getOwnerKey(req: Request): string {
  return req.headers['x-api-key'] as string || req.ip || 'anonymous';
}
```

**Fix:** Proper IP extraction with proxy awareness
```typescript
function getOwnerKey(req: Request): string {
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    return `key:${hashApiKey(apiKey)}`;
  }
  
  // req.ip respects trust proxy setting
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}
```

---

### 2.6 Auth Middleware Improvements

**File:** `src/middleware/auth.ts`  
**Issues:** Unused userId, void return type, no caching

**Fix:**
```typescript
import { Request, Response, NextFunction } from 'express';

// Extend Request type properly
declare global {
  namespace Express {
    interface Request {
      apiKeyValid?: boolean;
      ownerKey?: string;
    }
  }
}

// Simple in-memory cache (consider Redis for production)
const keyCache = new Map<string, { valid: boolean; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  
  if (!apiKey) {
    // Allow anonymous access with IP-based rate limiting
    req.apiKeyValid = false;
    return next();
  }
  
  // Check cache
  const cached = keyCache.get(apiKey);
  if (cached && cached.expires > Date.now()) {
    req.apiKeyValid = cached.valid;
    return next();
  }
  
  // Validate key (implement your validation logic)
  const isValid = await validateApiKey(apiKey);
  
  // Cache result
  keyCache.set(apiKey, { valid: isValid, expires: Date.now() + CACHE_TTL });
  
  req.apiKeyValid = isValid;
  next();
}
```

---

## Phase 3: Minor Improvements

### 3.1 Middleware Ordering in index.ts

**Current (likely):**
```typescript
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(routes);
```

**Recommended Order:**
```typescript
// 1. Trust proxy (if behind reverse proxy)
app.set('trust proxy', 1);

// 2. Security headers first
app.use(helmet());

// 3. Rate limiting (before parsing body)
app.use(apiRateLimit);

// 4. CORS
app.use(cors(corsOptions));

// 5. Body parsing (with limits)
app.use(express.json({ limit: '1mb' }));

// 6. Request logging
app.use(requestLogger);

// 7. Routes
app.use('/api', routes);

// 8. Error handler (last)
app.use(errorHandler);
```

---

### 3.2 Add Request Body Size Limits

**File:** `src/index.ts`

```typescript
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
```

---

### 3.3 Lifecycle Step Numbering

**File:** `src/executor/lifecycle.ts`  
**Issue:** Inconsistent step numbering in comments

**Fix:** Audit and correct all step comments to match actual execution order.

---

### 3.4 Error Handler Response Sanitization

**File:** `src/middleware/errorHandler.ts`

```typescript
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', maskSensitiveData(err.message));
  
  // Don't leak stack traces in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  res.status(500).json({ error: message });
}
```

---

## Phase 4: Nitpicks & Cleanup

### 4.1 Package.json Cleanup

**File:** `package.json`

**Issues:**
- Duplicate `dev`/`dev:server` scripts
- Version mismatch: `@prisma/adapter-neon ^7.0.0` vs `@prisma/client ^7.1.0`

**Fix:**
```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@prisma/client": "^7.1.0",
    "@prisma/adapter-neon": "^7.1.0"
  }
}
```

---

### 4.2 Add .env.example

**File:** `.env.example` (create if missing)

```env
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
TRUST_PROXY=false

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Optional: Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_TIMEOUT=30000
```

---

## Implementation Checklist

### Phase 1 - Critical (Do First)
- [ ] 1.1 Fix shell injection in tarExporter.ts
- [ ] 1.2 Add HTTP timeout to ollama.ts
- [ ] 1.3 Fix greedy regex in extractJson()
- [ ] 1.4 Validate AppArmor profile names
- [ ] 1.5 Sanitize backup destinations

### Phase 2 - Major
- [ ] 2.1 Configure trust proxy
- [ ] 2.2 Reorder rate limiting before auth
- [ ] 2.3 Add error handling to fire-and-forget async
- [ ] 2.4 Validate base distro against allowlist
- [ ] 2.5 Fix owner key IP handling
- [ ] 2.6 Improve auth middleware

### Phase 3 - Minor
- [ ] 3.1 Correct middleware ordering
- [ ] 3.2 Add request body size limits
- [ ] 3.3 Fix lifecycle step numbering
- [ ] 3.4 Sanitize error responses

### Phase 4 - Cleanup
- [ ] 4.1 Clean up package.json
- [ ] 4.2 Create .env.example

---

## Testing Recommendations

### Security Tests to Add
```typescript
describe('Security', () => {
  it('should reject malicious image names', () => {
    expect(() => validateImageName('test; rm -rf /')).toBe(false);
    expect(() => validateImageName('$(whoami)')).toBe(false);
  });
  
  it('should timeout long-running AI requests', async () => {
    // Mock slow endpoint
    await expect(generateWithOllama(slowPrompt)).rejects.toThrow('aborted');
  });
  
  it('should reject invalid AppArmor names', () => {
    expect(() => generateAppArmorProfile('test\nmalicious')).toThrow();
  });
});
```

### Manual Security Verification
1. Test shell injection vectors in all user inputs
2. Verify rate limiting works before authentication
3. Confirm error messages don't leak sensitive info
4. Test timeout behavior under load

---

## Rollback Plan

Each fix is isolated. If issues arise:
1. Revert specific file changes via git
2. Critical fixes have no external dependencies
3. Database schema unchanged - no migration rollback needed

---

## Post-Implementation

1. **Run full test suite** after each phase
2. **Security scan** with `npm audit`
3. **Load test** rate limiting and timeouts
4. **Code review** all changes before merge
5. **Update CHANGELOG.md** with security fixes (without details)
