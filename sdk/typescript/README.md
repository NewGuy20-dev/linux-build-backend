# Linux Builder TypeScript SDK

Official TypeScript SDK for Linux Builder Engine.

## Installation

```bash
npm install @linuxbuilder/sdk
```

## Quick Start

```typescript
import { createClient } from '@linuxbuilder/sdk';

const client = createClient('your-api-key');

// Start a build
const { buildId } = await client.startBuild({
  base: 'arch',
  init: 'systemd',
  packages: {
    base: ['base', 'linux-lts'],
    utils: ['curl', 'wget'],
  },
});

// Wait for completion
const status = await client.waitForCompletion(buildId);
console.log(`Build ${status.status}`);

// Download artifact
const iso = await client.downloadArtifact(buildId, 'iso');
```

## API Reference

### `createClient(apiKey, baseUrl?)`

Create a new client instance.

### `client.startBuild(spec)`

Start a new build with the given spec.

### `client.getStatus(buildId)`

Get the current status of a build.

### `client.waitForCompletion(buildId, timeoutMs?, pollIntervalMs?)`

Wait for a build to complete.

### `client.downloadArtifact(buildId, type)`

Download a build artifact ('iso' or 'docker').

### `client.runComplianceCheck(buildId, profile)`

Run a compliance check ('hipaa', 'pci-dss', 'soc2').

### `client.listTemplates()`

List available build templates.
