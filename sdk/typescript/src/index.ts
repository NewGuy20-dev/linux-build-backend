export interface BuildSpec {
  base: string;
  init?: string;
  kernel?: { version: string };
  packages: Record<string, string[]>;
  customization?: Record<string, any>;
  securityFeatures?: Record<string, any>;
  filesystem?: Record<string, any>;
}

export interface BuildStatus {
  id: string;
  status: 'PENDING' | 'BUILDING' | 'SUCCESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  baseDistro: string;
  createdAt: string;
  updatedAt: string;
  buildDuration?: number;
  downloadUrls?: {
    dockerImage?: string;
    dockerTarDownloadUrl?: string;
    isoDownloadUrl?: string;
  };
  logs?: Array<{ message: string; level: string; createdAt: string }>;
}

export interface ComplianceResult {
  profile: string;
  passed: boolean;
  score: number;
  results: Array<{ id: string; description: string; passed: boolean; details: string }>;
}

export interface LinuxBuilderOptions {
  apiKey: string;
  baseUrl?: string;
}

export class LinuxBuilderClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: LinuxBuilderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.linuxbuilder.io';
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error.error || res.statusText);
    }

    return res.json();
  }

  async startBuild(spec: BuildSpec): Promise<{ buildId: string; spec: BuildSpec }> {
    return this.request('/api/build/start', {
      method: 'POST',
      body: JSON.stringify(spec),
    });
  }

  async getStatus(buildId: string): Promise<BuildStatus> {
    return this.request(`/api/build/status/${buildId}`);
  }

  async waitForCompletion(buildId: string, timeoutMs = 1800000, pollIntervalMs = 5000): Promise<BuildStatus> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const status = await this.getStatus(buildId);

      if (['SUCCESS', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(status.status)) {
        return status;
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    throw new Error(`Build timed out after ${timeoutMs}ms`);
  }

  async downloadArtifact(buildId: string, type: 'iso' | 'docker'): Promise<ArrayBuffer> {
    const res = await fetch(`${this.baseUrl}/api/build/download/${buildId}/${type}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });

    if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);

    return res.arrayBuffer();
  }

  async runComplianceCheck(buildId: string, profile: 'hipaa' | 'pci-dss' | 'soc2'): Promise<ComplianceResult> {
    return this.request(`/api/compliance/check/${buildId}`, {
      method: 'POST',
      body: JSON.stringify({ profile }),
    });
  }

  async listTemplates(): Promise<{ presets: string[]; details: Record<string, any> }> {
    return this.request('/api/templates/presets');
  }

  async getTemplate(name: string): Promise<{ preset: any }> {
    return this.request(`/api/templates/presets/${name}`);
  }
}

// Convenience function
export const createClient = (apiKey: string, baseUrl?: string): LinuxBuilderClient => {
  return new LinuxBuilderClient({ apiKey, baseUrl });
};
