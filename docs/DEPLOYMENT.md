# Deployment Guide

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | Neon PostgreSQL connection string |
| `PORT` | No | 3000 | Server port |
| `HOST` | No | 0.0.0.0 | Server host |
| `API_KEYS` | No | - | Comma-separated API keys |
| `TRUST_PROXY` | No | false | Enable trust proxy (set true behind nginx/traefik) |
| `OLLAMA_URL` | No | http://127.0.0.1:11434 | Ollama API URL |
| `OLLAMA_TIMEOUT` | No | 30000 | Ollama request timeout (ms) |
| `REDIS_URL` | No | - | Redis connection for queue/cache |
| `NODE_ENV` | No | development | Environment (production/development) |
| `LOG_LEVEL` | No | info | Logging level (debug/info/warn/error) |

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Setup database
npx prisma generate
npx prisma migrate dev

# Start development server
npm run dev
```

### Docker Deployment

```bash
# Build image
docker build -t linux-builder .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e API_KEYS="lbk_your_key" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  linux-builder
```

### Docker Compose

```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - API_KEYS=${API_KEYS}
      - REDIS_URL=redis://redis:6379
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./artifacts:/app/artifacts
    depends_on:
      - redis

  redis:
    image: redis:alpine
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

## Proxy Configuration

When running behind a reverse proxy (nginx, traefik, etc.):

1. Set `TRUST_PROXY=true` or `NODE_ENV=production`
2. Configure proxy to forward headers:

### Nginx Example

```nginx
location /api {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Database Setup

### Neon PostgreSQL

1. Create a Neon project at https://neon.tech
2. Copy the connection string
3. Set `DATABASE_URL` environment variable
4. Run migrations: `npx prisma migrate deploy`

### Connection Pooling

For production, use Neon's connection pooler:
```
DATABASE_URL="postgresql://user:pass@ep-xxx.region.aws.neon.tech/db?sslmode=require&pgbouncer=true"
```

## Health Checks

- Basic: `GET /api/health`
- Detailed: `GET /api/health/detailed`

### Health Check Response

```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "ok" },
    "docker": { "status": "ok" },
    "redis": { "status": "ok" }
  },
  "timestamp": "2025-12-11T00:00:00.000Z"
}
```

## Monitoring

### Metrics Endpoint

Prometheus metrics available at `GET /metrics`:

- `builds_total` - Total builds by status/distro
- `build_duration_seconds` - Build duration histogram
- `http_requests_total` - HTTP request counter
- `http_request_duration_seconds` - Request duration histogram

### Logging

Structured JSON logging with pino:

```bash
# Pretty print logs in development
npm run dev | npx pino-pretty
```

## Scaling

### Horizontal Scaling

1. Use Redis for queue and session storage
2. Use shared artifact storage (S3, NFS)
3. Run multiple API instances behind load balancer

### Resource Requirements

| Component | Min | Recommended |
|-----------|-----|-------------|
| API Server | 256MB RAM, 0.5 CPU | 512MB RAM, 1 CPU |
| Build Worker | 2GB RAM, 2 CPU | 4GB RAM, 4 CPU |
| Redis | 128MB RAM | 256MB RAM |

## Troubleshooting

### Common Issues

**Docker socket permission denied**
```bash
sudo usermod -aG docker $USER
# Or run container with --privileged
```

**Database connection failed**
- Check DATABASE_URL format
- Ensure SSL mode is correct for Neon
- Verify network connectivity

**Build timeout**
- Increase OLLAMA_TIMEOUT for AI generation
- Check Docker daemon status
- Review build logs for errors
