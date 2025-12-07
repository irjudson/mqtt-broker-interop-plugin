/**
 * Performance monitoring tests
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Performance Monitoring', () => {
  test('performance monitor tracks topic resolution', async () => {
    const { sysTopics, performanceMonitor } = await import('../src/mqtt.js');

    // Reset performance metrics
    performanceMonitor.reset();

    // Perform multiple topic resolutions
    for (let i = 0; i < 10; i++) {
      sysTopics.get({ path: '$SYS/broker/clients/connected' });
      sysTopics.get({ path: '$SYS/broker/messages/received' });
    }

    // Check that performance was tracked
    const report = performanceMonitor.getReport();
    assert.equal(report.topicResolution.count, 20);
    assert(report.topicResolution.avgTime >= 0);
    assert(report.topicResolution.minTime <= report.topicResolution.maxTime);
  });

  test('performance monitor tracks load calculations', async () => {
    const { MqttMetrics } = await import('../src/lib/metrics.js');
    const performanceMonitor = (await import('../src/mqtt.js')).default;

    const metrics = new MqttMetrics();
    metrics.stopMetricsUpdates(); // Stop automatic updates

    // Reset performance metrics
    performanceMonitor.reset();

    // Trigger load calculation
    metrics._calculateLoadAverages();

    // Check that performance was tracked
    const report = performanceMonitor.getReport();
    assert(report.loadCalculation.count > 0);
    assert(report.loadCalculation.avgTime >= 0);
  });

  test('performance monitor tracks memory operations', async () => {
    const { MqttMetrics } = await import('../src/lib/metrics.js');
    const performanceMonitor = (await import('../src/mqtt.js')).default;

    const metrics = new MqttMetrics();
    metrics.stopMetricsUpdates();

    // Reset performance metrics
    performanceMonitor.reset();

    // Add samples that will trigger cleanup
    const now = Date.now();
    // Add old samples (more than 15 minutes old) first
    for (let i = 19; i >= 0; i--) {
      Object.keys(metrics._loadSamples).forEach(key => {
        metrics._loadSamples[key].push({
          time: now - ((i + 1) * 60000), // Samples going back 20 minutes
          value: i
        });
      });
    }

    // Trigger cleanup
    metrics._updateSystemMetrics();

    // Check that memory operations were tracked
    const report = performanceMonitor.getReport();
    assert(report.memoryOperations.spliceOperations > 0);
    assert(report.memoryOperations.samplesRemoved > 0);
  });

  test('performance monitor tracks subscriber operations', async () => {
    const { onSysTopicSubscribe, onSysTopicUnsubscribe, performanceMonitor } = await import('../src/mqtt.js');
    const { setupSysTopicsPublisher } = await import('../src/lib/publisher.js');

    // Setup publisher
    setupSysTopicsPublisher({}, null, 10);

    // Reset performance metrics
    performanceMonitor.reset();

    // Test subscriber operations
    onSysTopicSubscribe('client1', '$SYS/#');
    onSysTopicSubscribe('client2', '$SYS/#');
    onSysTopicSubscribe('client1', '$SYS/#'); // Duplicate - should be prevented

    // Check that operations were tracked
    const report = performanceMonitor.getReport();
    assert(report.subscriberOperations.setOperations >= 3);
    assert(report.subscriberOperations.duplicatePrevented >= 1);

    // Clean up
    onSysTopicUnsubscribe('client1', '$SYS/#');
    onSysTopicUnsubscribe('client2', '$SYS/#');
  });

  test('performance report includes improvement descriptions', async () => {
    const { performanceMonitor } = await import('../src/mqtt.js');

    const report = performanceMonitor.getReport();

    // Check that improvement descriptions are included
    assert(report.topicResolution.improvement.includes('O(1)'));
    assert(report.loadCalculation.improvement.includes('accurate'));
    assert(report.memoryOperations.improvement.includes('7x less'));
    assert(report.subscriberOperations.improvement.includes('race conditions'));
  });

  test('memory trend tracking works', async () => {
    const performanceMonitor = (await import('../src/mqtt.js')).default;

    // Reset and add some memory snapshots
    performanceMonitor.memorySnapshots = [];

    const baseHeap = 10000000; // 10MB
    for (let i = 0; i < 5; i++) {
      performanceMonitor.memorySnapshots.push({
        timestamp: Date.now() + (i * 60000),
        heapUsed: baseHeap + (i * 100000), // Growing by 100KB each minute
        heapTotal: baseHeap * 2,
        external: 0,
        arrayBuffers: 0
      });
    }

    const memoryTrend = performanceMonitor.getMemoryTrend();

    assert.equal(memoryTrend.samples, 5);
    assert(memoryTrend.heapGrowth > 0);
    assert(memoryTrend.trend === 'increasing');
    assert(memoryTrend.heapGrowthRate > 0);
  });

  test('performance monitor can be reset', async () => {
    const { performanceMonitor, sysTopics } = await import('../src/mqtt.js');

    // Perform some operations
    sysTopics.get({ path: '$SYS/broker/uptime' });

    // Get initial report
    const report1 = performanceMonitor.getReport();
    assert(report1.topicResolution.count > 0);

    // Reset
    performanceMonitor.reset();

    // Get new report
    const report2 = performanceMonitor.getReport();
    assert.equal(report2.topicResolution.count, 0);
    assert.equal(report2.memoryOperations.spliceOperations, 0);
    assert.equal(report2.subscriberOperations.setOperations, 0);
  });
});
