# Integration Test Plan

## Overview
Integration tests should verify end-to-end MQTT broker functionality with real MQTT clients.

## Prerequisites
- HarperDB running with plugin installed
- MQTT client library installed (`npm install mqtt`)
- Test broker accessible at localhost:1883

## Test Categories

### 1. Basic MQTT Operations
**Goal**: Verify core MQTT protocol functionality

Tests:
- [ ] Connect with MQTT client (clean session)
- [ ] Connect with persistent session
- [ ] Publish to topic with QoS 0, 1, 2
- [ ] Subscribe to topic and receive messages
- [ ] Unsubscribe from topic
- [ ] Disconnect gracefully
- [ ] Reconnect and receive retained messages

### 2. $SYS Topics
**Goal**: Verify broker monitoring via $SYS topics

Tests:
- [ ] Subscribe to $SYS/# and receive all metrics
- [ ] Verify $SYS/broker/version returns plugin version
- [ ] Verify $SYS/broker/clients/connected tracks client count
- [ ] Verify $SYS/broker/messages/received increments on publish
- [ ] Verify $SYS/broker/load metrics update periodically

### 3. Dynamic Table Creation
**Goal**: Verify tables are created for new topics

Tests:
- [ ] Subscribe to new topic creates table (e.g., `test/foo/#` → `mqtt_test_foo`)
- [ ] Publish to topic creates row in correct table
- [ ] Multiple topics create multiple tables
- [ ] Wildcard subscriptions create base topic table
- [ ] Table cleanup when last subscriber leaves (no retained messages)

### 4. Wildcard Subscriptions
**Goal**: Verify MQTT wildcard semantics

Tests:
- [ ] `#` wildcard receives all non-$SYS topics
- [ ] `topic/#` receives all sub-topics
- [ ] `topic/+/sensor` matches single-level wildcard
- [ ] Combining wildcards works correctly

### 5. Retained Messages
**Goal**: Verify retained message handling

Tests:
- [ ] Publish retained message stores in table
- [ ] New subscriber receives retained message
- [ ] Clearing retained message (empty payload)
- [ ] Table not deleted when retained messages exist

### 6. Authentication & Authorization
**Goal**: Verify security (if implemented)

Tests:
- [ ] Connect without credentials (if auth required) fails
- [ ] Connect with valid credentials succeeds
- [ ] Subscribe to unauthorized topic denied
- [ ] Publish to unauthorized topic denied

## Implementation Notes

### Test Structure
```javascript
import mqtt from 'mqtt';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

const BROKER_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';

describe('MQTT Integration Tests', () => {
  let client;

  before(() => {
    // Setup: ensure HarperDB is running
  });

  after(() => {
    // Cleanup: disconnect clients, delete test tables
  });

  it('should connect and publish', async () => {
    client = mqtt.connect(BROKER_URL);
    await waitForConnect(client);

    client.publish('test/topic', 'hello');

    // Verify in HarperDB database
  });
});
```

### Verification Strategies
1. **MQTT Level**: Use MQTT client to verify message delivery
2. **Database Level**: Query HarperDB tables to verify persistence
3. **$SYS Level**: Subscribe to metrics to verify internal state

### Test Environment
- Consider using Docker Compose for reproducible test environment
- Include HarperDB, test harness, and multiple MQTT clients
- Use test-specific table prefix to avoid conflicts

## Future Enhancements
- [ ] Load testing with many concurrent clients
- [ ] Stress testing with high message rates
- [ ] Failure testing (network interruptions, broker restarts)
- [ ] Cross-client compatibility (mosquitto, paho, etc.)
