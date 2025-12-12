# Linux Builder GitLab CI Integration

Build custom Linux images in your GitLab CI/CD pipelines.

## Quick Start

1. Add your API key as a CI/CD variable: `LINUX_BUILDER_API_KEY`

2. Include the template in your `.gitlab-ci.yml`:

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/linuxbuilder/integrations/main/gitlab-ci/linux-builder.gitlab-ci.yml'

stages:
  - build

linux-build:
  extends: .linux-builder
  stage: build
```

## Configuration

Set these CI/CD variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LINUX_BUILDER_API_KEY` | Yes | - | Your API key |
| `LINUX_BUILDER_API_URL` | No | `https://api.linuxbuilder.io` | API URL |
| `LINUX_BUILDER_SPEC_FILE` | No | `build-spec.json` | Spec file path |
| `LINUX_BUILDER_TIMEOUT` | No | `1800` | Timeout in seconds |

## Outputs

The job creates a `build.env` artifact with:

- `BUILD_ID` - The build ID
- `DOCKER_IMAGE` - Docker image reference (if available)
- `ISO_URL` - ISO download URL (if available)

## Custom Job Example

```yaml
build-production:
  extends: .linux-builder
  stage: build
  variables:
    LINUX_BUILDER_SPEC_FILE: "production-spec.json"
    LINUX_BUILDER_TIMEOUT: "3600"
  rules:
    - if: $CI_COMMIT_TAG
```
