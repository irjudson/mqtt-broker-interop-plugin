/**
 * Test for wildcard topic functionality
 */

// IMPORTANT: Setup logger FIRST before importing any modules that use it
import './helpers/setup-logger.js';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { topicRegistry } from '../src/mqtt.js';
import { SysTopicsResource, WildcardTopicsResource } from '../src/resources.js';

describe('Wildcard Topics', () => {
  let sysResource;
  let wildcardResource;

  beforeEach(() => {
    sysResource = new SysTopicsResource();
    wildcardResource = new WildcardTopicsResource();

    // Clear and populate topic registry for testing
    topicRegistry.clear();
    topicRegistry.add('home/temperature');
    topicRegistry.add('home/humidity');
    topicRegistry.add('office/light');
    topicRegistry.add('office/door/status');
    topicRegistry.add('garage/door');
  });

  describe('/# wildcard', () => {
    it('returns all non-$SYS topics', () => {
      const result = wildcardResource.get({ path: '/#' });

      assert.equal(result.pattern, '/#');
      assert.equal(result.count, 5);
      assert.ok(result.topics.some(t => t.topic === 'home/temperature'));
      assert.ok(result.topics.some(t => t.topic === 'office/light'));
      assert.ok(!result.topics.some(t => t.topic.startsWith('$SYS/')));
    });

    it('returns empty list when no topics published', () => {
      topicRegistry.clear();
      const result = wildcardResource.get({ path: '/#' });

      assert.equal(result.pattern, '/#');
      assert.equal(result.count, 0);
      assert.equal(result.topics.length, 0);
    });

    it('handles # without leading slash', () => {
      const result = wildcardResource.get({ path: '#' });

      assert.equal(result.pattern, '/#');
      assert.equal(result.count, 5);
    });
  });

  describe('$SYS/# wildcard', () => {
    it('returns all $SYS topics', () => {
      const result = sysResource.get({ path: '$SYS/#' });

      assert.equal(result.pattern, '$SYS/#');
      assert.ok(result.count > 0);
      assert.ok(result.topics.some(t => t.topic === '$SYS/broker/version'));
      assert.ok(result.topics.some(t => t.topic === '$SYS/broker/clients/connected'));
      assert.ok(result.topics.some(t => t.topic === '$SYS/broker/uptime'));
    });

    it('includes values for $SYS topics', () => {
      const result = sysResource.get({ path: '$SYS/#' });

      const versionTopic = result.topics.find(t => t.topic === '$SYS/broker/version');
      assert.ok(versionTopic);
      assert.ok(versionTopic.value);
      assert.ok(versionTopic.timestamp);
    });
  });

  describe('Partial $SYS wildcards', () => {
    it('handles $SYS/broker/clients/# wildcard', () => {
      const result = sysResource.get({ path: '$SYS/broker/clients/#' });

      assert.equal(result.pattern, '$SYS/broker/clients/#');
      assert.ok(result.count > 0);
      assert.ok(result.topics.every(t => t.topic.startsWith('$SYS/broker/clients/')));
      assert.ok(result.topics.some(t => t.topic === '$SYS/broker/clients/connected'));
      assert.ok(result.topics.some(t => t.topic === '$SYS/broker/clients/maximum'));
    });

    it('handles $SYS/broker/load/# wildcard', () => {
      const result = sysResource.get({ path: '$SYS/broker/load/#' });

      assert.equal(result.pattern, '$SYS/broker/load/#');
      assert.ok(result.count > 0);
      assert.ok(result.topics.every(t => t.topic.startsWith('$SYS/broker/load/')));
      assert.ok(result.topics.some(t => t.topic.includes('/1min')));
      assert.ok(result.topics.some(t => t.topic.includes('/5min')));
      assert.ok(result.topics.some(t => t.topic.includes('/15min')));
    });

    it('handles $SYS/broker/messages/# wildcard', () => {
      const result = sysResource.get({ path: '$SYS/broker/messages/#' });

      assert.equal(result.pattern, '$SYS/broker/messages/#');
      assert.ok(result.count > 0);
      assert.ok(result.topics.every(t => t.topic.startsWith('$SYS/broker/messages/')));
      assert.ok(result.topics.some(t => t.topic === '$SYS/broker/messages/received'));
      assert.ok(result.topics.some(t => t.topic === '$SYS/broker/messages/inflight'));
    });
  });

  describe('Individual $SYS topics', () => {
    it('returns individual $SYS topic value', () => {
      const result = sysResource.get({ path: '$SYS/broker/clients/connected' });

      assert.ok(result);
      assert.equal(result.topic, '$SYS/broker/clients/connected');
      assert.ok(result.value !== undefined);
      assert.ok(result.timestamp);
    });

    it('returns uptime in seconds', () => {
      const result = sysResource.get({ path: '$SYS/broker/uptime' });

      assert.ok(result);
      assert.equal(result.topic, '$SYS/broker/uptime');
      assert.ok(typeof result.value === 'number');
      assert.ok(result.value >= 0);
    });

    it('returns heap metrics', () => {
      const currentHeap = sysResource.get({ path: '$SYS/broker/heap/current' });
      const maxHeap = sysResource.get({ path: '$SYS/broker/heap/maximum' });

      assert.ok(currentHeap);
      assert.ok(maxHeap);
      assert.ok(typeof currentHeap.value === 'number');
      assert.ok(typeof maxHeap.value === 'number');
      assert.ok(currentHeap.value > 0);
      assert.ok(maxHeap.value >= currentHeap.value);
    });
  });

  describe('Topic registry tracking', () => {
    it('tracks published topics excluding $SYS', () => {
      // Simulate publishing to various topics
      topicRegistry.clear();
      topicRegistry.add('sensors/temp/living');
      topicRegistry.add('sensors/temp/bedroom');
      topicRegistry.add('lights/kitchen');

      const result = wildcardResource.get({ path: '/#' });

      assert.equal(result.count, 3);
      assert.ok(result.topics.some(t => t.topic === 'sensors/temp/living'));
      assert.ok(result.topics.some(t => t.topic === 'lights/kitchen'));
    });

    it('does not include $SYS topics in /# wildcard', () => {
      // Even if someone tries to add $SYS topics to registry, they shouldn't appear in /#
      topicRegistry.add('test/topic');
      topicRegistry.add('$SYS/broker/test'); // This shouldn't happen in practice

      const result = wildcardResource.get({ path: '/#' });

      assert.ok(result.topics.some(t => t.topic === 'test/topic'));
      assert.ok(!result.topics.some(t => t.topic.startsWith('$SYS/')));
    });
  });
});
