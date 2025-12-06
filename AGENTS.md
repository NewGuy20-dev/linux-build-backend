# AGENTS.md

## Project Overview

Linux Builder Engine Backend - A service that generates custom Linux OS builds using Docker containers.

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **ORM:** Prisma with Neon PostgreSQL (serverless adapter)
- **WebSockets:** ws package
- **Validation:** Zod
- **Container Runtime:** Docker CLI

## Commands

```bash
# Install dependencies
npm install

# Development server (with hot reload)
npm run dev

# Build TypeScript
npm run build

# Type check (lint)
npm run lint

# Database migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate
```

## Project Structure

```
src/
├── index.ts          # Express server entry point
├── api/              # REST API routes
├── ai/               # AI-related logic
├── backend/          # Backend services
├── builder/          # Build orchestration
├── client/           # Client utilities
├── db/               # Database/Prisma client
├── executor/         # Docker execution logic
├── utils/            # Shared utilities
└── ws/               # WebSocket server
prisma/
└── schema.prisma     # Database schema
artifacts/            # Build output artifacts
temp/                 # Temporary build files
```

## Code Conventions

- Use TypeScript with strict mode enabled
- CommonJS module system (`"type": "commonjs"`)
- Target ES2020
- Use Zod for request validation
- Use cuid2 for ID generation
- Prefer async/await over callbacks

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - Neon PostgreSQL connection string
- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)

## API Endpoints

- `POST /api/build/start` - Start a new build
- `GET /api/build/status/:id` - Get build status
- `GET /api/build/artifact/:id` - Get artifact URL

## Database Models

- `UserBuild` - Build records with status and spec
- `BuildLog` - Log entries per build
- `BuildArtifact` - Output artifacts per build
