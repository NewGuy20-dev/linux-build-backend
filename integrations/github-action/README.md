# Linux Builder GitHub Action

Build custom Linux images in your GitHub Actions workflow.

## Usage

```yaml
- name: Build Linux Image
  uses: linuxbuilder/github-action@v1
  with:
    api-key: ${{ secrets.LINUX_BUILDER_API_KEY }}
    spec-file: 'build-spec.json'
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | Yes | - | Linux Builder API key |
| `spec-file` | No | `build-spec.json` | Path to build spec JSON |
| `api-url` | No | `https://api.linuxbuilder.io` | API URL |
| `wait` | No | `true` | Wait for build completion |
| `timeout` | No | `1800` | Timeout in seconds |
| `compliance` | No | - | Run compliance check (hipaa, pci-dss, soc2) |

## Outputs

| Output | Description |
|--------|-------------|
| `build-id` | The build ID |
| `status` | Build status |
| `docker-image` | Docker image reference |
| `iso-url` | ISO download URL |
| `compliance-score` | Compliance score if check was run |

## Example with Compliance

```yaml
- name: Build Secure Linux Image
  uses: linuxbuilder/github-action@v1
  with:
    api-key: ${{ secrets.LINUX_BUILDER_API_KEY }}
    spec-file: 'secure-build.json'
    compliance: 'hipaa'
```
