# Table-Backed MQTT Topics Design

**Date:** 2025-12-04
**Status:** Validated Design

## Overview

This design implements table-backed storage for all MQTT topics in the HarperDB MQTT Broker Interoperability Plugin. The solution provides persistent storage for MQTT messages, broker statistics, and topic lifecycle management with automatic cleanup.

## Requirements

1. Check all subscribe events for new topics that need table creation (excluding $SYS and empty topics)
2. Back all managed topics (including $SYS) with HarperDB tables
3. Implement listeners to update $SYS topics with real-time broker statistics

## Architecture

### Three-Tier Table Strategy

#### 1. $SYS Metrics Table (`mqtt_sys_metrics`)
- **Purpose:** Store broker statistics for MQTT standard $SYS topics
- **Database:** `mqtt_topics`
- **Schema:**
  - `id` (string, PK): Topic path (e.g., `$SYS/broker/clients/connected`)
  - `topic` (string): Same as id
  - `value` (flexible): Metric value (number, string, etc.)
  - `timestamp` (timestamp): Last update time
- **Update Strategy:** Upsert on every metric change (immediate updates)
- **Lifecycle:** Created at plugin initialization, never deleted

#### 2. Hierarchical Topic Tables (e.g., `mqtt_home`, `mqtt_sensors`)
- **Purpose:** Store messages for topics with hierarchy (containing `/`)
- **Database:** `mqtt_topics`
- **Naming:** `mqtt_<first_segment>` where first segment is part before first `/`
- **Schema (flexible typing):**
  - `id` (string, PK): UUID or timestamp-based unique ID
  - `topic` (string): Full topic path
  - `payload` (flexible): Message payload (string, buffer, object, etc.)
  - `qos` (number): MQTT QoS level (0, 1, 2)
  - `retain` (boolean): Retained message flag
  - `timestamp` (timestamp): Message arrival time
  - `client_id` (string): Publishing client ID
- **Lifecycle:** Created on first subscribe, cleaned up when no subscribers AND no retained messages

#### 3. Default Topic Table (`mqtt_messages`)
- **Purpose:** Store messages for topics without hierarchy (no `/` in name)
- **Database:** `mqtt_topics`
- **Schema:** Same as hierarchical tables
- **Lifecycle:** Same as hierarchical tables

### Table Registry

**Data Structure:**
```javascript
// Map: tableName -> metadata
tableRegistry = new Map();

// Entry structure:
{
  tableName: 'mqtt_home',
  subscriptionCount: 2,
  hasRetained: false
}
```

**Purpose:**
- Track which tables exist without database queries
- Count active subscriptions per table
- Track retained message status for cleanup decisions

## Component Design

### 1. Subscribe Event Handler

**Location:** `src/mqtt.js` - `setupMqttMonitoring()` function

**Logic:**
```javascript
mqttEvents.on('subscribe', (subscriptions, session) => {
  const clientId = session?.sessionId;
  if (Array.isArray(subscriptions)) {
    subscriptions.forEach(sub => {
      const topic = typeof sub === 'string' ? sub : sub?.topic;

      // Filter: skip empty topics
      if (!topic) return;

      // Filter: skip $SYS topics (handled separately)
      if (topic.startsWith('$SYS/') || topic === '$SYS/#') {
        metrics.onSubscribe(clientId, topic);
        return;
      }

      // Filter: skip wildcards (don't create tables)
      if (topic.includes('#') || topic.includes('+')) {
        metrics.onSubscribe(clientId, topic);
        return;
      }

      // Get table name for this topic
      const tableName = getTableNameForTopic(topic);

      // Create table if doesn't exist (check registry first)
      if (!tableRegistry.has(tableName)) {
        createTableForTopic(topic, tableName);
        tableRegistry.set(tableName, {
          tableName,
          subscriptionCount: 0,
          hasRetained: false
        });
      }

      // Increment subscription count
      const entry = tableRegistry.get(tableName);
      entry.subscriptionCount++;

      metrics.onSubscribe(clientId, topic);
    });
  }
});
```

### 2. Publish Event Handler

**Location:** `src/mqtt.js` - `setupMqttMonitoring()` function

**Logic:**
```javascript
mqttEvents.on('publish', (packet, session) => {
  const topic = packet?.topic;
  const payload = packet?.payload;
  const clientId = session?.sessionId;
  const qos = packet?.qos || 0;
  const retain = packet?.retain || false;
  const byteCount = payload ? Buffer.byteLength(payload) : 0;

  logger.debug(`Publish received - topic: ${topic}, bytes: ${byteCount}`);
  metrics.onPublishReceived({ topic, payload }, byteCount);

  // Skip $SYS topics - managed separately
  if (topic && topic.startsWith('$SYS/')) {
    return;
  }

  // Track and store message
  if (topic) {
    topicRegistry.add(topic);

    // Write message to appropriate table
    const tableName = getTableNameForTopic(topic);
    writeMessageToTable(tableName, {
      topic,
      payload,
      qos,
      retain,
      client_id: clientId
    });

    // Update retained message tracking
    if (retain) {
      updateRetainedStatus(tableName, true);
    }
  }
});
```

### 3. Unsubscribe Event Handler

**Location:** `src/mqtt.js` - `setupMqttMonitoring()` function

**Logic:**
```javascript
mqttEvents.on('unsubscribe', (unsubscriptions, session) => {
  const clientId = session?.sessionId;
  if (Array.isArray(unsubscriptions)) {
    unsubscriptions.forEach(topic => {
      logger.info(`Unsubscription - clientId: ${clientId}, topic: ${topic}`);
      metrics.onUnsubscribe(clientId, topic);

      // Skip $SYS topics
      if (topic && (topic.startsWith('$SYS/') || topic === '$SYS/#')) {
        return;
      }

      // Skip wildcards
      if (topic.includes('#') || topic.includes('+')) {
        return;
      }

      // Decrement subscription count
      const tableName = getTableNameForTopic(topic);
      const tableEntry = tableRegistry.get(tableName);

      if (tableEntry) {
        tableEntry.subscriptionCount--;

        // Cleanup only if no subscribers AND no retained messages
        if (tableEntry.subscriptionCount === 0 && !tableEntry.hasRetained) {
          cleanupTable(tableName);
        }
      }
    });
  }
});
```

### 4. $SYS Metrics Updates

**Location:** `src/mqtt.js` - `MqttMetrics` class methods

**Strategy:** Modify all metric update methods to upsert to `mqtt_sys_metrics` table immediately

**Example - `onConnect` method:**
```javascript
onConnect(clientId, persistent) {
  this.clients.connected++;
  this.clients.total++;
  if (this.clients.connected > this.clients.maximum) {
    this.clients.maximum = this.clients.connected;
  }

  // Upsert to table immediately
  upsertSysMetric('$SYS/broker/clients/connected', this.clients.connected);
  upsertSysMetric('$SYS/broker/clients/total', this.clients.total);
  upsertSysMetric('$SYS/broker/clients/maximum', this.clients.maximum);
}
```

**Apply to all metric methods:**
- `onConnect()`
- `onDisconnect()`
- `onPublishReceived()`
- `onPublishSent()`
- `onSubscribe()`
- `onUnsubscribe()`
- `onRetainedMessageAdded()`
- `onRetainedMessageRemoved()`
- `_updateSystemMetrics()` (heap, uptime, load averages)

### 5. Helper Functions

**Location:** `src/mqtt.js` - Module-level functions

#### `getTableNameForTopic(topic)`
```javascript
function getTableNameForTopic(topic) {
  // Extract first segment before '/'
  const firstSegment = topic.split('/')[0];

  // If no hierarchy (no slash), use default table
  if (firstSegment === topic && !topic.includes('/')) {
    return 'mqtt_messages';
  }

  // Sanitize: lowercase, replace invalid chars with underscore
  const sanitized = firstSegment
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');

  return `mqtt_${sanitized}`;
}
```

#### `createTableForTopic(topic, tableName)`
```javascript
function createTableForTopic(topic, tableName) {
  logger.info(`Creating table '${tableName}' for topic '${topic}'`);

  const table = harperServer.ensureTable({
    database: 'mqtt_topics',
    table: tableName,
    primaryKey: 'id'
    // No schema - flexible typing for payload and other fields
  });

  logger.info(`Table '${tableName}' created successfully`);
  return table;
}
```

#### `writeMessageToTable(tableName, message)`
```javascript
function writeMessageToTable(tableName, message) {
  // Get or create table
  let tableEntry = tableRegistry.get(tableName);
  if (!tableEntry) {
    // Table doesn't exist yet (published before subscribe)
    createTableForTopic(message.topic, tableName);
    tableEntry = { tableName, subscriptionCount: 0, hasRetained: false };
    tableRegistry.set(tableName, tableEntry);
  }

  const table = harperServer.getTable('mqtt_topics', tableName);
  table.put({
    id: generateMessageId(), // UUID or timestamp-based
    topic: message.topic,
    payload: message.payload,
    qos: message.qos,
    retain: message.retain,
    timestamp: new Date(),
    client_id: message.client_id
  });
}
```

#### `upsertSysMetric(topic, value)`
```javascript
function upsertSysMetric(topic, value) {
  if (!sysMetricsTable) return;

  sysMetricsTable.put({
    id: topic, // Use topic as PK for upsert
    topic: topic,
    value: value,
    timestamp: new Date()
  });
}
```

#### `updateRetainedStatus(tableName, hasRetained)`
```javascript
function updateRetainedStatus(tableName, hasRetained) {
  const tableEntry = tableRegistry.get(tableName);
  if (tableEntry) {
    tableEntry.hasRetained = hasRetained;
  }
}
```

#### `cleanupTable(tableName)`
```javascript
function cleanupTable(tableName) {
  logger.info(`Cleaning up unused table: ${tableName}`);

  try {
    // Drop the table
    harperServer.dropTable('mqtt_topics', tableName);

    // Remove from registry
    tableRegistry.delete(tableName);

    logger.info(`Table ${tableName} dropped successfully`);
  } catch (error) {
    logger.error(`Failed to drop table ${tableName}:`, error);
  }
}
```

#### `generateMessageId()`
```javascript
function generateMessageId() {
  // UUID or timestamp-based unique ID
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

### 6. Plugin Initialization

**Location:** `src/index.js` - `handleApplication()` function

**Add $SYS table creation:**
```javascript
export async function handleApplication(scope) {
  const {logger, server} = scope;
  const options = scope.options.getAll();

  // Load configuration
  const fullConfig = loadConfig(options);
  const sysInterval = fullConfig?.mqtt?.sys_interval || 10;

  // Create $SYS metrics table
  const sysMetricsTable = server.ensureTable({
    database: 'mqtt_topics',
    table: 'mqtt_sys_metrics',
    primaryKey: 'id'
  });

  logger.info('$SYS metrics table created');

  // Pass sysMetricsTable to setupMqttMonitoring
  if (server?.mqtt?.events) {
    setupMqttMonitoring(server, logger, sysInterval, sysMetricsTable);
  }

  // ... rest of initialization ...
}
```

## Data Flow

### Subscribe Flow
1. Client subscribes to `home/temperature`
2. Subscribe event fires in `setupMqttMonitoring()`
3. Filter: not empty, not $SYS, not wildcard ✓
4. Extract table name: `mqtt_home`
5. Check `tableRegistry` - doesn't exist
6. Call `createTableForTopic('home/temperature', 'mqtt_home')`
7. Create entry in `tableRegistry`: `{tableName: 'mqtt_home', subscriptionCount: 1, hasRetained: false}`
8. Update `metrics.onSubscribe()`

### Publish Flow
1. Client publishes to `home/temperature` with payload `{temp: 22.5}`
2. Publish event fires in `setupMqttMonitoring()`
3. Update metrics: `metrics.onPublishReceived()`
4. Extract table name: `mqtt_home`
5. Call `writeMessageToTable('mqtt_home', {topic, payload, qos, retain, client_id})`
6. Insert row into `mqtt_home` table with all message details
7. If retained: update `tableRegistry` entry `hasRetained: true`

### Unsubscribe Flow
1. Client unsubscribes from `home/temperature`
2. Unsubscribe event fires
3. Extract table name: `mqtt_home`
4. Get entry from `tableRegistry`
5. Decrement `subscriptionCount`
6. Check: `subscriptionCount === 0 && !hasRetained`
7. If true: call `cleanupTable('mqtt_home')` to drop table and remove from registry

### $SYS Update Flow
1. Client connects
2. `metrics.onConnect()` called
3. Update in-memory counter: `this.clients.connected++`
4. Call `upsertSysMetric('$SYS/broker/clients/connected', this.clients.connected)`
5. Upsert row in `mqtt_sys_metrics` table with current value and timestamp
6. Subscribers to `$SYS/broker/clients/connected` receive update via Harper's resource system

## MQTT Semantics Alignment

### Table Lifecycle Matches MQTT Behavior
- **Subscribe creates topic**: Tables created on subscribe, ready for messages
- **Retained messages persist**: Topics with retained messages keep tables alive even with no subscribers
- **Cleanup on inactive**: Tables dropped when no subscribers and no retained messages (topic truly inactive)

### Consistent with Persistent Sessions
- Tables provide storage for messages during subscriber disconnection
- QoS 1/2 message guarantees can be implemented with table storage
- Subscription state survives broker restarts (tables persist)

## Error Handling

### Table Creation Failures
- Log error but don't crash
- Attempt to create table on next publish if subscribe creation failed
- Metrics continue updating in-memory even if table writes fail

### Table Cleanup Failures
- Log error but keep entry in registry with `subscriptionCount: 0`
- Retry cleanup on next unsubscribe or periodically

### $SYS Metric Update Failures
- Log error but don't block metric updates
- In-memory metrics remain accurate even if table writes fail
- Subscribers still get updates via resource system

## Testing Considerations

1. **Subscribe before publish**: Verify table created, message stored
2. **Publish before subscribe**: Verify table auto-created on publish
3. **Multiple subscribers**: Verify subscription count tracking
4. **Retained messages**: Verify tables not cleaned up when retained flag set
5. **Unsubscribe cleanup**: Verify tables dropped when no subscribers and no retained
6. **$SYS updates**: Verify all metric changes write to table
7. **Wildcard subscriptions**: Verify wildcards don't create tables
8. **Edge cases**: Empty topics, invalid characters, rapid subscribe/unsubscribe

## Performance Considerations

- **Write volume**: Immediate updates for $SYS metrics (low load environment confirmed)
- **Table count**: Hierarchical grouping limits table proliferation
- **Registry lookup**: In-memory `Map` avoids database queries for table existence checks
- **Flexible schema**: No schema validation overhead, HarperDB handles type flexibility

## Future Enhancements

1. **Message retention policy**: Auto-delete old messages after N days/hours
2. **Table size limits**: Drop oldest messages when table exceeds size limit
3. **Configurable cleanup delay**: Grace period before table cleanup
4. **$SYS history**: Optional time-series table for $SYS metric history
5. **Topic statistics**: Per-topic message rates, subscriber counts, etc.
