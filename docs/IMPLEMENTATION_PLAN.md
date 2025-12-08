# Linux Builder Engine - Implementation Plan

## Executive Summary

This document outlines the complete system design and implementation plan for integrating the enhanced Modelfile schema (114 keywords, 25 categories) into the Linux Builder Engine backend.

**Goal:** Transform natural language OS build prompts into fully functional, bootable Linux ISOs.

**Current State:** Basic schema supporting 4 distros, limited package installation.

**Target State:** Full schema supporting 8 distros, security hardening, AI/ML packages, services, encryption, and customization.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Component Design](#2-component-design)
3. [Data Flow](#3-data-flow)
4. [Schema Design](#4-schema-design)
5. [Build Pipeline](#5-build-pipeline)
6. [Implementation Phases](#6-implementation-phases)
7. [Package Resolution](#7-package-resolution)
8. [Security Configuration](#8-security-configuration)
9. [Error Handling](#9-error-handling)
10. [API Reference](#10-api-reference)

---

## 1. System Architecture

### 1.1 High-Level Architecture

```mermaid
flowchart TB
    subgraph Clients
        WebUI[Web UI]
        CLI[CLI Tool]
    end

    subgraph API["API Layer (Express.js)"]
        REST[REST Endpoints]
        WS[WebSocket Server]
        Valid[Request Validation]
    end

    subgraph AI["AI Layer"]
        Ollama[Ollama Server]
        Model[qwen3:1.7b + Modelfile]
        Schema[Zod Schema Validator]
    end

    subgraph Builder["Builder Layer"]
        PkgRes[Package Resolver]
        DockerGen[Dockerfile Generator]
        ConfigGen[Config Generators]
    end

    subgraph Executor["Executor Layer"]
        Lifecycle[Build Lifecycle]
        DockerCLI[Docker CLI]
        ISOGen[ISO Generator]
    end

    subgraph Storage["Storage Layer"]
        DB[(Neon PostgreSQL)]
        Artifacts[Artifact Storage]
    end

    WebUI --> REST
    CLI --> REST
    REST --> Valid
    Valid --> Ollama
    Ollama --> Model
    Model --> Schema
    Schema --> PkgRes
    PkgRes --> DockerGen
    DockerGen --> ConfigGen
    ConfigGen --> Lifecycle
    Lifecycle --> DockerCLI
    DockerCLI --> ISOGen
    ISOGen --> Artifacts
    Lifecycle --> DB
    Lifecycle --> WS
    WS --> Clients
```

### 1.2 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Node.js (LTS) | Server runtime |
| Language | TypeScript | Type safety |
| Framework | Express.js | REST API |
| Database | Neon PostgreSQL | Serverless DB |
| ORM | Prisma | Database access |
| Validation | Zod | Schema validation |
| AI | Ollama + qwen3:1.7b | Prompt parsing |
| Containers | Docker CLI | Image building |
| WebSocket | ws | Real-time updates |

### 1.3 Directory Structure

```
src/
├── index.ts                 # Entry point
├── api/
│   └── build.controller.ts  # REST endpoints
├── ai/
│   └── schema.ts            # Zod schemas (EXPAND)
├── builder/
│   ├── dockerfileGenerator.ts  # Dockerfile creation (EXPAND)
│   ├── isoGenerator.ts         # ISO creation (EXPAND)
│   └── packageMaps.ts          # NEW: Package mappings
├── executor/
│   └── lifecycle.ts         # Build orchestration (EXPAND)
├── utils/
│   ├── sanitizer.ts         # Input sanitization
│   ├── packages.ts          # Package utilities
│   ├── securityConfig.ts    # NEW: Security configs
│   ├── serviceConfig.ts     # NEW: Service configs
│   └── shellConfig.ts       # NEW: Shell configs
├── ws/
│   └── index.ts             # WebSocket server
└── db/
    └── index.ts             # Prisma client
```

---

## 2. Component Design

### 2.1 Component Interaction

```mermaid
sequenceDiagram
    participant C as Client
    participant API as REST API
    participant DB as Database
    participant AI as Ollama
    participant PR as Package Resolver
    participant DG as Dockerfile Generator
    participant CG as Config Generator
    participant D as Docker
    participant ISO as ISO Generator
    participant WS as WebSocket

    C->>API: POST /api/build/start {prompt}
    API->>DB: Create UserBuild (status: pending)
    API->>C: {buildId}
    
    API->>AI: Parse prompt
    AI-->>API: JSON BuildSpec
    
    API->>API: Validate with Zod
    API->>DB: Update spec
    
    API->>PR: Resolve packages
    PR-->>API: Distro-specific packages
    
    API->>DG: Generate Dockerfile
    DG->>CG: Get security/service configs
    CG-->>DG: Config files
    DG-->>API: Dockerfile + configs
    
    API->>D: docker build
    D-->>WS: Build logs
    WS-->>C: Real-time logs
    D-->>API: Image ID
    
    API->>ISO: Generate ISO
    ISO-->>WS: ISO progress
    ISO-->>API: ISO path
    
    API->>DB: Save artifact, status: complete
    WS-->>C: Build complete
```

### 2.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| REST API | Request handling, routing, response formatting |
| Zod Schema | Input validation, type inference |
| Ollama | NL prompt → JSON conversion |
| Package Resolver | Abstract package → distro-specific mapping |
| Dockerfile Generator | Create Dockerfiles per distro |
| Config Generators | Security, service, shell configurations |
| Build Lifecycle | Orchestrate build steps, error handling |
| Docker CLI | Execute docker build commands |
| ISO Generator | Create bootable ISOs from images |
| WebSocket | Real-time progress streaming |
| Prisma | Database operations |



---

## 3. Data Flow

### 3.1 Request Flow

```mermaid
flowchart TD
    A[User Prompt] --> B[API Receives Request]
    B --> C[Create DB Record]
    C --> D[Send to Ollama]
    D --> E{Valid JSON?}
    E -->|No| F[Retry with Guidance]
    F --> D
    E -->|Yes| G[Zod Validation]
    G --> H{Schema Valid?}
    H -->|No| I[Return Validation Error]
    H -->|Yes| J[Cross-Field Validation]
    J --> K{Compatible?}
    K -->|No| L[Return Compatibility Error]
    K -->|Yes| M[Package Resolution]
    M --> N[Dockerfile Generation]
    N --> O[Config Generation]
    O --> P[Docker Build]
    P --> Q{Build Success?}
    Q -->|No| R[Log Error & Retry/Fail]
    Q -->|Yes| S[ISO Generation]
    S --> T{ISO Success?}
    T -->|No| R
    T -->|Yes| U[Upload Artifacts]
    U --> V[Mark Complete]
```

### 3.2 Data Transformation Pipeline

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Natural Lang   │     │   Structured    │     │    Resolved     │
│     Prompt      │ ──▶ │      JSON       │ ──▶ │      Spec       │
│                 │     │   (BuildSpec)   │     │  (with distro   │
│ "Arch-based,    │     │ {base: "arch",  │     │   packages)     │
│  hyprland..."   │     │  display:...}   │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
    [Ollama]              [Zod Schema]          [Package Resolver]
                                                        │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   ISO Artifact  │     │  Docker Image   │     │   Dockerfile    │
│                 │ ◀── │                 │ ◀── │   + Configs     │
│  bootable.iso   │     │  linux-build:x  │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
   [ISO Generator]         [Docker CLI]        [Dockerfile Gen]
```

---

## 4. Schema Design

### 4.1 BuildSpec Class Diagram

```mermaid
classDiagram
    class BuildSpec {
        +string name
        +string base
        +string architecture
        +Kernel kernel
        +string init
        +Filesystem filesystem
        +Display display
        +Packages packages
        +SecurityFeatures securityFeatures
        +Services services
        +Backup backup
        +Customization customization
        +PostInstall postInstall
        +Defaults defaults
    }

    class Kernel {
        +string version
        +string[] customFlags
        +Modules modules
    }

    class Modules {
        +string[] enable
        +string[] disable
    }

    class Filesystem {
        +string root
        +string encryption
        +boolean compression
        +Snapshots snapshots
        +Partition[] partitions
        +boolean lvm
        +boolean raid
    }

    class Snapshots {
        +boolean enabled
        +string interval
        +number retention
    }

    class Partition {
        +string mount
        +string size
        +boolean encrypted
    }

    class Display {
        +string server
        +string compositor
        +string bar
        +string launcher
        +string terminal
        +string theme
        +string notifications
    }

    class Packages {
        +string[] base
        +string[] development
        +string[] ai_ml
        +string[] security
        +string[] networking
        +string[] databases
        +string[] servers
        +string[] multimedia
        +string[] utils
    }

    class SecurityFeatures {
        +string[] mac
        +Firewall firewall
        +SSH ssh
        +Updates updates
        +string[] kernelHardening
    }

    class Firewall {
        +string backend
        +string policy
        +FirewallRule[] rules
    }

    class SSH {
        +boolean fail2ban
        +number maxRetries
        +string banTime
    }

    class Services {
        +ServiceConfig[] databases
        +ServiceConfig[] monitoring
        +ServiceConfig[] ai
    }

    class Backup {
        +string tool
        +string schedule
        +Retention retention
        +string[] destinations
    }

    class Customization {
        +string shell
        +string shellFramework
        +string shellTheme
        +Bootloader bootloader
        +Dotfiles dotfiles
    }

    class PostInstall {
        +string[] scripts
        +SystemTuning systemTuning
        +string[] services
    }

    BuildSpec --> Kernel
    BuildSpec --> Filesystem
    BuildSpec --> Display
    BuildSpec --> Packages
    BuildSpec --> SecurityFeatures
    BuildSpec --> Services
    BuildSpec --> Backup
    BuildSpec --> Customization
    BuildSpec --> PostInstall
    Kernel --> Modules
    Filesystem --> Snapshots
    Filesystem --> Partition
    SecurityFeatures --> Firewall
    SecurityFeatures --> SSH
    Customization --> Bootloader
    Customization --> Dotfiles
```

### 4.2 Supported Values

| Field | Valid Values |
|-------|--------------|
| base | arch, debian, ubuntu, alpine, fedora, opensuse, void, gentoo |
| architecture | x86_64, aarch64 |
| kernel.version | linux-lts, linux-zen, linux-hardened |
| init | systemd, openrc, runit, s6 |
| filesystem.root | ext4, btrfs, xfs, zfs |
| filesystem.encryption | luks1, luks2, null |
| display.server | wayland, xorg, null |
| display.compositor | hyprland, sway, i3, gnome, kde, xfce, dwm, bspwm |
| securityFeatures.mac | apparmor, selinux |
| securityFeatures.firewall.backend | nftables, iptables, ufw |
| customization.shell | zsh, bash, fish |
| backup.tool | borg, restic |

### 4.3 Cross-Field Validation Rules

```mermaid
flowchart TD
    A[BuildSpec] --> B{Check Constraints}
    
    B --> C{MAC Conflict?}
    C -->|selinux + apparmor| D[ERROR: Pick one MAC]
    C -->|OK| E{Display Conflict?}
    
    E -->|hyprland + xorg| F[ERROR: Hyprland needs Wayland]
    E -->|i3 + wayland| G[ERROR: i3 needs Xorg]
    E -->|OK| H{Distro Compat?}
    
    H -->|zfs + alpine| I[WARN: Poor ZFS support]
    H -->|selinux + arch| J[WARN: SELinux complex on Arch]
    H -->|OK| K{Init Compat?}
    
    K -->|runit + fedora| L[ERROR: Runit not available]
    K -->|OK| M[Validation Passed]
```


---

## 5. Build Pipeline

### 5.1 Pipeline Stages

```mermaid
flowchart LR
    subgraph Stage1[Stage 1: Parse]
        A1[Receive Prompt] --> A2[Ollama Parse]
        A2 --> A3[JSON Output]
    end

    subgraph Stage2[Stage 2: Validate]
        B1[Zod Validation] --> B2[Cross-Field Check]
        B2 --> B3[Distro Compat Check]
    end

    subgraph Stage3[Stage 3: Resolve]
        C1[Package Mapping] --> C2[Availability Check]
        C2 --> C3[Resolved Spec]
    end

    subgraph Stage4[Stage 4: Generate]
        D1[Dockerfile] --> D2[Security Configs]
        D2 --> D3[Service Configs]
        D3 --> D4[Shell Configs]
    end

    subgraph Stage5[Stage 5: Build]
        E1[Docker Build] --> E2[Tag Image]
        E2 --> E3[Push Registry]
    end

    subgraph Stage6[Stage 6: ISO]
        F1[Extract Rootfs] --> F2[Install Kernel]
        F2 --> F3[Setup Filesystem]
        F3 --> F4[Bootloader]
        F4 --> F5[Generate ISO]
    end

    subgraph Stage7[Stage 7: Deliver]
        G1[Upload Artifact] --> G2[Update DB]
        G2 --> G3[Notify Client]
    end

    Stage1 --> Stage2 --> Stage3 --> Stage4 --> Stage5 --> Stage6 --> Stage7
```

### 5.2 Dockerfile Generation Flow

```mermaid
flowchart TD
    A[BuildSpec] --> B{Select Base Distro}
    
    B -->|arch| C1[FROM archlinux:latest]
    B -->|debian| C2[FROM debian:latest]
    B -->|ubuntu| C3[FROM ubuntu:latest]
    B -->|alpine| C4[FROM alpine:latest]
    B -->|fedora| C5[FROM fedora:latest]
    B -->|opensuse| C6[FROM opensuse/tumbleweed]
    B -->|void| C7[FROM voidlinux/voidlinux]
    B -->|gentoo| C8[FROM gentoo/stage3]
    
    C1 & C2 & C3 & C4 & C5 & C6 & C7 & C8 --> D[System Update]
    
    D --> E[Install Base Packages]
    E --> F[Install Dev Packages]
    F --> G[Install Security Packages]
    G --> H[Install AI/ML Packages]
    H --> I[Install Networking]
    I --> J[Configure Shell]
    J --> K[Configure Services]
    K --> L[Apply Security Hardening]
    L --> M[Copy Config Files]
    M --> N[Set Entrypoint]
```

### 5.3 ISO Generation Flow

```mermaid
flowchart TD
    A[Docker Image] --> B[Export Container]
    B --> C[Extract Rootfs]
    
    C --> D{Select Kernel}
    D -->|lts| E1[linux-lts]
    D -->|zen| E2[linux-zen]
    D -->|hardened| E3[linux-hardened]
    
    E1 & E2 & E3 --> F[Install Kernel to Rootfs]
    
    F --> G{Filesystem Type}
    G -->|ext4| H1[mkfs.ext4 config]
    G -->|btrfs| H2[btrfs subvol config]
    G -->|xfs| H3[mkfs.xfs config]
    G -->|zfs| H4[zpool config]
    
    H1 & H2 & H3 & H4 --> I{Encryption?}
    I -->|luks2| J1[LUKS setup script]
    I -->|luks1| J2[LUKS1 setup script]
    I -->|none| J3[Skip encryption]
    
    J1 & J2 & J3 --> K{Bootloader}
    K -->|grub| L1[GRUB config]
    K -->|systemd-boot| L2[systemd-boot config]
    
    L1 & L2 --> M[Inject Post-Install Scripts]
    M --> N[Generate Squashfs]
    N --> O[Create ISO with xorriso]
    O --> P[ISO Artifact]
```

### 5.4 Build Status States

```mermaid
stateDiagram-v2
    [*] --> pending: Build Created
    pending --> parsing: Start Processing
    parsing --> validating: JSON Received
    parsing --> failed: Parse Error
    validating --> resolving: Schema Valid
    validating --> failed: Validation Error
    resolving --> generating: Packages Resolved
    generating --> building: Dockerfile Ready
    building --> iso_generating: Image Built
    building --> failed: Docker Error
    iso_generating --> uploading: ISO Created
    iso_generating --> failed: ISO Error
    uploading --> complete: Artifact Saved
    complete --> [*]
    failed --> [*]
```


---

## 6. Implementation Phases

### 6.1 Phase Overview

```mermaid
gantt
    title Implementation Timeline
    dateFormat  YYYY-MM-DD
    section Phase 1
    Schema Expansion           :p1, 2024-01-01, 2d
    section Phase 2
    Package Resolution         :p2, after p1, 2d
    section Phase 3
    Dockerfile Generator       :p3, after p2, 3d
    section Phase 4
    ISO Generator              :p4, after p3, 3d
    section Phase 5
    Utility Modules            :p5, after p2, 2d
    section Phase 6
    Build Lifecycle            :p6, after p4, 2d
    section Phase 7
    Database Updates           :p7, after p6, 1d
    section Phase 8
    Testing                    :p8, after p7, 3d
```

### 6.2 Phase 1: Schema Expansion

**File:** `src/ai/schema.ts`

**Tasks:**
1. Add base distro enum (8 distros)
2. Add kernel schema with version, flags, modules
3. Add filesystem schema with encryption, snapshots
4. Expand securityFeatures with firewall, SSH, MAC
5. Add packages object with categories
6. Add services schema for databases, monitoring, AI
7. Add backup schema
8. Add customization schema (shell, bootloader, dotfiles)
9. Add postInstall schema
10. Implement cross-field validation

**Deliverables:**
- Expanded Zod schema matching Modelfile output
- Type exports for all new interfaces
- Validation error messages

---

### 6.3 Phase 2: Package Resolution

**New File:** `src/builder/packageMaps.ts`

**Tasks:**
1. Create package manager mapping per distro
2. Create abstract → distro package mapping (100+ packages)
3. Create package availability matrix
4. Implement resolution function with warnings
5. Handle special packages (AUR, PPAs, etc.)

**Package Manager Map:**
```typescript
const PACKAGE_MANAGERS = {
  arch:     { install: "pacman -S --noconfirm", update: "pacman -Syu --noconfirm" },
  debian:   { install: "apt-get install -y",    update: "apt-get update" },
  ubuntu:   { install: "apt-get install -y",    update: "apt-get update" },
  alpine:   { install: "apk add --no-cache",    update: "apk update" },
  fedora:   { install: "dnf install -y",        update: "dnf update -y" },
  opensuse: { install: "zypper install -y",     update: "zypper refresh" },
  void:     { install: "xbps-install -y",       update: "xbps-install -Su" },
  gentoo:   { install: "emerge",                update: "emerge --sync" }
};
```

**Deliverables:**
- Package mapping for all 114 keywords
- Resolution function returning distro-specific packages
- Warnings for unavailable packages

---

### 6.4 Phase 3: Dockerfile Generator Expansion

**File:** `src/builder/dockerfileGenerator.ts`

**Tasks:**
1. Add Fedora generator (dnf)
2. Add OpenSUSE generator (zypper)
3. Add Void generator (xbps)
4. Add Gentoo generator (emerge with binpkgs)
5. Refactor to use package resolver
6. Add security package installation
7. Add shell customization steps
8. Add service configuration per init system
9. Add config file copying

**Generator Structure:**
```mermaid
flowchart TD
    A[generateDockerfile] --> B{spec.base}
    B --> C[generateArchDockerfile]
    B --> D[generateDebianDockerfile]
    B --> E[generateUbuntuDockerfile]
    B --> F[generateAlpineDockerfile]
    B --> G[generateFedoraDockerfile]
    B --> H[generateOpensuseDockerfile]
    B --> I[generateVoidDockerfile]
    B --> J[generateGentooDockerfile]
    
    C & D & E & F & G & H & I & J --> K[Common Post-Processing]
    K --> L[Add Security Steps]
    L --> M[Add Shell Setup]
    M --> N[Add Service Config]
    N --> O[Final Dockerfile]
```

---

### 6.5 Phase 4: ISO Generator Enhancement

**File:** `src/builder/isoGenerator.ts`

**Tasks:**
1. Add kernel selection per distro
2. Add filesystem setup scripts
3. Add LUKS encryption setup
4. Add btrfs subvolume creation
5. Add bootloader configuration (GRUB/systemd-boot)
6. Add post-install script injection
7. Add Plymouth splash support

**Kernel Packages:**
```typescript
const KERNELS = {
  arch:   { lts: "linux-lts", zen: "linux-zen", hardened: "linux-hardened" },
  debian: { lts: "linux-image-amd64" },
  ubuntu: { lts: "linux-image-generic" },
  fedora: { lts: "kernel" },
  alpine: { lts: "linux-lts" },
  void:   { lts: "linux" },
  gentoo: { lts: "gentoo-kernel-bin" }
};
```

---

### 6.6 Phase 5: Utility Modules

**New Files:**

**`src/utils/securityConfig.ts`**
- `generateFirewallRules(spec)` → nftables/iptables config
- `generateFail2banConfig(spec)` → jail.local
- `generateSSHConfig(spec)` → sshd_config
- `generateAppArmorProfile(spec)` → basic profiles

**`src/utils/serviceConfig.ts`**
- `getEnableCommand(service, init)` → enable command per init
- `getDisableCommand(service, init)` → disable command
- `generateServiceConfig(service)` → config files

**`src/utils/shellConfig.ts`**
- `generateZshSetup(spec)` → oh-my-zsh install
- `generateStarshipConfig(spec)` → starship.toml
- `generateShellRc(spec)` → .zshrc/.bashrc

---

### 6.7 Phase 6: Build Lifecycle Updates

**File:** `src/executor/lifecycle.ts`

**Tasks:**
1. Add new build steps enum
2. Add validation step with cross-field checks
3. Add package resolution step
4. Add config generation step
5. Enhance progress reporting
6. Add detailed error messages
7. Update artifact metadata

**Build Steps:**
```typescript
enum BuildStep {
  PENDING = "pending",
  PARSING = "parsing",
  VALIDATING = "validating",
  RESOLVING = "resolving",
  GENERATING = "generating",
  BUILDING = "building",
  ISO_GENERATING = "iso_generating",
  UPLOADING = "uploading",
  COMPLETE = "complete",
  FAILED = "failed"
}
```

---

### 6.8 Phase 7: Database Updates

**File:** `prisma/schema.prisma`

**Tasks:**
1. Add new fields to UserBuild model
2. Create migration
3. Update Prisma client

**New Fields:**
```prisma
model UserBuild {
  // Existing fields...
  
  // New fields
  baseDistro     String?
  kernelVersion  String?
  initSystem     String?
  securityLevel  String?   // minimal, standard, hardened
  featuresJson   Json?     // Full expanded spec
  buildDuration  Int?      // Seconds
  warnings       String[]  // Build warnings
}
```

---

### 6.9 Implementation Dependencies

```mermaid
flowchart TD
    P1[Phase 1: Schema] --> P2[Phase 2: Package Maps]
    P1 --> P3[Phase 3: Dockerfile Gen]
    P2 --> P3
    P1 --> P5[Phase 5: Utilities]
    P3 --> P4[Phase 4: ISO Gen]
    P5 --> P3
    P5 --> P4
    P4 --> P6[Phase 6: Lifecycle]
    P3 --> P6
    P6 --> P7[Phase 7: Database]
    P7 --> P8[Phase 8: Testing]
```


---

## 7. Package Resolution

### 7.1 Resolution Flow

```mermaid
flowchart TD
    A[Abstract Package Name] --> B{In Package Map?}
    B -->|Yes| C[Get Distro Entry]
    B -->|No| D[Use Original Name]
    
    C --> E{Entry Exists for Distro?}
    E -->|Yes| F{Is null?}
    E -->|No| G[Use Fallback/Original]
    
    F -->|Yes| H[Add Warning: Unavailable]
    F -->|No| I[Return Mapped Name]
    
    D --> J[Return Original]
    G --> J
    H --> K[Skip Package]
    I --> L[Add to Install List]
    J --> L
```

### 7.2 Package Categories

| Category | Example Packages | Count |
|----------|------------------|-------|
| development | docker, git, python, nodejs, rust, go | 20 |
| ai_ml | cuda, pytorch, tensorflow, ollama, jupyter | 12 |
| security | apparmor, selinux, nftables, fail2ban | 16 |
| networking | networkmanager, wireguard, tailscale | 10 |
| databases | postgresql, mysql, redis, mongodb | 6 |
| servers | nginx, apache, caddy | 4 |
| multimedia | ffmpeg, pipewire, gstreamer | 8 |
| utils | yay, flatpak, neofetch | 10 |

### 7.3 Sample Package Mappings

```typescript
// Development packages
docker:    { arch: "docker", debian: "docker.io", fedora: "docker-ce", alpine: "docker" }
nodejs:    { arch: "nodejs", debian: "nodejs", fedora: "nodejs", alpine: "nodejs" }
python:    { arch: "python", debian: "python3", fedora: "python3", alpine: "python3" }
rust:      { arch: "rust", debian: "rustc", fedora: "rust", alpine: "rust" }

// Security packages  
apparmor:  { arch: "apparmor", debian: "apparmor", ubuntu: "apparmor", fedora: null }
selinux:   { arch: null, debian: "selinux-basics", fedora: "selinux-policy" }
nftables:  { arch: "nftables", debian: "nftables", fedora: "nftables", alpine: "nftables" }

// AI/ML packages
cuda:      { arch: "cuda", debian: "nvidia-cuda-toolkit", ubuntu: "nvidia-cuda-toolkit" }
pytorch:   { arch: "python-pytorch-cuda", debian: "python3-torch", ubuntu: "python3-torch" }
```


---

## 8. Security Configuration

### 8.1 Security Stack Flow

```mermaid
flowchart TD
    A[SecurityFeatures Spec] --> B{MAC System}
    B -->|apparmor| C[AppArmor Setup]
    B -->|selinux| D[SELinux Setup]
    B -->|none| E[Skip MAC]
    
    C --> C1[Install apparmor]
    C1 --> C2[Enable service]
    C2 --> C3[Load profiles]
    
    D --> D1[Install selinux-policy]
    D1 --> D2[Set enforcing]
    D2 --> D3[Relabel filesystem]
    
    A --> F{Firewall Backend}
    F -->|nftables| G[nftables Config]
    F -->|iptables| H[iptables Config]
    F -->|ufw| I[UFW Config]
    
    G --> G1[Generate ruleset]
    G1 --> G2[Apply default policy]
    G2 --> G3[Add port rules]
    
    A --> J{SSH Hardening}
    J -->|fail2ban| K[Fail2ban Setup]
    J -->|none| L[Skip]
    
    K --> K1[Install fail2ban]
    K1 --> K2[Configure jail.local]
    K2 --> K3[Set ban time/retries]
    
    A --> M{Kernel Hardening}
    M -->|enabled| N[Apply sysctl]
    N --> N1[KASLR]
    N --> N2[Stack protector]
    N --> N3[Restrict dmesg]
```

### 8.2 Firewall Rule Generation

```mermaid
flowchart LR
    A[Firewall Spec] --> B[Default Policy]
    B --> C{Policy Type}
    C -->|deny| D[Drop all incoming]
    C -->|allow| E[Accept all incoming]
    
    D --> F[Process Rules]
    E --> F
    
    F --> G[For each rule]
    G --> H{Action}
    H -->|allow| I[Add ACCEPT rule]
    H -->|deny| J[Add DROP rule]
    
    I --> K[Specify port/protocol]
    J --> K
    K --> L[Output Config File]
```

### 8.3 Security Levels

| Level | Features Enabled |
|-------|------------------|
| minimal | Basic firewall only |
| standard | Firewall + fail2ban + auto-updates |
| hardened | MAC + firewall + fail2ban + kernel hardening + encryption |


---

## 9. Error Handling

### 9.1 Error Categories

```mermaid
flowchart TD
    A[Error Occurs] --> B{Error Type}
    
    B -->|Parse Error| C[Ollama failed to produce JSON]
    C --> C1[Retry with simplified prompt]
    C1 --> C2{Retry count < 3?}
    C2 -->|Yes| C3[Retry]
    C2 -->|No| C4[Fail with parse_error]
    
    B -->|Validation Error| D[Schema validation failed]
    D --> D1[Return field-specific errors]
    D1 --> D2[Suggest corrections]
    
    B -->|Compatibility Error| E[Cross-field conflict]
    E --> E1[Identify conflicting fields]
    E1 --> E2[Suggest alternatives]
    
    B -->|Package Error| F[Package unavailable]
    F --> F1[Add warning]
    F1 --> F2[Continue without package]
    
    B -->|Docker Error| G[Build failed]
    G --> G1[Capture logs]
    G1 --> G2[Identify failure point]
    G2 --> G3[Suggest fix]
    
    B -->|ISO Error| H[ISO generation failed]
    H --> H1[Capture logs]
    H1 --> H2[Check disk space]
    H2 --> H3[Verify dependencies]
```

### 9.2 Error Response Format

```typescript
interface BuildError {
  code: string;           // e.g., "VALIDATION_ERROR"
  message: string;        // Human-readable message
  field?: string;         // Which field caused error
  suggestion?: string;    // How to fix
  details?: object;       // Additional context
}
```

### 9.3 Common Errors

| Code | Cause | Resolution |
|------|-------|------------|
| PARSE_ERROR | Ollama output invalid JSON | Retry or simplify prompt |
| VALIDATION_ERROR | Schema mismatch | Check field values |
| COMPAT_ERROR | Conflicting options | Remove one option |
| PKG_UNAVAILABLE | Package not in distro | Use alternative |
| DOCKER_BUILD_FAIL | Dockerfile error | Check logs |
| ISO_GEN_FAIL | ISO tools failed | Check dependencies |

---

## 10. API Reference

### 10.1 Endpoints

#### POST /api/build/start

Start a new build from prompt or spec.

**Request:**
```json
{
  "prompt": "Arch-based, hyprland, security-hardened...",
  // OR
  "spec": { "base": "arch", ... }
}
```

**Response:**
```json
{
  "buildId": "clx1234567890",
  "status": "pending",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### GET /api/build/status/:id

Get build status and progress.

**Response:**
```json
{
  "id": "clx1234567890",
  "status": "building",
  "step": "docker_build",
  "progress": 65,
  "logs": ["Installing packages...", "..."],
  "warnings": ["Package X unavailable, skipped"],
  "spec": { ... }
}
```

#### GET /api/build/artifact/:id

Get artifact download URL.

**Response:**
```json
{
  "id": "clx1234567890",
  "type": "iso",
  "url": "https://storage.example.com/builds/xxx.iso",
  "size": 1073741824,
  "checksum": "sha256:abc123..."
}
```

### 10.2 WebSocket Events

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket

    C->>WS: Connect /ws?buildId=xxx
    WS-->>C: {"event": "connected"}
    
    loop Build Progress
        WS-->>C: {"event": "progress", "step": "building", "percent": 45}
        WS-->>C: {"event": "log", "message": "Installing docker..."}
    end
    
    WS-->>C: {"event": "complete", "artifactUrl": "..."}
    
    Note over C,WS: Or on failure
    WS-->>C: {"event": "error", "code": "DOCKER_BUILD_FAIL", "message": "..."}
```

---

## 11. File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/ai/schema.ts` | MODIFY | Expand BuildSpec schema |
| `src/builder/packageMaps.ts` | CREATE | Package resolution maps |
| `src/builder/dockerfileGenerator.ts` | MODIFY | Add 4 distros, refactor |
| `src/builder/isoGenerator.ts` | MODIFY | Kernel, encryption, bootloader |
| `src/utils/securityConfig.ts` | CREATE | Security config generators |
| `src/utils/serviceConfig.ts` | CREATE | Service config generators |
| `src/utils/shellConfig.ts` | CREATE | Shell setup generators |
| `src/executor/lifecycle.ts` | MODIFY | New build steps |
| `prisma/schema.prisma` | MODIFY | New UserBuild fields |

---

## 12. Success Metrics

- [ ] All 8 base distros build successfully
- [ ] All 114 keywords map to correct JSON fields
- [ ] Cross-field validation catches all conflicts
- [ ] Security hardening applies correctly
- [ ] ISO boots and installs successfully
- [ ] Build completes in < 15 minutes (non-Gentoo)
- [ ] WebSocket provides real-time updates
- [ ] Error messages are actionable

---

## Appendix A: Full Keyword Reference

See `Modelfile` for complete keyword taxonomy (114 keywords, 25 categories).

## Appendix B: Package Mapping Table

Full package mappings will be in `src/builder/packageMaps.ts`.

---

*Document Version: 1.0*
*Last Updated: 2024*
