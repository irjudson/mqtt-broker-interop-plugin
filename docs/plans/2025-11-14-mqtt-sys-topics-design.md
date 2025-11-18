# MQTT $SYS Topics Implementation Design

## Overview

This design document outlines the implementation of MQTT `$SYS` topics for HarperDB to enable interoperability with standard MQTT monitoring tools and clients. The implementation provides a standard set of broker statistics topics while leaving clear extension points for future enhancements.

## Background

### What are $SYS Topics?

`$SYS` topics are a non-standardized but widely-adopted convention in MQTT brokers for publishing broker statistics and runtime information. While not part of the official MQTT specification, they are mentioned in MQTT 3.1.1 spec (section 4.7.2) and implemented by major brokers like Mosquitto, EMQX, and HiveMQ.

### Current State

HarperDB currently supports MQTT v3.1 and v5 with:
- Publish/subscribe capabilities
- Multi-level topics and wildcards
- QoS 0 and 1
- Durable sessions
- WebSocket support

However, it does not expose `$SYS` topics, which prevents integration with many standard MQTT monitoring tools.

## Goals

1. **Interoperability**: Enable standard MQTT tools (mosquitto_sub, MQTT Explorer, Node-RED) to monitor HarperDB MQTT broker statistics
2. **Standard compliance**: Implement the commonly-accepted minimum set of `$SYS` topics
3. **Extensibility**: Provide clear extension points for future metrics (load averages, per-client stats, memory usage)
4. **Performance**: Minimal overhead - only track what's needed, only publish when subscribed
5. **Maintainability**: Single-file implementation initially, refactor if it grows too large

## Non-Goals

- Official MQTT specification compliance (none exists for `$SYS`)
- Complete parity with Mosquitto/EMQX extended metrics (initially)
- Real-time per-message updates (periodic updates are sufficient)
- Historical metrics or time-series data

## Architecture

### Core Components

#### 1. MqttMetrics (Singleton)

A centralized metrics tracking module that maintains runtime statistics. This is the **primary extension point** for future enhancements.

**Responsibilities:**
- Track client connections/disconnections
- Count messages and bytes sent/received
- Monitor subscriptions and retained messages
- Record peak values (maximum concurrent clients)
- Provide read access to current metric values

**Key Design Decision**: Events for input (capture), not for output (broadcast).

#### 2. SysTopics Resource Class

A HarperDB Resource class that handles all `$SYS/*` topic requests.

**Responsibilities:**
- Route topic requests to appropriate metric values
- Return current statistics on demand
- Support both explicit topic subscriptions and wildcard patterns
- Format responses appropriately for MQTT clients

**Path**: `$SYS/#` (handles all $SYS topics)

#### 3. Update Publisher

A background task that periodically publishes metric updates to subscribed clients.

**Responsibilities:**
- Start when first `$SYS` subscriber connects
- Publish updates at configurable intervals (`sys_interval`)
- Stop when no `$SYS` subscribers remain
- Manage lifecycle efficiently

**Key Design Decision**: Timer-based publishing for controlled output, not event-driven (prevents spam).

#### 4. Event Hooks

Lightweight interceptors that update MqttMetrics counters when MQTT operations occur.

**Responsibilities:**
- Intercept client connect/disconnect events
- Intercept publish operations (for message and byte counts)
- Intercept subscribe/unsubscribe operations
- Update MqttMetrics in real-time

### Data Flow

```
MQTT Operation → Event Hook → MqttMetrics.update()
                                    ↓
Client subscribes → SysTopics.get() → MqttMetrics.read() → Return value
                                    ↓
Timer fires → Update Publisher → MqttMetrics.read() → Publish to subscribers
```

**Separation of Concerns:**
- **Events capture input** (what's happening in the broker)
- **Timer + publish produce output** (broadcast stats to subscribers)

## $SYS Topics Structure

### Static Topics
Sent once when client subscribes, never updated:

```
$SYS/broker/version                    # HarperDB version string
$SYS/broker/timestamp                  # Broker start time (ISO 8601)
```

### Dynamic Topics
Updated every `sys_interval` seconds:

**Client Metrics:**
```
$SYS/broker/clients/connected          # Current connected clients
$SYS/broker/clients/disconnected       # Disconnected clients with persistent sessions
$SYS/broker/clients/maximum            # Peak concurrent connections since startup
$SYS/broker/clients/total              # Total: connected + disconnected
```

**Message Metrics:**
```
$SYS/broker/messages/received          # Total messages received since startup
$SYS/broker/messages/sent              # Total messages sent since startup
$SYS/broker/publish/messages/received  # PUBLISH packets received
$SYS/broker/publish/messages/sent      # PUBLISH packets sent
```

**Bandwidth Metrics:**
```
$SYS/broker/bytes/received             # Total bytes received
$SYS/broker/bytes/sent                 # Total bytes sent
```

**Subscription Metrics:**
```
$SYS/broker/subscriptions/count        # Active subscriptions
$SYS/broker/retained messages/count    # Retained messages stored
```

**Total: 14 topics** (standard set)

### Extension Breadcrumbs

The implementation will include commented placeholders for future metrics:

```javascript
// Future metrics to add (option C - extended set):
// $SYS/broker/load/messages/received/1min
// $SYS/broker/load/messages/received/5min
// $SYS/broker/load/messages/received/15min
// $SYS/broker/uptime
// $SYS/broker/heap/current
// $SYS/broker/heap/maximum
// $SYS/broker/clients/<client-id>/...
```

## Implementation Details

### MqttMetrics Class Structure

```javascript
class MqttMetrics {
  constructor() {
    this.startTime = new Date();
    this.clients = {
      connected: 0,
      disconnected: 0,  // persistent sessions
      maximum: 0,
      total: 0
    };
    this.messages = {
      received: 0,
      sent: 0,
      publishReceived: 0,
      publishSent: 0
    };
    this.bytes = {
      received: 0,
      sent: 0
    };
    this.subscriptions = {
      count: 0
    };
    this.retained = {
      count: 0
    };
  }

  // Event handlers
  onConnect(clientId, persistent) {
    this.clients.connected++;
    this.clients.total = this.clients.connected + this.clients.disconnected;
    if (this.clients.connected > this.clients.maximum) {
      this.clients.maximum = this.clients.connected;
    }
  }

  onDisconnect(clientId, persistent) {
    this.clients.connected--;
    if (persistent) {
      this.clients.disconnected++;
    }
    this.clients.total = this.clients.connected + this.clients.disconnected;
  }

  onPublishReceived(message, byteCount) {
    this.messages.received++;
    this.messages.publishReceived++;
    this.bytes.received += byteCount;
  }

  onPublishSent(message, byteCount) {
    this.messages.sent++;
    this.messages.publishSent++;
    this.bytes.sent += byteCount;
  }

  onSubscribe(clientId, topic) {
    this.subscriptions.count++;
  }

  onUnsubscribe(clientId, topic) {
    this.subscriptions.count--;
  }

  onRetainedMessageAdded() {
    this.retained.count++;
  }

  onRetainedMessageRemoved() {
    this.retained.count--;
  }

  // Extension point: add new metric categories here
  // Example:
  // this.load = { oneMin: 0, fiveMin: 0, fifteenMin: 0 };
}

// Singleton instance
const metrics = new MqttMetrics();
export { metrics };
```

### SysTopics Resource Class

```javascript
export class SysTopics extends Resource {
  static path = '$SYS/#';  // Handle all $SYS topics
  static loadAsInstance = false;

  get(request) {
    const topic = request.path;

    // Static topics
    if (topic === '$SYS/broker/version') {
      return this.getVersion();
    }
    if (topic === '$SYS/broker/timestamp') {
      return metrics.startTime.toISOString();
    }

    // Client metrics
    if (topic === '$SYS/broker/clients/connected') {
      return metrics.clients.connected;
    }
    if (topic === '$SYS/broker/clients/disconnected') {
      return metrics.clients.disconnected;
    }
    if (topic === '$SYS/broker/clients/maximum') {
      return metrics.clients.maximum;
    }
    if (topic === '$SYS/broker/clients/total') {
      return metrics.clients.total;
    }

    // Message metrics
    if (topic === '$SYS/broker/messages/received') {
      return metrics.messages.received;
    }
    if (topic === '$SYS/broker/messages/sent') {
      return metrics.messages.sent;
    }
    if (topic === '$SYS/broker/publish/messages/received') {
      return metrics.messages.publishReceived;
    }
    if (topic === '$SYS/broker/publish/messages/sent') {
      return metrics.messages.publishSent;
    }

    // Bandwidth metrics
    if (topic === '$SYS/broker/bytes/received') {
      return metrics.bytes.received;
    }
    if (topic === '$SYS/broker/bytes/sent') {
      return metrics.bytes.sent;
    }

    // Subscription metrics
    if (topic === '$SYS/broker/subscriptions/count') {
      return metrics.subscriptions.count;
    }
    if (topic === '$SYS/broker/retained messages/count') {
      return metrics.retained.count;
    }

    // Unknown topic
    return null;
  }

  getVersion() {
    // TODO: Determine how to get HarperDB version
    // May need to import from Harper core or read from package.json
    return 'HarperDB 4.7.0';
  }
}
```

### Update Publisher

```javascript
let publishInterval = null;
let sysSubscriberCount = 0;

function startSysPublisher(intervalSeconds) {
  if (publishInterval) return; // Already running

  publishInterval = setInterval(() => {
    publishAllSysTopics();
  }, intervalSeconds * 1000);
}

function stopSysPublisher() {
  if (publishInterval) {
    clearInterval(publishInterval);
    publishInterval = null;
  }
}

function publishAllSysTopics() {
  // Get all dynamic topics
  const topics = [
    '$SYS/broker/clients/connected',
    '$SYS/broker/clients/disconnected',
    '$SYS/broker/clients/maximum',
    '$SYS/broker/clients/total',
    '$SYS/broker/messages/received',
    '$SYS/broker/messages/sent',
    '$SYS/broker/publish/messages/received',
    '$SYS/broker/publish/messages/sent',
    '$SYS/broker/bytes/received',
    '$SYS/broker/bytes/sent',
    '$SYS/broker/subscriptions/count',
    '$SYS/broker/retained messages/count'
  ];

  // TODO: Determine Harper's API for publishing to topics
  // Likely something like: broker.publish(topic, value, options)
  topics.forEach(topic => {
    const value = new SysTopics().get({ path: topic });
    // broker.publish(topic, value, { qos: 0 });
  });
}

// Hook into subscription events
function onSysTopicSubscribe(clientId, topic) {
  if (topic.startsWith('$SYS/')) {
    sysSubscriberCount++;
    if (sysSubscriberCount === 1) {
      // First subscriber - start publishing
      const interval = config.mqtt?.sys_interval || 10;
      startSysPublisher(interval);
    }

    // Send static topics immediately on subscription
    if (topic === '$SYS/broker/version' || topic.includes('version')) {
      // broker.publish('$SYS/broker/version', getVersion(), { qos: 0 });
    }
    if (topic === '$SYS/broker/timestamp' || topic.includes('timestamp')) {
      // broker.publish('$SYS/broker/timestamp', metrics.startTime.toISOString(), { qos: 0 });
    }
  }
}

function onSysTopicUnsubscribe(clientId, topic) {
  if (topic.startsWith('$SYS/')) {
    sysSubscriberCount--;
    if (sysSubscriberCount <= 0) {
      sysSubscriberCount = 0;
      stopSysPublisher();
    }
  }
}
```

### Event Hook Integration

**Investigation needed**: How to hook into Harper's MQTT events. Possible approaches:

1. Harper provides event emitter or callback registration
2. Extend/override Harper's MQTT handler classes
3. Middleware pattern for MQTT operations
4. Configuration-based hooks in `config.yaml`

```javascript
// Pseudocode - actual implementation depends on Harper's API

// Option 1: Event emitter
broker.on('client.connected', (clientId, cleanSession) => {
  metrics.onConnect(clientId, !cleanSession);
});

broker.on('client.disconnected', (clientId, cleanSession) => {
  metrics.onDisconnect(clientId, !cleanSession);
});

broker.on('message.received', (message) => {
  metrics.onPublishReceived(message, message.payload.length);
});

broker.on('message.sent', (message) => {
  metrics.onPublishSent(message, message.payload.length);
});

broker.on('client.subscribed', (clientId, topic) => {
  metrics.onSubscribe(clientId, topic);
  onSysTopicSubscribe(clientId, topic);
});

broker.on('client.unsubscribed', (clientId, topic) => {
  metrics.onUnsubscribe(clientId, topic);
  onSysTopicUnsubscribe(clientId, topic);
});
```

## Configuration

### config.yaml Changes

```yaml
mqtt:
  network:
    port: 1883
    securePort: 8883
  webSocket: true
  mTLS: false
  requireAuthentication: false
  sys_interval: 10  # NEW: seconds between $SYS topic updates (default: 10)
  # sys_topics_public: true  # FUTURE: whether $SYS topics require auth
```

## Interoperability

### Value Formats

Return plain values, not JSON objects:
- Numbers: `5` (not `{"value": 5}`)
- Strings: `"HarperDB 4.7.0"` (not `{"version": "..."}`)

### Topic Naming

Follow Mosquitto conventions exactly, including spaces in topic names:
- `$SYS/broker/retained messages/count` (with space, per convention)

### Wildcard Support

Support both:
- Explicit: `$SYS/broker/clients/connected`
- Wildcards: `$SYS/#`, `$SYS/broker/#`, `$SYS/broker/clients/#`

Harper's existing resource routing should handle this naturally.

### QoS Levels

Use QoS 0 for all `$SYS` topics (fire-and-forget, standard practice).

### Access Control

**Initial implementation**: $SYS topics are readable by all clients (standard behavior).

**Future enhancement**: Add `sys_topics_public` config option to require authentication.

## Testing Strategy

### Test-Driven Development

1. **Write tests first** for each component
2. **Watch them fail** (red)
3. **Implement minimal code** to pass (green)
4. **Refactor** and repeat

### Unit Tests

**MqttMetrics:**
```javascript
describe('MqttMetrics', () => {
  test('initializes with zero values', () => {
    const m = new MqttMetrics();
    expect(m.clients.connected).toBe(0);
    expect(m.messages.received).toBe(0);
  });

  test('increments connected clients on connect', () => {
    const m = new MqttMetrics();
    m.onConnect('client1', false);
    expect(m.clients.connected).toBe(1);
  });

  test('tracks maximum concurrent clients', () => {
    const m = new MqttMetrics();
    m.onConnect('client1', false);
    m.onConnect('client2', false);
    expect(m.clients.maximum).toBe(2);
    m.onDisconnect('client1', false);
    expect(m.clients.maximum).toBe(2); // Still 2
  });

  test('tracks persistent sessions on disconnect', () => {
    const m = new MqttMetrics();
    m.onConnect('client1', true);
    m.onDisconnect('client1', true);
    expect(m.clients.connected).toBe(0);
    expect(m.clients.disconnected).toBe(1);
  });

  test('counts bytes and messages on publish', () => {
    const m = new MqttMetrics();
    m.onPublishReceived({ topic: 'test' }, 100);
    expect(m.messages.received).toBe(1);
    expect(m.bytes.received).toBe(100);
  });

  // Extension point test
  test('allows adding new metric categories', () => {
    const m = new MqttMetrics();
    m.load = { oneMin: 0 };
    m.load.oneMin = 42;
    expect(m.load.oneMin).toBe(42);
  });
});
```

**SysTopics Resource:**
```javascript
describe('SysTopics', () => {
  test('returns version on version topic', () => {
    const sys = new SysTopics();
    const result = sys.get({ path: '$SYS/broker/version' });
    expect(result).toMatch(/HarperDB/);
  });

  test('returns current connected clients', () => {
    metrics.clients.connected = 5;
    const sys = new SysTopics();
    const result = sys.get({ path: '$SYS/broker/clients/connected' });
    expect(result).toBe(5);
  });

  test('returns null for unknown topic', () => {
    const sys = new SysTopics();
    const result = sys.get({ path: '$SYS/unknown/topic' });
    expect(result).toBeNull();
  });

  test('handles all 14 standard topics', () => {
    const sys = new SysTopics();
    const topics = [
      '$SYS/broker/version',
      '$SYS/broker/timestamp',
      '$SYS/broker/clients/connected',
      // ... all 14
    ];
    topics.forEach(topic => {
      const result = sys.get({ path: topic });
      expect(result).not.toBeNull();
    });
  });
});
```

### Integration Tests

**Event Hook Integration:**
```javascript
describe('Event Hooks', () => {
  test('client connection updates metrics', async () => {
    const before = metrics.clients.connected;
    // Simulate client connection (depends on Harper API)
    // await broker.simulateConnect('test-client');
    expect(metrics.clients.connected).toBe(before + 1);
  });

  test('publish updates message counters', async () => {
    const before = metrics.messages.received;
    // await broker.simulatePublish('test/topic', 'payload');
    expect(metrics.messages.received).toBe(before + 1);
  });
});
```

**Publisher Integration:**
```javascript
describe('Update Publisher', () => {
  test('starts on first $SYS subscription', async () => {
    // Subscribe to $SYS topic
    // Verify publishInterval is not null
  });

  test('publishes updates at sys_interval', async () => {
    // Subscribe to $SYS/broker/clients/connected
    // Wait for sys_interval * 2
    // Verify received at least 2 updates
  });

  test('stops when no subscribers remain', async () => {
    // Subscribe then unsubscribe
    // Verify publishInterval is null
  });

  test('wildcard subscription receives all topics', async () => {
    // Subscribe to $SYS/#
    // Wait for one interval
    // Verify received all 12 dynamic topics
  });
});
```

### End-to-End Tests

**Real MQTT Client:**
```javascript
describe('E2E: Real MQTT Client', () => {
  test('mosquitto_sub can read $SYS topics', async () => {
    // Start HarperDB MQTT broker
    // Run: mosquitto_sub -h localhost -t '$SYS/broker/version' -C 1
    // Verify output contains version string
  });

  test('MQTT.js client receives updates', async () => {
    const mqtt = require('mqtt');
    const client = mqtt.connect('mqtt://localhost:1883');

    const received = [];
    client.on('message', (topic, message) => {
      received.push({ topic, message: message.toString() });
    });

    client.subscribe('$SYS/broker/clients/connected');

    // Wait for initial value + one update
    await waitFor(() => received.length >= 2);

    expect(received[0].topic).toBe('$SYS/broker/clients/connected');
    expect(parseInt(received[0].message)).toBeGreaterThanOrEqual(1);
  });

  test('wildcard subscription works', async () => {
    const client = mqtt.connect('mqtt://localhost:1883');
    const topics = new Set();

    client.on('message', (topic) => {
      topics.add(topic);
    });

    client.subscribe('$SYS/#');

    // Wait for updates
    await waitFor(() => topics.size >= 14);

    expect(topics.has('$SYS/broker/version')).toBe(true);
    expect(topics.has('$SYS/broker/clients/connected')).toBe(true);
  });
});
```

### Test Utilities

```javascript
// Async wait helper
function waitFor(condition, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject(new Error('Timeout waiting for condition'));
      }
    }, 100);
  });
}

// Metric snapshot for comparison
function snapshotMetrics() {
  return JSON.parse(JSON.stringify({
    clients: metrics.clients,
    messages: metrics.messages,
    bytes: metrics.bytes,
    subscriptions: metrics.subscriptions,
    retained: metrics.retained
  }));
}
```

## Implementation Plan

### Phase 1: Foundation (TDD)
1. ✓ Write tests for MqttMetrics initialization
2. ✓ Implement MqttMetrics class structure
3. ✓ Write tests for MqttMetrics event handlers
4. ✓ Implement event handler methods
5. ✓ Write tests for static topics (version, timestamp)
6. ✓ Implement SysTopics Resource with static topics
7. ✓ Manual test: subscribe to `$SYS/broker/version`

### Phase 2: Dynamic Metrics (TDD)
8. ✓ Write tests for all 14 topic handlers
9. ✓ Implement SysTopics handlers for dynamic topics
10. ✓ Write tests for wildcard subscriptions
11. ✓ Implement wildcard topic matching
12. ✓ Manual test: subscribe to `$SYS/#`, verify all topics

### Phase 3: Event Tracking (TDD)
13. **Investigate** Harper's MQTT event hooks/APIs
14. ✓ Write tests for event → metric updates
15. ✓ Implement event hooks (connect, disconnect, publish, subscribe)
16. ✓ Integration test: verify real connections update metrics

### Phase 4: Periodic Publishing (TDD)
17. ✓ Write tests for sys_interval configuration
18. ✓ Write tests for publisher lifecycle (start/stop)
19. ✓ Implement Update Publisher with interval management
20. ✓ Integration test: verify periodic updates sent at correct intervals

### Phase 5: Polish & Documentation
21. ✓ Add extension breadcrumbs (commented future metrics)
22. ✓ Add inline documentation
23. ✓ E2E testing with mosquitto_sub
24. ✓ E2E testing with MQTT Explorer
25. ✓ Performance testing (overhead measurement)
26. ✓ Update README with $SYS topics documentation

## Investigation Required

Before implementation can begin, need to investigate:

1. **Harper's MQTT event API**
   - How to hook into connect/disconnect events
   - How to intercept publish operations
   - How to detect subscribe/unsubscribe
   - How to get message byte size

2. **Harper's version information**
   - Where to read HarperDB version string
   - Format: "HarperDB X.Y.Z" or just "X.Y.Z"?

3. **Harper's existing metrics**
   - What metrics does Harper already track?
   - Can we reuse existing counters vs. track ourselves?
   - Does Harper expose client count, message count, etc.?

4. **Resource class API**
   - Structure of request object (how to get topic path)
   - How to publish to topics programmatically
   - How to detect subscriber count

5. **Configuration system**
   - How to read custom config values from config.yaml
   - When/how config is loaded (for sys_interval)

## Files to Create/Modify

- **mqtt.js** - All implementation (MqttMetrics + SysTopics + Publisher)
- **config.yaml** - Add `sys_interval` configuration
- **test/mqtt-sys.test.js** - Unit and integration tests (or appropriate test location)
- **README.md** - Document $SYS topics feature (if applicable)

## Success Criteria

Implementation is complete when:

1. ✓ All 14 standard $SYS topics are implemented
2. ✓ All unit tests pass (MqttMetrics, SysTopics)
3. ✓ All integration tests pass (event hooks, publisher)
4. ✓ mosquitto_sub can subscribe to `$SYS/#` and receive all topics
5. ✓ MQTT Explorer displays $SYS tree correctly
6. ✓ Metrics update in real-time when clients connect/disconnect/publish
7. ✓ Periodic updates publish at configured `sys_interval`
8. ✓ Publisher starts/stops appropriately based on subscriptions
9. ✓ Extension breadcrumbs are in place for future metrics
10. ✓ Performance overhead is negligible (<1% CPU, <10MB memory)

## Extension Points for Future Work

The design includes clear extension points for adding "option C" extended metrics:

### In MqttMetrics:
```javascript
// Add new metric categories
this.load = {
  messagesReceivedOneMin: 0,
  messagesReceivedFiveMin: 0,
  messagesReceivedFifteenMin: 0
};

this.system = {
  uptime: 0,
  heapCurrent: 0,
  heapMaximum: 0
};

this.perClient = new Map(); // client-id → stats
```

### In SysTopics:
```javascript
// Add new topic handlers
if (topic === '$SYS/broker/uptime') {
  const uptime = Date.now() - metrics.startTime.getTime();
  return Math.floor(uptime / 1000); // seconds
}

if (topic.startsWith('$SYS/broker/clients/')) {
  const clientId = topic.split('/').pop();
  return metrics.perClient.get(clientId);
}
```

### In Update Publisher:
```javascript
// Add new topics to publish list
const extendedTopics = [
  '$SYS/broker/load/messages/received/1min',
  '$SYS/broker/uptime',
  // ...
];
```

## References

- [Mosquitto man page](https://mosquitto.org/man/mosquitto-8.html) - Original $SYS topic documentation
- [MQTT 3.1.1 Specification](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html) - Section 4.7.2 mentions $SYS
- [HiveMQ: Why you shouldn't use $SYS topics for monitoring](https://www.hivemq.com/blog/why-you-shouldnt-use-sys-topics-for-monitoring/) - Limitations and alternatives
- [HarperDB Documentation](https://docs.harperdb.io) - Resource API and MQTT support

---

**Document Status**: Draft
**Last Updated**: 2025-11-14
**Author**: Claude Code (with user collaboration)
