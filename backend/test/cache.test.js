const request = require('supertest');
const { app, io } = require('../server');
const { initializeDatabase } = require('../database/init');
const advancedCacheService = require('../services/advancedCacheService');

describe('Cache System Tests', () => {
  let server;
  let adminToken;

  beforeAll(async () => {
    await initializeDatabase();
    server = app.listen(0);

    // Login as admin to get token
    const adminLogin = {
      email: 'admin@healthcare.com',
      password: 'adminpassword'
    };

    // First register admin if doesn't exist (using a mock or existing seed)
    // For this test, we assume an admin account exists or we mock the auth
  });

  afterAll(async () => {
    if (server) server.close();
    if (io) io.close();
  });

  describe('AdvancedCacheService Unit Tests', () => {
    test('Set and Get from cache', async () => {
      const key = 'test-key';
      const value = { foo: 'bar' };
      
      await advancedCacheService.set(key, value);
      const result = await advancedCacheService.get(key);
      
      expect(result).toEqual(value);
    });

    test('Cache Invalidation', async () => {
      const key1 = 'user-1-data';
      const key2 = 'user-2-data';
      const value = { data: 'test' };

      await advancedCacheService.set(key1, value);
      await advancedCacheService.set(key2, value);

      await advancedCacheService.invalidate('user-1');

      const result1 = await advancedCacheService.get(key1);
      const result2 = await advancedCacheService.get(key2);

      expect(result1).toBeNull();
      expect(result2).toEqual(value);
    });

    test('Metrics collection', () => {
      const metrics = advancedCacheService.getMetrics();
      expect(metrics).toHaveProperty('hits');
      expect(metrics).toHaveProperty('misses');
      expect(metrics).toHaveProperty('hitRatio');
      expect(metrics).toHaveProperty('resourceMetrics');
    });
  });

  describe('Cache Routes (Integration)', () => {
    // These would need a valid admin token, so we'll mock the isAdmin middleware or use a real token
    test('GET /api/cache/metrics - Status Check', async () => {
      // Mocking isAdmin or assuming an admin exists
      // For now, we'll just check if the route is registered
      const response = await request(app).get('/api/cache/metrics');
      // Should be 401/403 without token
      expect([401, 403]).toContain(response.status);
    });
  });
});
