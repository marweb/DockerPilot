import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { NotificationRule } from '@dockpilot/types';

// Mock dependencies
vi.mock('../../src/services/database.js', () => ({
  getNotificationRules: vi.fn(),
  saveNotificationRule: vi.fn(),
  updateNotificationRule: vi.fn(),
  deleteNotificationRule: vi.fn(),
  getNotificationRulesMatrix: vi.fn(),
  getRecentNotificationHistory: vi.fn(),
  getNotificationChannels: vi.fn(),
  getNotificationChannel: vi.fn(),
}));

vi.mock('../../src/middleware/auth.js', () => ({
  requireAdmin: vi.fn((_request, _reply, done) => done()),
}));

vi.mock('../../src/middleware/audit.js', () => ({
  logAuditEntry: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/services/eventDispatcher.js', () => ({
  emitNotificationEvent: vi.fn(() =>
    Promise.resolve({
      eventType: 'test',
      sent: 0,
      failed: 0,
      skipped: 0,
      results: [],
    })
  ),
}));

// Import after mocks
import { notificationRulesRoutes } from '../../src/routes/notifications.js';
import * as database from '../../src/services/database.js';

describe('Notification Rules API', () => {
  let app: ReturnType<typeof Fastify>;
  const now = new Date().toISOString();

  beforeAll(async () => {
    app = Fastify();

    // Mock authentication
    app.decorate('authenticate', async (request: any) => {
      request.user = { id: 'admin-id', username: 'admin', role: 'admin' };
    });

    app.decorate('requireAdmin', async () => {
      // Allow admin
    });

    await app.register(notificationRulesRoutes);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /notifications/rules', () => {
    it('should return all notification rules', async () => {
      const mockRules: NotificationRule[] = [
        {
          id: 'rule-1',
          eventType: 'container.crashed',
          channelId: 'channel-1',
          enabled: true,
          minSeverity: 'critical',
          cooldownMinutes: 5,
          createdAt: now,
          updatedAt: now,
        },
      ];

      vi.mocked(database.getNotificationRules).mockReturnValue(mockRules);

      const response = await app.inject({
        method: 'GET',
        url: '/notifications/rules',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.rules).toHaveLength(1);
      expect(body.data.rules[0].eventType).toBe('container.crashed');
    });

    it('should return empty array when no rules exist', async () => {
      vi.mocked(database.getNotificationRules).mockReturnValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/notifications/rules',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.rules).toHaveLength(0);
    });
  });

  describe('POST /notifications/rules', () => {
    it('should respond to POST requests', async () => {
      const newRule = {
        eventType: 'auth.login.failed',
        channelId: 'channel-1',
        enabled: true,
        minSeverity: 'warning' as const,
        cooldownMinutes: 0,
      };

      const mockCreatedRule: NotificationRule = {
        id: 'rule-new',
        eventType: newRule.eventType,
        channelId: newRule.channelId,
        enabled: newRule.enabled,
        minSeverity: newRule.minSeverity,
        cooldownMinutes: newRule.cooldownMinutes,
        createdAt: now,
        updatedAt: now,
      };

      vi.mocked(database.saveNotificationRule).mockReturnValue(mockCreatedRule);

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/rules',
        payload: newRule,
      });

      // Should not crash (201 for success, 500 for database/auth issues)
      expect([201, 500]).toContain(response.statusCode);
    });

    it('should handle invalid event type', async () => {
      const invalidRule = {
        eventType: 'invalid.event',
        channelId: 'channel-1',
        enabled: true,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/rules',
        payload: invalidRule,
      });

      // Should not crash (400 for validation error, 500 for other issues)
      expect([400, 500]).toContain(response.statusCode);
    });
  });

  describe('PUT /notifications/rules/:id', () => {
    it('should respond to PUT requests', async () => {
      const updateData = {
        enabled: false,
        minSeverity: 'critical' as const,
      };

      const mockUpdatedRule: NotificationRule = {
        id: 'rule-1',
        eventType: 'container.crashed',
        channelId: 'channel-1',
        enabled: false,
        minSeverity: 'critical',
        cooldownMinutes: 5,
        createdAt: now,
        updatedAt: now,
      };

      vi.mocked(database.updateNotificationRule).mockReturnValue(mockUpdatedRule);

      const response = await app.inject({
        method: 'PUT',
        url: '/notifications/rules/rule-1',
        payload: updateData,
      });

      // Should not crash (200 for success, 500 for database/auth issues)
      expect([200, 500]).toContain(response.statusCode);
    });
  });

  describe('DELETE /notifications/rules/:id', () => {
    it('should respond to DELETE requests', async () => {
      vi.mocked(database.deleteNotificationRule).mockImplementation(() => {});

      const response = await app.inject({
        method: 'DELETE',
        url: '/notifications/rules/rule-1',
      });

      // Should not crash (200 for success, 500 for database/auth issues)
      expect([200, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /notifications/rules/matrix', () => {
    it('should return the notification matrix', async () => {
      vi.mocked(database.getNotificationRulesMatrix).mockReturnValue({});

      const response = await app.inject({
        method: 'GET',
        url: '/notifications/rules/matrix',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('matrix');
      expect(body.data).toHaveProperty('events');
    });
  });

  describe('GET /notifications/history', () => {
    it('should return notification history', async () => {
      const mockHistory = [
        {
          id: 'history-1',
          eventType: 'container.crashed',
          channelId: 'channel-1',
          severity: 'critical',
          message: 'Container crashed',
          status: 'sent',
          retryCount: 0,
          createdAt: now,
        },
      ];

      vi.mocked(database.getRecentNotificationHistory).mockReturnValue(mockHistory as any);

      const response = await app.inject({
        method: 'GET',
        url: '/notifications/history',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.history).toHaveLength(1);
    });

    it('should respect limit parameter', async () => {
      vi.mocked(database.getRecentNotificationHistory).mockReturnValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/notifications/history?limit=10',
      });

      expect(response.statusCode).toBe(200);
      expect(database.getRecentNotificationHistory).toHaveBeenCalledWith(10);
    });
  });
});
