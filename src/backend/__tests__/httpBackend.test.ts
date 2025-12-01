import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpBackend } from '../httpBackend';
import { BuildSpec } from '../../ai/schema';

test('HttpBackend.build issues a POST request to /api/build', async () => {
  const calls: Array<{ input: string; init?: Record<string, unknown> }> = [];

  const fakeFetch: typeof fetch = (async (input: any, init?: any) => {
    calls.push({ input: String(input), init });
    return {
      ok: true,
      status: 202,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({ buildId: 'build-123' }),
      text: async () => JSON.stringify({ buildId: 'build-123' }),
    } as Response;
  }) as any;

  const backend = new HttpBackend('https://example.com', fakeFetch);
  const spec: BuildSpec = {
    base: 'arch',
    packages: ['linux-zen'],
  };

  const response = await backend.build(spec);

  assert.equal(response.buildId, 'build-123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, 'https://example.com/api/build');
  assert.equal((calls[0].init as any)?.method, 'POST');
});
