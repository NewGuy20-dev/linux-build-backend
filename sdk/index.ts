export interface BuildSpec {
  base: string;
  packages?: string[] | Record<string, string[]>;
  kernel?: { version?: string };
  init?: string;
  customization?: Record<string, any>;
  securityFeatures?: Record<string, any>;
}

export interface BuildResponse {
  buildId: string;
  spec: BuildSpec;
}

export interface BuildStatus {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  downloadUrls?: { dockerImage?: string; isoDownloadUrl?: string };
}

export class LinuxBuilderClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(options: { baseUrl: string; apiKey: string }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}`, ...options.headers },
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }

  async startBuild(spec: BuildSpec): Promise<BuildResponse> {
    return this.request('/api/build/start', { method: 'POST', body: JSON.stringify(spec) });
  }

  async generateFromPrompt(prompt: string): Promise<{ spec: BuildSpec }> {
    return this.request('/api/build/generate', { method: 'POST', body: JSON.stringify({ prompt }) });
  }

  async getStatus(buildId: string): Promise<BuildStatus> {
    return this.request(`/api/build/status/${buildId}`);
  }

  async waitForCompletion(buildId: string, timeout = 600000): Promise<BuildStatus> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const status = await this.getStatus(buildId);
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status.status)) return status;
      await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('Build timeout');
  }

  async listPresets(): Promise<{ presets: string[] }> {
    return this.request('/api/presets');
  }

  async listTemplates(): Promise<{ templates: any[] }> {
    return this.request('/api/templates');
  }
}

export default LinuxBuilderClient;
