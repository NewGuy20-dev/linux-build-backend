# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

- **Email**: Create a private issue or contact the maintainers
- **Response time**: We aim to respond within 48 hours
- **Disclosure**: Please allow 90 days for fixes before public disclosure

## Security Controls

### Authentication

- API key authentication required for all build operations
- Keys prefixed with `lbk_` for identification
- SHA-256 hashed storage (keys never stored in plaintext)
- Automatic expiration support
- Scope-based permissions

### Rate Limiting

- Build creation: 10 builds/hour per API key
- API calls: 100 requests/minute per API key
- Rate limits applied before authentication to prevent enumeration

### Input Validation

- All user inputs validated and sanitized
- Build IDs validated against CUID2 format
- Package names sanitized to alphanumeric + `-_.`
- Docker image names validated against strict pattern
- Git URLs restricted to allowed hosts (GitHub, GitLab, Bitbucket)

### Command Execution Security

- `execFile()` used for Docker commands (no shell injection)
- Shell arguments escaped with single-quote wrapping
- Path traversal prevention on all file operations
- Sensitive data masked in logs

### Build Isolation

- Each build runs in isolated Docker container
- Resource limits enforced (memory, CPU, PIDs)
- Network disabled during build (configurable)
- `--security-opt=no-new-privileges` applied

### Data Protection

- Build artifacts scoped to owner (API key hash)
- Tenant isolation for multi-tenant deployments
- Audit logging for access attempts
- Automatic artifact cleanup after TTL

## API Key Management

### Key Format
```
lbk_<random-string>
```

### Best Practices

1. **Never commit keys** - Use environment variables
2. **Rotate regularly** - Keys should be rotated every 90 days
3. **Use scoped keys** - Create keys with minimal required permissions
4. **Monitor usage** - Review audit logs for suspicious activity

### Key Scopes

| Scope | Permissions |
|-------|-------------|
| `build:create` | Start new builds |
| `build:read` | View build status and logs |
| `build:download` | Download artifacts |
| `admin` | Full access including key management |

## Security Headers

The API sets the following security headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Deployment Security

### Environment Variables

| Variable | Security Impact |
|----------|-----------------|
| `API_KEYS` | Comma-separated valid API keys |
| `DATABASE_URL` | Database connection (use SSL) |
| `TRUST_PROXY` | Set `true` only behind trusted proxy |

### Docker Security

- Run as non-root user when possible
- Use read-only filesystem where applicable
- Limit container capabilities
- Enable AppArmor/SELinux profiles

## Compliance

This project implements security controls aligned with:

- OWASP API Security Top 10
- CIS Docker Benchmark
- NIST Cybersecurity Framework

## Changelog

| Date | Change |
|------|--------|
| 2025-12-11 | Initial security documentation |
