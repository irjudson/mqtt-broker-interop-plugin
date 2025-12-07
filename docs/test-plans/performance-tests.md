# Performance Test Plan

## Overview
Performance tests verify the broker can handle expected loads efficiently and identify optimization opportunities.

## Test Categories

### 1. Message Throughput
**Goal**: Measure messages per second the broker can handle

Tests:
- [ ] Single publisher, no subscribers
- [ ] Single publisher, single subscriber
- [ ] Multiple publishers (10, 100, 1000), single subscriber
- [ ] Single publisher, multiple subscribers (10, 100, 1000)
- [ ] Many-to-many (100 publishers, 100 subscribers)

Metrics to track:
- Messages/second published
- Messages/second delivered
- End-to-end latency (publish → receive)
- CPU usage
- Memory usage
- Database I/O

### 2. Connection Scaling
**Goal**: Verify broker can handle many concurrent connections

Tests:
- [ ] Connect 100 idle clients
- [ ] Connect 1,000 idle clients
- [ ] Connect 10,000 idle clients
- [ ] Rapid connect/disconnect (connection churn)

Metrics to track:
- Connection establishment time
- Memory per connection
- CPU usage at different connection counts
- Maximum connections before failure

### 3. Topic Scaling
**Goal**: Verify performance with many topics and tables

Tests:
- [ ] Publish to 100 different topics
- [ ] Publish to 1,000 different topics
- [ ] Subscribe to 100 wildcard patterns
- [ ] Measure table creation overhead

Metrics to track:
- Topic lookup performance
- Table creation time
- Database size growth
- Query performance with many tables

### 4. Wildcard Subscription Performance
**Goal**: Measure wildcard matching efficiency

Tests:
- [ ] `#` wildcard with 1,000 topics
- [ ] 100 wildcard subscriptions matching same message
- [ ] Complex wildcard patterns (`a/+/b/+/c`)

Metrics to track:
- Wildcard matching time
- Message fan-out overhead
- Memory usage for subscription tracking

### 5. $SYS Metrics Performance
**Goal**: Verify metrics don't impact broker performance

Tests:
- [ ] Metrics collection overhead (with/without)
- [ ] $SYS topic update frequency impact
- [ ] Load average calculation overhead

Metrics to track:
- CPU usage for metrics calculation
- Memory overhead for metrics storage
- Impact on message throughput

### 6. Retained Message Performance
**Goal**: Measure retained message handling efficiency

Tests:
- [ ] Store 1,000 retained messages
- [ ] New subscriber receives all retained messages
- [ ] Clear 1,000 retained messages

Metrics to track:
- Retained message storage size
- Delivery time for retained messages
- Database query performance

## Performance Monitoring Implementation

### Metrics to Collect
```javascript
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      messageCount: 0,
      startTime: Date.now(),
      latencies: [],
      memorySnapshots: []
    };
  }

  recordMessage(latencyMs) {
    this.metrics.messageCount++;
    this.metrics.latencies.push(latencyMs);
  }

  getReport() {
    const duration = (Date.now() - this.metrics.startTime) / 1000;
    const throughput = this.metrics.messageCount / duration;
    const avgLatency = this.metrics.latencies.reduce((a, b) => a + b, 0) / this.metrics.latencies.length;
    const p95Latency = this.calculatePercentile(this.metrics.latencies, 95);
    const p99Latency = this.calculatePercentile(this.metrics.latencies, 99);

    return {
      duration,
      messageCount: this.metrics.messageCount,
      messagesPerSecond: throughput,
      latency: {
        avg: avgLatency,
        p95: p95Latency,
        p99: p99Latency
      },
      memory: {
        current: process.memoryUsage().heapUsed,
        max: Math.max(...this.metrics.memorySnapshots)
      }
    };
  }

  calculatePercentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index];
  }
}
```

### Test Harness
```javascript
import mqtt from 'mqtt';

async function benchmarkPublish(opts) {
  const { clientCount, messageCount, topic } = opts;
  const monitor = new PerformanceMonitor();

  const clients = Array.from({ length: clientCount }, (_, i) =>
    mqtt.connect('mqtt://localhost:1883', { clientId: `bench-pub-${i}` })
  );

  // Wait for all connections
  await Promise.all(clients.map(c => waitForConnect(c)));

  const start = Date.now();

  // Publish messages
  for (let i = 0; i < messageCount; i++) {
    const client = clients[i % clientCount];
    const publishStart = Date.now();

    await new Promise((resolve) => {
      client.publish(topic, `message-${i}`, () => {
        monitor.recordMessage(Date.now() - publishStart);
        resolve();
      });
    });
  }

  const report = monitor.getReport();
  console.log(JSON.stringify(report, null, 2));

  // Cleanup
  clients.forEach(c => c.end());
}
```

## Performance Baselines

Target performance characteristics:
- **Throughput**: >10,000 messages/second (single broker instance)
- **Latency**: <10ms p99 for local connections
- **Connections**: Support 1,000+ concurrent connections
- **Topics**: Handle 1,000+ active topics efficiently
- **Memory**: <1GB for 1,000 connections and 100,000 retained messages

## Performance Improvements to Test

From previous optimization work, verify these improvements:
- [ ] Topic registry using Set instead of Array
- [ ] Lazy $SYS metric calculation
- [ ] Efficient wildcard matching
- [ ] Connection pooling for database operations
- [ ] Batch message writes

## Profiling Strategy

1. **CPU Profiling**: Use Node.js `--prof` flag to identify hot paths
2. **Memory Profiling**: Use heap snapshots to find leaks
3. **Database Profiling**: Use HarperDB query logs to optimize queries
4. **Network Profiling**: Use tcpdump/wireshark to verify MQTT protocol efficiency

## Continuous Performance Testing

Set up automated performance regression tests:
- Run benchmark suite on each commit
- Track metrics over time (dashboard)
- Alert on performance regressions (>10% slower)
- Compare against previous versions

## Notes

- Tests should be run on consistent hardware
- Isolate test environment from other services
- Run multiple iterations and report median/average
- Consider warm-up period before measurements
- Monitor system resources (CPU, memory, disk I/O, network)
