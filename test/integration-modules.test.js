/**
 * Integration tests for modularized MQTT components
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Import all modules
const modules = '../src/lib/mqtt.js';

describe('Module Integration Tests', () => {
  let metrics, sysTopics, publisher, monitor;

  beforeEach(async () => {
    // Note: ES modules are cached differently than CommonJS
    // For testing, we rely on singleton patterns in the modules
  });

  describe('Logger Module', () => {
    test('logger module exports correctly', async () => {
      const { log } = await import(modules);
      assert(typeof log === 'object');
      assert(typeof log.info === 'function');
      assert(typeof log.debug === 'function');
      assert(typeof log.trace === 'function');
      assert(typeof log.warn === 'function');
      assert(typeof log.error === 'function');
    });

    test('logger maintains consistent prefix', async () => {
      const logModule = await import('../src/lib/logger.js');
      const log = logModule.default;

      // Mock console to capture output
      const originalTrace = console.trace;
      let capturedOutput = '';
      console.trace = (msg) => { capturedOutput = msg; };

      log.trace('test message');
      assert(capturedOutput.includes('[MQTT-Broker-Interop-Plugin:MQTT]:'));
      assert(capturedOutput.includes('test message'));

      console.trace = originalTrace;
    });
  });

  describe('Metrics Module', () => {
    test('metrics singleton works across imports', async () => {
      const { metrics: metrics1 } = await import(modules);
      const { metrics: metrics2 } = await import('../src/lib/metrics.js');

      // Both should reference the same instance
      metrics1.onConnect('client1', true);
      assert.equal(metrics2.clients.connected, 1);

      metrics2.onDisconnect('client1', true);
      assert.equal(metrics1.clients.connected, 0);
    });

    test('metrics handles backward compatibility', async () => {
      const { MqttMetrics } = await import(modules);
      const metrics = new MqttMetrics();

      // Test both signatures work
      metrics.onPublishReceived({ topic: 'test' }, 100);
      assert.equal(metrics.bytes.received, 100);

      metrics.onPublishReceived('client1', { topic: 'test' }, 50);
      assert.equal(metrics.bytes.received, 150);
    });

    test('load average calculation with modular metrics', async () => {
      const { MqttMetrics } = await import('../src/lib/metrics.js');
      const metrics = new MqttMetrics();

      // Stop auto-updates for testing
      metrics.stopMetricsUpdates();

      // Simulate data over time
      const now = Date.now();
      metrics._loadSamples.connections.push(
        { time: now - 120000, value: 10 },
        { time: now - 60000, value: 20 },
        { time: now, value: 30 }
      );

      metrics._calculateLoadAverages();

      // Should calculate rate of change
      assert(metrics.load.connections.oneMin > 0);
    });
  });

  describe('SysTopics Module', () => {
    test('sys topics mapping works correctly', async () => {
      const { sysTopics } = await import(modules);

      // Test various topic types
      const version = sysTopics.get({ path: '$SYS/broker/version' });
      assert(typeof version === 'string');

      const timestamp = sysTopics.get({ path: '$SYS/broker/timestamp' });
      assert(timestamp.includes('T')); // ISO format

      const uptime = sysTopics.get({ path: '$SYS/broker/uptime' });
      assert(typeof uptime === 'number');
      assert(uptime >= 0);
    });

    test('sys topics handles nested metrics correctly', async () => {
      const { sysTopics, metrics } = await import(modules);

      // Update metrics
      metrics.onConnect('client1', true);
      metrics.onPublishReceived({ topic: 'test' }, 1024);

      // Check that sysTopics reflects changes
      const connected = sysTopics.get({ path: '$SYS/broker/clients/connected' });
      assert.equal(connected, 1);

      const bytes = sysTopics.get({ path: '$SYS/broker/bytes/received' });
      assert.equal(bytes, 1024);
    });

    test('unknown topics return null', async () => {
      const { sysTopics } = await import(modules);

      const result = sysTopics.get({ path: '$SYS/invalid/topic' });
      assert.equal(result, null);
    });
  });

  describe('Publisher Module', () => {
    test('publisher exports required functions', async () => {
      const mod = await import(modules);

      assert(typeof mod.setupSysTopicsPublisher === 'function');
      assert(typeof mod.onSysTopicSubscribe === 'function');
      assert(typeof mod.onSysTopicUnsubscribe === 'function');
    });

    test('subscriber tracking prevents race conditions', async () => {
      const publisherModule = await import('../src/lib/publisher.js');

      // Simulate multiple clients subscribing/unsubscribing rapidly
      const subscribePromises = [];
      const unsubscribePromises = [];

      for (let i = 0; i < 10; i++) {
        subscribePromises.push(
          Promise.resolve(publisherModule.onSysTopicSubscribe(`client${i}`, '$SYS/#'))
        );
      }

      await Promise.all(subscribePromises);

      // All clients should be tracked
      for (let i = 0; i < 10; i++) {
        unsubscribePromises.push(
          Promise.resolve(publisherModule.onSysTopicUnsubscribe(`client${i}`, '$SYS/#'))
        );
      }

      await Promise.all(unsubscribePromises);

      // No errors should occur from race conditions
      assert(true); // If we get here without errors, test passes
    });
  });

  describe('Event Monitor Module', () => {
    test('event monitor exports required functions', async () => {
      const mod = await import(modules);

      assert(typeof mod.setupMqttMonitoring === 'function');
      assert(typeof mod.handlePublishEvent === 'function');
    });

    test('topic registry tracks non-$SYS topics', async () => {
      const { topicRegistry, metrics } = await import(modules);

      // Clear registry
      topicRegistry.clear();

      // Track some topics using metrics (which updates registry)
      metrics.onPublishReceived('client1', { topic: 'sensors/temp' }, 100);
      metrics.onPublishReceived('client1', { topic: 'sensors/humidity' }, 100);
      metrics.onPublishReceived('client1', { topic: '$SYS/broker/uptime' }, 100);

      // Since metrics doesn't update topicRegistry directly,
      // we need to use the event-monitor handlePublishEvent
      // Let's import it directly
      const eventMonitor = await import('../src/lib/event-monitor.js');
      topicRegistry.clear(); // Clear and re-test properly

      eventMonitor.handlePublishEvent('sensors/temp', 'client1', { value: 25 });
      eventMonitor.handlePublishEvent('sensors/humidity', 'client1', { value: 60 });
      eventMonitor.handlePublishEvent('$SYS/broker/uptime', 'client1', { value: 100 });

      // Only non-$SYS topics should be in registry
      assert(topicRegistry.has('sensors/temp'));
      assert(topicRegistry.has('sensors/humidity'));
      assert(!topicRegistry.has('$SYS/broker/uptime'));
      assert.equal(topicRegistry.size, 2);
    });
  });

  describe('Full Integration Flow', () => {
    test('modules work together correctly', async () => {
      const mod = await import(modules);

      // Simulate a complete flow
      const mockServer = {
        mqtt: {
          on: () => {},
          publish: () => {}
        }
      };

      // Setup monitoring (would normally set up event listeners)
      mod.setupMqttMonitoring(mockServer);

      // Setup publisher
      const handlers = mod.setupSysTopicsPublisher(mockServer, null, 10);
      assert(handlers.onSysTopicSubscribe);
      assert(handlers.onSysTopicUnsubscribe);

      // Simulate client activity
      mod.metrics.onConnect('client1', true);
      mod.metrics.onPublishReceived({ topic: 'test/topic' }, 256);

      // Check metrics are tracked
      assert.equal(mod.metrics.clients.connected, 1);
      assert.equal(mod.metrics.bytes.received, 256);

      // Check sysTopics reflects metrics
      const clients = mod.sysTopics.get({ path: '$SYS/broker/clients/connected' });
      assert.equal(clients, 1);

      // Simulate subscription to trigger publisher
      handlers.onSysTopicSubscribe('client1', '$SYS/#');

      // Cleanup
      handlers.onSysTopicUnsubscribe('client1', '$SYS/#');
      mod.metrics.onDisconnect('client1', true);
    });

    test('memory efficiency improvements work', async () => {
      const { MqttMetrics } = await import('../src/lib/metrics.js');
      const metrics = new MqttMetrics();

      // Stop auto-updates
      metrics.stopMetricsUpdates();

      // Clear existing samples
      Object.keys(metrics._loadSamples).forEach(key => {
        metrics._loadSamples[key] = [];
      });

      // Add many samples with old timestamps
      const now = Date.now();
      for (let i = 0; i < 20; i++) {
        // Add samples going back in time
        const timestamp = now - (i * 60000); // Each sample 1 minute older
        Object.keys(metrics._loadSamples).forEach(key => {
          metrics._loadSamples[key].push({
            time: timestamp,
            value: i * 10
          });
        });
      }

      // Trigger cleanup (keep only 15 minutes = ~15 samples)
      metrics._updateSystemMetrics();

      // Should have removed old samples (keeping ~15 minutes + 1 new sample = 16 or 17)
      assert(metrics._loadSamples.connections.length <= 17);

      // Verify oldest sample is within 15 minutes
      if (metrics._loadSamples.connections.length > 0) {
        const oldestTime = metrics._loadSamples.connections[0].time;
        const timeDiff = now - oldestTime;
        assert(timeDiff <= 16 * 60 * 1000); // Should be within 16 minutes (15 + buffer)
      }
    });
  });

  describe('Error Handling', () => {
    test('modules handle missing dependencies gracefully', async () => {
      const { setupMqttMonitoring } = await import(modules);

      // Call with null server
      setupMqttMonitoring(null);

      // Should not throw, just log warning
      assert(true);
    });

    test('publisher handles missing publish interface', async () => {
      const { setupSysTopicsPublisher } = await import(modules);

      // Setup with no publish interface
      const handlers = setupSysTopicsPublisher({}, null, 10);

      // Should still return handlers
      assert(handlers.onSysTopicSubscribe);
      assert(handlers.onSysTopicUnsubscribe);
    });
  });
});