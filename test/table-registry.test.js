/**
 * Test for table registry functionality
 */

// IMPORTANT: Setup logger FIRST before importing any modules that use it
import './helpers/setup-logger.js';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('Table Registry', () => {
  let tableRegistry;

  beforeEach(async () => {
    // Import fresh module for each test
    const { tableRegistry: registry } = await import('../src/mqtt.js');
    tableRegistry = registry;
    tableRegistry.clear(); // Reset for each test
  });

  describe('initialization', () => {
    it('starts as empty Map', () => {
      assert.ok(tableRegistry instanceof Map);
      assert.equal(tableRegistry.size, 0);
    });
  });

  describe('tracking table metadata', () => {
    it('stores table name, subscription count, and retained status', () => {
      tableRegistry.set('mqtt_home', {
        tableName: 'mqtt_home',
        subscriptionCount: 1,
        hasRetained: false
      });

      const entry = tableRegistry.get('mqtt_home');
      assert.equal(entry.tableName, 'mqtt_home');
      assert.equal(entry.subscriptionCount, 1);
      assert.equal(entry.hasRetained, false);
    });

    it('tracks multiple tables independently', () => {
      tableRegistry.set('mqtt_home', {
        tableName: 'mqtt_home',
        subscriptionCount: 2,
        hasRetained: true
      });
      tableRegistry.set('mqtt_sensors', {
        tableName: 'mqtt_sensors',
        subscriptionCount: 1,
        hasRetained: false
      });

      assert.equal(tableRegistry.size, 2);
      assert.equal(tableRegistry.get('mqtt_home').subscriptionCount, 2);
      assert.equal(tableRegistry.get('mqtt_sensors').subscriptionCount, 1);
    });
  });

  describe('updateRetainedStatus', () => {
    it('updates hasRetained flag for existing table', async () => {
      const { updateRetainedStatus } = await import('../src/mqtt.js');

      tableRegistry.set('mqtt_home', {
        tableName: 'mqtt_home',
        subscriptionCount: 1,
        hasRetained: false
      });

      updateRetainedStatus('mqtt_home', true);

      const entry = tableRegistry.get('mqtt_home');
      assert.equal(entry.hasRetained, true);
    });

    it('handles non-existent table gracefully', async () => {
      const { updateRetainedStatus } = await import('../src/mqtt.js');

      // Should not throw
      updateRetainedStatus('mqtt_nonexistent', true);
    });

    it('can toggle retained status', async () => {
      const { updateRetainedStatus } = await import('../src/mqtt.js');

      tableRegistry.set('mqtt_home', {
        tableName: 'mqtt_home',
        subscriptionCount: 1,
        hasRetained: false
      });

      updateRetainedStatus('mqtt_home', true);
      assert.equal(tableRegistry.get('mqtt_home').hasRetained, true);

      updateRetainedStatus('mqtt_home', false);
      assert.equal(tableRegistry.get('mqtt_home').hasRetained, false);
    });
  });
});
