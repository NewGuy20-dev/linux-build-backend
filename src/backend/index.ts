import 'dotenv/config';
import { HttpBackend } from './httpBackend';
import { LocalBackend } from './localBackend';
import { Backend } from './types';

const createBackend = (): Backend => {
  const mode = (process.env.BACKEND_MODE ?? 'local').toLowerCase();
  if (mode === 'http') {
    const baseUrl = normalizeBaseUrl(
      process.env.BACKEND_BASE_URL ?? process.env.API_BASE_URL ?? 'http://localhost:3000',
    );
    return new HttpBackend(baseUrl);
  }

  return new LocalBackend();
};

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');

let backendInstance: Backend | null = null;

export const getBackend = (): Backend => {
  if (!backendInstance) {
    backendInstance = createBackend();
  }

  return backendInstance;
};

const backend = getBackend();

export default backend;
export { HttpBackend, LocalBackend };
export * from './types';
