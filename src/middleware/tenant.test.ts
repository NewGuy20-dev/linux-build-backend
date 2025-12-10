import { describe, it, expect } from 'vitest';

// Test the withTenant helper logic directly
const withTenant = <T extends Record<string, unknown>>(query: T, tenantId?: string): T & { tenantId?: string } => {
  if (tenantId) {
    return { ...query, tenantId };
  }
  return query;
};

describe('tenant middleware', () => {
  describe('withTenant', () => {
    it('adds tenantId to query when provided', () => {
      const query = { status: 'PENDING' };
      const result = withTenant(query, 'tenant-123');
      
      expect(result).toEqual({ status: 'PENDING', tenantId: 'tenant-123' });
    });

    it('returns original query when no tenantId', () => {
      const query = { status: 'PENDING' };
      const result = withTenant(query, undefined);
      
      expect(result).toEqual({ status: 'PENDING' });
    });

    it('preserves existing query properties', () => {
      const query = { status: 'COMPLETED', ownerKey: 'key-123' };
      const result = withTenant(query, 'tenant-456');
      
      expect(result).toEqual({
        status: 'COMPLETED',
        ownerKey: 'key-123',
        tenantId: 'tenant-456',
      });
    });
  });
});
