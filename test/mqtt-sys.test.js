/**
 * Tests for MQTT $SYS Topics Implementation
 * Following TDD: Write tests first, watch them fail, then implement
 */

// IMPORTANT: Setup logger FIRST before importing any modules that use it
import './helpers/setup-logger.js';

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

const mqttjs = '../src/mqtt.js';

// Cleanup intervals after all tests to prevent hanging
after(async () => {
  const { metrics } = await import(mqttjs);
  metrics.stopMetricsUpdates();
});

// Phase 1: MqttMetrics class tests

describe('MqttMetrics', () => {
  describe('initialization', () => {
    it('initializes with zero connected clients', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      assert.equal(metrics.clients.connected, 0);
    });

    it('initializes with zero disconnected clients', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      assert.equal(metrics.clients.disconnected, 0);
    });

    it('initializes with zero maximum clients', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      assert.equal(metrics.clients.maximum, 0);
    });

    it('initializes with zero total clients', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      assert.equal(metrics.clients.total, 0);
    });

    it('initializes with zero messages received', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      assert.equal(metrics.messages.received, 0);
    });

    it('initializes with zero messages sent', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      assert.equal(metrics.messages.sent, 0);
    });

    it('initializes with zero publish messages received', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      assert.equal(metrics.messages.publishReceived, 0);
    });

    it('initializes with zero publish messages sent', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      assert.equal(metrics.messages.publishSent, 0);
    });

    it('initializes with zero bytes received', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      assert.equal(metrics.bytes.received, 0);
    });

    it('initializes with zero bytes sent', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      assert.equal(metrics.bytes.sent, 0);
    });

    it('initializes with zero subscriptions', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      assert.equal(metrics.subscriptions.count, 0);
    });

    it('initializes with zero retained messages', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      assert.equal(metrics.retained.count, 0);
    });

    it('initializes with start time', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const before = new Date();
      const metrics = new MqttMetrics();
      const after = new Date();

      assert.ok(metrics.startTime instanceof Date);
      assert.ok(metrics.startTime >= before && metrics.startTime <= after);
    });
  });

  describe('onConnect', () => {
    it('increments connected clients', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onConnect('client1', false);

      assert.equal(metrics.clients.connected, 1);
    });

    it('updates total clients', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onConnect('client1', false);

      assert.equal(metrics.clients.total, 1);
    });

    it('tracks maximum concurrent clients', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onConnect('client1', false);
      metrics.onConnect('client2', false);

      assert.equal(metrics.clients.maximum, 2);
    });

    it('does not decrease maximum when client disconnects', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onConnect('client1', false);
      metrics.onConnect('client2', false);
      metrics.onDisconnect('client1', false);

      assert.equal(metrics.clients.maximum, 2);
    });
  });

  describe('onDisconnect', () => {
    it('decrements connected clients', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onConnect('client1', false);
      metrics.onDisconnect('client1', false);

      assert.equal(metrics.clients.connected, 0);
    });

    it('increments disconnected clients when persistent session', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onConnect('client1', true);
      metrics.onDisconnect('client1', true);

      assert.equal(metrics.clients.disconnected, 1);
    });

    it('does not increment disconnected clients when not persistent', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onConnect('client1', false);
      metrics.onDisconnect('client1', false);

      assert.equal(metrics.clients.disconnected, 0);
    });

    it('updates total clients correctly', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onConnect('client1', true);
      metrics.onConnect('client2', false);
      metrics.onDisconnect('client1', true);

      assert.equal(metrics.clients.total, 2); // 1 connected + 1 disconnected
    });
  });

  describe('onPublishReceived', () => {
    it('increments messages received', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onPublishReceived({ topic: 'test' }, 100);

      assert.equal(metrics.messages.received, 1);
    });

    it('increments publish messages received', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onPublishReceived({ topic: 'test' }, 100);

      assert.equal(metrics.messages.publishReceived, 1);
    });

    it('adds to bytes received', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onPublishReceived({ topic: 'test' }, 100);

      assert.equal(metrics.bytes.received, 100);
    });

    it('accumulates bytes received', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onPublishReceived({ topic: 'test1' }, 100);
      metrics.onPublishReceived({ topic: 'test2' }, 50);

      assert.equal(metrics.bytes.received, 150);
    });
  });

  describe('onPublishSent', () => {
    it('increments messages sent', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onPublishSent({ topic: 'test' }, 100);

      assert.equal(metrics.messages.sent, 1);
    });

    it('increments publish messages sent', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onPublishSent({ topic: 'test' }, 100);

      assert.equal(metrics.messages.publishSent, 1);
    });

    it('adds to bytes sent', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onPublishSent({ topic: 'test' }, 100);

      assert.equal(metrics.bytes.sent, 100);
    });
  });

  describe('onSubscribe', () => {
    it('increments subscription count', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onSubscribe('client1', 'test/topic');

      assert.equal(metrics.subscriptions.count, 1);
    });
  });

  describe('onUnsubscribe', () => {
    it('decrements subscription count', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onSubscribe('client1', 'test/topic');
      metrics.onUnsubscribe('client1', 'test/topic');

      assert.equal(metrics.subscriptions.count, 0);
    });
  });

  describe('onRetainedMessageAdded', () => {
    it('increments retained message count', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onRetainedMessageAdded();

      assert.equal(metrics.retained.count, 1);
    });
  });

  describe('onRetainedMessageRemoved', () => {
    it('decrements retained message count', async () => {
      const { MqttMetrics } = await import(mqttjs);
      const metrics = new MqttMetrics();

      metrics.onRetainedMessageAdded();
      metrics.onRetainedMessageRemoved();

      assert.equal(metrics.retained.count, 0);
    });
  });
});

// Phase 2: SysTopics Resource class tests

describe('SysTopics', () => {
  describe('static topics', () => {
    it('returns version for $SYS/broker/version', async () => {
      const { SysTopics } = await import(mqttjs);
      const sys = new SysTopics();

      const result = sys.get({ path: '$SYS/broker/version' });

      assert.ok(typeof result === 'string');
      assert.ok(result.length > 0);
    });

    it('returns timestamp for $SYS/broker/timestamp', async () => {
      const { SysTopics } = await import(mqttjs);
      const sys = new SysTopics();

      const result = sys.get({ path: '$SYS/broker/timestamp' });

      assert.ok(typeof result === 'string');
      // Should be ISO 8601 format
      assert.ok(result.includes('T'));
    });
  });

  describe('client metrics', () => {
    it('returns connected clients for $SYS/broker/clients/connected', async () => {
      const { SysTopics, metrics } = await import(mqttjs);
      const sys = new SysTopics();
      metrics.clients.connected = 5;

      const result = sys.get({ path: '$SYS/broker/clients/connected' });

      assert.equal(result, 5);
    });

    it('returns disconnected clients for $SYS/broker/clients/disconnected', async () => {
      const { SysTopics, metrics } = await import(mqttjs);
      const sys = new SysTopics();
      metrics.clients.disconnected = 3;

      const result = sys.get({ path: '$SYS/broker/clients/disconnected' });

      assert.equal(result, 3);
    });

    it('returns maximum clients for $SYS/broker/clients/maximum', async () => {
      const { SysTopics, metrics } = await import(mqttjs);
      const sys = new SysTopics();
      metrics.clients.maximum = 10;

      const result = sys.get({ path: '$SYS/broker/clients/maximum' });

      assert.equal(result, 10);
    });

    it('returns total clients for $SYS/broker/clients/total', async () => {
      const { SysTopics, metrics } = await import(mqttjs);
      const sys = new SysTopics();
      metrics.clients.total = 8;

      const result = sys.get({ path: '$SYS/broker/clients/total' });

      assert.equal(result, 8);
    });
  });

  describe('message metrics', () => {
    it('returns messages received for $SYS/broker/messages/received', async () => {
      const { SysTopics, metrics } = await import(mqttjs);
      const sys = new SysTopics();
      metrics.messages.received = 100;

      const result = sys.get({ path: '$SYS/broker/messages/received' });

      assert.equal(result, 100);
    });

    it('returns messages sent for $SYS/broker/messages/sent', async () => {
      const { SysTopics, metrics } = await import(mqttjs);
      const sys = new SysTopics();
      metrics.messages.sent = 200;

      const result = sys.get({ path: '$SYS/broker/messages/sent' });

      assert.equal(result, 200);
    });

    it('returns publish messages received for $SYS/broker/publish/messages/received', async () => {
      const { SysTopics, metrics } = await import(mqttjs);
      const sys = new SysTopics();
      metrics.messages.publishReceived = 80;

      const result = sys.get({ path: '$SYS/broker/publish/messages/received' });

      assert.equal(result, 80);
    });

    it('returns publish messages sent for $SYS/broker/publish/messages/sent', async () => {
      const { SysTopics, metrics } = await import(mqttjs);
      const sys = new SysTopics();
      metrics.messages.publishSent = 150;

      const result = sys.get({ path: '$SYS/broker/publish/messages/sent' });

      assert.equal(result, 150);
    });
  });

  describe('bandwidth metrics', () => {
    it('returns bytes received for $SYS/broker/bytes/received', async () => {
      const { SysTopics, metrics } = await import(mqttjs);
      const sys = new SysTopics();
      metrics.bytes.received = 1024;

      const result = sys.get({ path: '$SYS/broker/bytes/received' });

      assert.equal(result, 1024);
    });

    it('returns bytes sent for $SYS/broker/bytes/sent', async () => {
      const { SysTopics, metrics } = await import(mqttjs);
      const sys = new SysTopics();
      metrics.bytes.sent = 2048;

      const result = sys.get({ path: '$SYS/broker/bytes/sent' });

      assert.equal(result, 2048);
    });
  });

  describe('subscription metrics', () => {
    it('returns subscription count for $SYS/broker/subscriptions/count', async () => {
      const { SysTopics, metrics } = await import(mqttjs);
      const sys = new SysTopics();
      metrics.subscriptions.count = 12;

      const result = sys.get({ path: '$SYS/broker/subscriptions/count' });

      assert.equal(result, 12);
    });

    it('returns retained message count for $SYS/broker/retained messages/count', async () => {
      const { SysTopics, metrics } = await import(mqttjs);
      const sys = new SysTopics();
      metrics.retained.count = 5;

      const result = sys.get({ path: '$SYS/broker/retained messages/count' });

      assert.equal(result, 5);
    });
  });

  describe('unknown topics', () => {
    it('returns null for unknown topic', async () => {
      const { SysTopics } = await import(mqttjs);
      const sys = new SysTopics();

      const result = sys.get({ path: '$SYS/unknown/topic' });

      assert.equal(result, null);
    });
  });
});
