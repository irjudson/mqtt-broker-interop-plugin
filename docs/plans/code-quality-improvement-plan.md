# Code Quality Improvement Plan

**Generated**: 2025-12-07
**Review Score**: B+ (Good, with room for improvement)
**Priority**: Address before next major release

## Executive Summary

The codebase is **production-ready** with solid architecture and excellent logging, but has **significant DRY violations** (~245 lines of repetitive code) that would improve maintainability if addressed. No critical bugs or security issues were found.

## Key Metrics

- **Total Source Lines**: ~2,048 lines across 4 files
- **Test Coverage**: 83/83 tests passing (100%)
- **Log Statements**: 156 (excellent observability)
- **DRY Violations**: 245 lines could be reduced to ~50
- **Dead Code**: Minimal (3 instances)

---

## Priority 1: High Impact, Low Risk

### 1.1 Refactor SysTopics.get() to Topic Map

**File**: `src/mqtt.js` lines 347-517
**Impact**: Reduces 170 lines to ~60 lines
**Effort**: 2-3 hours
**Risk**: Low (existing tests validate)

**Current Problem**: 47 consecutive if-statements mapping topics to metrics

**Solution**:
```javascript
const SYS_TOPIC_MAP = {
  '$SYS/broker/version': (metrics) => metrics.getVersion(),
  '$SYS/broker/timestamp': (metrics) => metrics.startTime.toISOString(),
  '$SYS/broker/clients/connected': (metrics) => metrics.clients.connected,
  '$SYS/broker/clients/disconnected': (metrics) => metrics.clients.disconnected,
  '$SYS/broker/clients/maximum': (metrics) => metrics.clients.maximum,
  '$SYS/broker/clients/total': (metrics) => metrics.clients.total,
  '$SYS/broker/messages/received': (metrics) => metrics.messages.received,
  '$SYS/broker/messages/sent': (metrics) => metrics.messages.sent,
  '$SYS/broker/publish/messages/received': (metrics) => metrics.publish.received,
  '$SYS/broker/publish/messages/sent': (metrics) => metrics.publish.sent,
  '$SYS/broker/bytes/received': (metrics) => metrics.bytes.received,
  '$SYS/broker/bytes/sent': (metrics) => metrics.bytes.sent,
  '$SYS/broker/subscriptions/count': (metrics) => metrics.subscriptions,
  '$SYS/broker/retained messages/count': (metrics) => metrics.retainedMessages,
  '$SYS/broker/heap/current': (metrics) => metrics.heap.current,
  '$SYS/broker/heap/maximum': (metrics) => metrics.heap.maximum,
  '$SYS/broker/uptime': (metrics) => Math.floor((Date.now() - metrics.startTime.getTime()) / 1000),
  // Load averages (connections)
  '$SYS/broker/load/connections/1min': (metrics) => Math.round(metrics.load.connections.oneMin),
  '$SYS/broker/load/connections/5min': (metrics) => Math.round(metrics.load.connections.fiveMin),
  '$SYS/broker/load/connections/15min': (metrics) => Math.round(metrics.load.connections.fifteenMin),
  // Load averages (messages received)
  '$SYS/broker/load/messages/received/1min': (metrics) => Math.round(metrics.load.messages.received.oneMin),
  '$SYS/broker/load/messages/received/5min': (metrics) => Math.round(metrics.load.messages.received.fiveMin),
  '$SYS/broker/load/messages/received/15min': (metrics) => Math.round(metrics.load.messages.received.fifteenMin),
  // Load averages (messages sent)
  '$SYS/broker/load/messages/sent/1min': (metrics) => Math.round(metrics.load.messages.sent.oneMin),
  '$SYS/broker/load/messages/sent/5min': (metrics) => Math.round(metrics.load.messages.sent.fiveMin),
  '$SYS/broker/load/messages/sent/15min': (metrics) => Math.round(metrics.load.messages.sent.fifteenMin),
  // Load averages (bytes received)
  '$SYS/broker/load/bytes/received/1min': (metrics) => Math.round(metrics.load.bytes.received.oneMin),
  '$SYS/broker/load/bytes/received/5min': (metrics) => Math.round(metrics.load.bytes.received.fiveMin),
  '$SYS/broker/load/bytes/received/15min': (metrics) => Math.round(metrics.load.bytes.received.fifteenMin),
  // Load averages (bytes sent)
  '$SYS/broker/load/bytes/sent/1min': (metrics) => Math.round(metrics.load.bytes.sent.oneMin),
  '$SYS/broker/load/bytes/sent/5min': (metrics) => Math.round(metrics.load.bytes.sent.fiveMin),
  '$SYS/broker/load/bytes/sent/15min': (metrics) => Math.round(metrics.load.bytes.sent.fifteenMin),
  // Load averages (publish received)
  '$SYS/broker/load/publish/received/1min': (metrics) => Math.round(metrics.load.publish.received.oneMin),
  '$SYS/broker/load/publish/received/5min': (metrics) => Math.round(metrics.load.publish.received.fiveMin),
  '$SYS/broker/load/publish/received/15min': (metrics) => Math.round(metrics.load.publish.received.fifteenMin),
  // Load averages (publish sent)
  '$SYS/broker/load/publish/sent/1min': (metrics) => Math.round(metrics.load.publish.sent.oneMin),
  '$SYS/broker/load/publish/sent/5min': (metrics) => Math.round(metrics.load.publish.sent.fiveMin),
  '$SYS/broker/load/publish/sent/15min': (metrics) => Math.round(metrics.load.publish.sent.fifteenMin),
};

class SysTopics {
  get(request) {
    const topic = request.path;
    logger.trace(`[MQTT-Broker-Interop-Plugin:MQTT]: $SYS topic request - ${topic}`);

    const handler = SYS_TOPIC_MAP[topic];
    if (handler) {
      return handler(this.metrics);
    }

    logger.warn(`[MQTT-Broker-Interop-Plugin:MQTT]: Unknown $SYS topic - ${topic}`);
    return null;
  }

  // Bonus: Enable dynamic topic discovery
  getAllSysTopics() {
    return Object.keys(SYS_TOPIC_MAP);
  }
}
```

**Test Validation**: Run existing `test/mqtt-sys.test.js` - should pass without changes

---

### 1.2 Extract mqtt_topics Metadata Update Function

**File**: `src/resources.js` lines 469-477, 521-544, 576-584
**Impact**: Eliminates 4 duplications (32 lines → 8 lines + 1 function)
**Effort**: 1 hour
**Risk**: Low

**Solution**:
```javascript
/**
 * Update mqtt_topics table metadata for subscription tracking
 * @param {string} tableName - Dynamic table name (e.g., 'mqtt_mqtttest')
 * @param {string} baseTopic - Base MQTT topic (e.g., 'MQTTTest')
 * @param {Object} metadata - { subscriptionCount: number, hasRetained: boolean }
 * @returns {Promise<boolean>} Success status
 */
async function updateMqttTopicsMetadata(tableName, baseTopic, metadata) {
  const mqttTopicsTable = globalThis.tables?.mqtt_topics;
  if (!mqttTopicsTable) {
    logger.debug('[MQTT-Broker-Interop-Plugin]: mqtt_topics table not available for metadata update');
    return false;
  }

  try {
    await mqttTopicsTable.put({
      id: tableName,
      topic: baseTopic,
      payload: JSON.stringify(metadata),
      qos: 0,
      retain: false,
      timestamp: new Date().toISOString(),
      client_id: 'system'
    });
    return true;
  } catch (error) {
    logger.warn(`[MQTT-Broker-Interop-Plugin]: Failed to update mqtt_topics metadata for '${tableName}':`, error);
    return false;
  }
}

// Usage in mqtt_topics.put():
metadata.hasRetained = true;
await updateMqttTopicsMetadata(tableName, baseTopic, metadata);

// Usage in mqtt_topics.subscribe():
const metadata = { subscriptionCount: 1, hasRetained: false };
await updateMqttTopicsMetadata(tableName, baseTopic, metadata);

// Usage in mqtt_topics.subscribe() finally block:
metadata.subscriptionCount = Math.max(0, (metadata.subscriptionCount || 0) - 1);
await updateMqttTopicsMetadata(tableName, baseTopic, metadata);
```

**Test Validation**: Run `test/table-registry.test.js`

---

### 1.3 Use getTableNameForTopic() Consistently

**File**: `src/resources.js` lines 431, 503
**Impact**: Eliminates sanitization logic duplication
**Effort**: 15 minutes
**Risk**: None

**Change**:
```javascript
// Before (line 431 and 503):
const tableName = `mqtt_${baseTopic.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;

// After:
import { getTableNameForTopic } from './mqtt.js';
const tableName = getTableNameForTopic(baseTopic);
```

**Note**: Verify `getTableNameForTopic()` handles edge cases the same way (empty strings, special characters, etc.)

---

## Priority 2: Medium Impact, Medium Risk

### 2.1 Add Error Handling to Async Operations in Event Listeners

**File**: `src/mqtt.js` lines 788-794, 837
**Impact**: Improves reliability and debuggability
**Effort**: 2 hours
**Risk**: Medium (changes error flow)

**Current Issue**: Fire-and-forget async calls without error handling

**Solution**:
```javascript
// Line 788 - Handle publish event
try {
  await writeMessageToTable(tableName, {
    topic,
    payload,
    qos,
    retain,
    client_id: clientId
  });
} catch (error) {
  logger.error(`[MQTT-Broker-Interop-Plugin:MQTT]: Failed to persist message to '${tableName}':`, error);
  // Optional: Track dropped messages metric
}

// Line 837 - Handle subscribe event
try {
  await createTableForTopic(baseTopic, tableName);
} catch (error) {
  logger.error(`[MQTT-Broker-Interop-Plugin:MQTT]: Failed to create table for subscription '${topic}':`, error);
  // Continue execution - subscription might still work if table exists
}
```

**Alternative (Fire-and-Forget with Logging)**:
```javascript
// Explicitly document intentional fire-and-forget
writeMessageToTable(tableName, message).catch(error => {
  logger.error(`[MQTT-Broker-Interop-Plugin:MQTT]: Message persistence failed: ${error.message}`);
});
```

---

### 2.2 Refactor Load Average Calculation

**File**: `src/mqtt.js` lines 305-318
**Impact**: Reduces duplication, improves maintainability
**Effort**: 1 hour
**Risk**: Low (unit tests validate)

**Solution**:
```javascript
// Extract repeated calculation logic
const calculateLoadAverage = (samples, periodMinutes, metricPath) => {
  if (samples.length === 0) return;

  const delta = samples[samples.length - 1].value - samples[0].value;
  const loadRate = delta / periodMinutes;

  // Navigate nested object path (e.g., 'load.connections.oneMin')
  const keys = metricPath.split('.');
  let target = this;
  for (let i = 0; i < keys.length - 1; i++) {
    target = target[keys[i]];
  }
  target[keys[keys.length - 1]] = loadRate;
};

// Apply to all metrics
const periods = [
  { samples: oneMinSamples, minutes: 1, path: `load.${metric}.oneMin` },
  { samples: fiveMinSamples, minutes: 5, path: `load.${metric}.fiveMin` },
  { samples: fifteenMinSamples, minutes: 15, path: `load.${metric}.fifteenMin` }
];

periods.forEach(({ samples, minutes, path }) => {
  calculateLoadAverage(samples, minutes, path);
});
```

**Fix Suspicious Ternary**:
```javascript
// Current (lines 307, 312, 317):
this.load[metric].oneMin = delta / (oneMinSamples.length > 1 ? 1 : 1);  // Always divides by 1

// Should probably be:
this.load[metric].oneMin = delta / 1;  // Simplify

// Or if intent was to normalize by sample count:
this.load[metric].oneMin = delta / Math.max(1, oneMinSamples.length);
```

---

### 2.3 Document Async/Await Patterns

**Files**: `src/mqtt.js` throughout
**Impact**: Improves code clarity
**Effort**: 30 minutes
**Risk**: None (documentation only)

**Add Comments**:
```javascript
// Line 788 - Intentional fire-and-forget for performance
// Don't await to avoid blocking MQTT event processing
writeMessageToTable(tableName, message).catch(error => {
  logger.error(`Message persistence failed: ${error.message}`);
});

// Line 1002 - Background task, errors logged internally
// Don't await since this runs on an interval
publishAllSysTopics().catch(error => {
  logger.error(`Failed to publish $SYS topics: ${error.message}`);
});
```

---

## Priority 3: Technical Debt & Cleanup

### 3.1 Remove Commented-Out Code

**File**: `src/index.js` lines 5, 80
**Effort**: 5 minutes

```javascript
// Line 5 - Remove:
// import { setupMqttMonitoring, setupSysTopicsPublisher } from './mqtt.js';

// Line 80 - Remove:
// export { SysTopicsResource, WildcardTopicsResource } from './resources.js';
```

---

### 3.2 Extract Magic Numbers to Constants

**File**: `src/mqtt.js` lines 292-294, 307, 312, 317
**Effort**: 30 minutes

```javascript
// At top of file
const TIME_WINDOWS = {
  ONE_MIN: { ms: 60 * 1000, divisor: 1 },
  FIVE_MIN: { ms: 5 * 60 * 1000, divisor: 5 },
  FIFTEEN_MIN: { ms: 15 * 60 * 1000, divisor: 15 }
};

// Usage:
const oneMinAgo = now - TIME_WINDOWS.ONE_MIN.ms;
const fiveMinAgo = now - TIME_WINDOWS.FIVE_MIN.ms;
const fifteenMinAgo = now - TIME_WINDOWS.FIFTEEN_MIN.ms;
```

---

### 3.3 Add Periodic Cleanup for tableRegistry

**File**: `src/mqtt.js` lines 663-716
**Impact**: Prevents potential memory leak
**Effort**: 3-4 hours
**Risk**: Medium (changes cleanup semantics)

**Problem**: Tables created but never subscribed to persist forever

**Solution**:
```javascript
// Add to MqttMetrics or separate cleanup module
const TABLE_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const TABLE_IDLE_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

function startTableCleanupJob() {
  setInterval(() => {
    const now = Date.now();

    for (const [tableName, entry] of tableRegistry.entries()) {
      const idleTime = now - entry.lastAccessTime;

      // Cleanup if: no subscriptions, no retained messages, idle > 24h
      if (entry.subscriptionCount === 0 &&
          !entry.hasRetained &&
          idleTime > TABLE_IDLE_TIMEOUT) {

        logger.info(`[MQTT-Broker-Interop-Plugin:MQTT]: Cleaning up idle table '${tableName}' (idle for ${Math.round(idleTime / 3600000)}h)`);
        cleanupTable(tableName);
      }
    }
  }, TABLE_CLEANUP_INTERVAL);
}

// Track last access time
function updateTableAccess(tableName) {
  const entry = tableRegistry.get(tableName);
  if (entry) {
    entry.lastAccessTime = Date.now();
  }
}

// Call updateTableAccess() in:
// - writeMessageToTable()
// - subscribe() handlers
```

---

### 3.4 Remove Unused Exports

**File**: `src/resources.js` line 261

```javascript
// Remove if unused:
export const Wildcard = WildcardTopicsResource;
```

**Action**: Search codebase for usage. If not found, remove.

---

### 3.5 Document Fallback BaseClass

**File**: `src/resources.js` lines 408-410

```javascript
// Add comment explaining test support:
// BaseClass extends tables.mqtt_topics in HarperDB runtime,
// falls back to empty class in test environment where globalThis.tables is undefined
const BaseClass = (typeof globalThis.tables !== 'undefined' && globalThis.tables?.mqtt_topics)
  ? globalThis.tables.mqtt_topics
  : class {}; // Empty base class for testing
```

---

## Implementation Strategy

### Phase 1: Quick Wins (1 day)
1. ✅ Use getTableNameForTopic() consistently (15 min)
2. ✅ Remove commented-out code (5 min)
3. ✅ Extract magic numbers to constants (30 min)
4. ✅ Document async/await patterns (30 min)
5. ✅ Document fallback BaseClass (5 min)
6. ✅ Remove unused exports (10 min)

**Deliverable**: Clean up technical debt, improve code clarity

### Phase 2: DRY Refactoring (1-2 days)
1. ✅ Refactor SysTopics.get() to topic map (2-3 hours)
2. ✅ Extract mqtt_topics metadata update function (1 hour)
3. ✅ Refactor load average calculation (1 hour)

**Deliverable**: Reduce codebase by ~200 lines, improve maintainability

### Phase 3: Reliability Improvements (1-2 days)
1. ✅ Add error handling to async operations (2 hours)
2. ✅ Add periodic table cleanup job (3-4 hours)
3. ✅ Add logging for missing error context (1 hour)

**Deliverable**: More robust error handling, prevent memory leaks

---

## Testing Strategy

After each phase:
1. Run full test suite: `node --test`
2. Manual testing with mosquitto:
   ```bash
   # Terminal 1: Subscribe to $SYS topics
   mosquitto_sub -h localhost -p 1883 -t '$SYS/#' -v

   # Terminal 2: Subscribe to test topics
   mosquitto_sub -h localhost -p 1883 -t 'test/#' -v

   # Terminal 3: Publish test messages
   mosquitto_pub -h localhost -p 1883 -t 'test/sensor' -m 'hello'
   ```
3. Check logs for errors
4. Verify metrics still update correctly

---

## Success Criteria

- [ ] All 83 tests pass
- [ ] Codebase reduced by ~200 lines
- [ ] No new bugs introduced
- [ ] Manual testing passes
- [ ] All Priority 1 refactorings complete
- [ ] Code review grade improves to A-

---

## Risk Mitigation

1. **Create feature branch** for all changes
2. **Commit after each refactoring** (atomic changes)
3. **Run tests after each commit**
4. **Keep original code commented** during refactoring (remove after tests pass)
5. **Deploy to staging environment** before production

---

## Notes

- This plan addresses **all issues identified in code review**
- Estimated total effort: **3-5 days** for all phases
- Phase 1 can be done immediately (low risk)
- Phases 2-3 should be done in sequence with testing between
- All changes maintain backward compatibility
- No API/schema changes required
