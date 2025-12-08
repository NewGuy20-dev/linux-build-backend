import { BuildSpec } from '../ai/schema';
import { Backend, BuildResponse } from './types';

type FetchImplementation = typeof fetch;

class HttpBackendError extends Error {
  public readonly status?: number;
  public readonly responseBody?: unknown;
  public readonly originalError?: unknown;

  constructor(message: string, status?: number, responseBody?: unknown, originalError?: unknown) {
    super(message);
    this.name = 'HttpBackendError';
    this.status = status;
    this.responseBody = responseBody;
    this.originalError = originalError;
  }
}

export class HttpBackend implements Backend {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImplementation;

  constructor(baseUrl: string, fetchImpl?: FetchImplementation) {
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    this.baseUrl = normalizedBase.length ? normalizedBase : baseUrl;
    const resolvedFetch = fetchImpl ?? globalThis.fetch;

    if (!resolvedFetch) {
      throw new Error('fetch is not available in this environment. Provide a custom implementation.');
    }

    this.fetchImpl = resolvedFetch;
  }

  async build(spec: BuildSpec): Promise<BuildResponse> {
    return this.request<BuildResponse>('/api/build', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(spec),
    });
  }

  async getStatus(buildId: string): Promise<unknown> {
    return this.request(`/api/status/${encodeURIComponent(buildId)}`);
  }

  async getLogs(buildId: string): Promise<unknown> {
    return this.request(`/api/logs/${encodeURIComponent(buildId)}`);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: this.mergeHeaders(init),
      });

      const payload = await this.deserialize(response);

      if (!response.ok) {
        throw new HttpBackendError(
          `Request to ${path} failed with status ${response.status}`,
          response.status,
          payload,
        );
      }

      return payload as T;
    } catch (error) {
      if (error instanceof HttpBackendError) {
        throw error;
      }

      throw new HttpBackendError('Failed to reach backend', undefined, undefined, error);
    }
  }

  private async deserialize(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch (error) {
        throw new HttpBackendError('Invalid JSON received from backend', response.status, undefined, error);
      }
    }

    const textPayload = await response.text();
    if (!textPayload) {
      return null;
    }

    try {
      return JSON.parse(textPayload);
    } catch {
      return textPayload;
    }
  }

  private mergeHeaders(init?: RequestInit): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (!init?.headers) {
      return headers;
    }

    const provided = init.headers;

    if (typeof Headers !== 'undefined' && provided instanceof Headers) {
      provided.forEach((value, key) => {
        headers[key] = value;
      });
      return headers;
    }

    if (Array.isArray(provided)) {
      provided.forEach(([key, value]) => {
        headers[key] = value;
      });
      return headers;
    }

    return {
      ...headers,
      ...(provided as Record<string, string>),
    };
  }
}

export { HttpBackendError };
