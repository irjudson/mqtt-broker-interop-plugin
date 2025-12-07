# Dynamic MQTT Table Creation Design

## Changes Made

### Minimal Fix Implemented

**Changed:** `src/mqtt.js:641`
```javascript
// Before:
export: { name: topic }

// After:
export: { name: topic, contentType: 'mqtt' }
```

**Why:** This single line change registers tables with HarperDB's resource system for MQTT protocol, allowing `resources.getMatch(topic, 'mqtt')` to find dynamically created tables.

**Impact:** Fixes "The topic does not exist, no resource has been defined to handle this topic" error when clients subscribe to new topics.

## Overview

This design document outlines how to dynamically create HarperDB tables for MQTT topics when clients subscribe or publish to topics that don't have existing tables. This enables full interoperability with standard MQTT tools that expect to be able to subscribe and publish to arbitrary topic hierarchies.

## Background

### Current State

The MQTT broker interop plugin currently:
- Creates tables dynamically in subscription event handlers
- Tracks subscriptions and publishes in `topicRegistry` (Set) and `tableRegistry` (Map)
- Maps MQTT topics to tables: `a/b/c/d` → table `mqtt_a_b_c`, row `d`
- Uses event monitoring to track MQTT operations

### Problem

When a client subscribes to `a/b/c/#`:
1. HarperDB's `DurableSubscriptionsSession` calls `resources.getMatch('a/b/c', 'mqtt')`
2. No resource is registered for that path
3. Throws error: "The topic does not exist, no resource has been defined to handle this topic"

Similarly, when publishing to a new topic, the table may not exist yet, causing publish failures.

### Root Cause

Tables created with `server.ensureTable()` are not automatically registered as MQTT resources. The `@export` directive in GraphQL schema (e.g., `@export(name: "$SYS")`) is what registers a table as an MQTT resource, but we're not using this for dynamically created tables.

## Goals

1. **Automatic table creation** - Create tables on-demand when subscriptions or publishes happen
2. **Proper MQTT registration** - Ensure tables are registered so `resources.getMatch()` finds them
3. **Topic hierarchy mapping** - Maintain the `a/b/c/d` → table `mqtt_a_b_c`, row `d` mapping
4. **Wildcard support** - Handle subscriptions like `a/b/c/#` by creating the base topic table
5. **Subscription registry** - Track subscriptions per table (already implemented via `subscriptionCount`)

## Architecture

### Topic-to-Table Mapping

**MQTT Topic Structure:**
```
a/b/c/d
└─┬─┘ │
  │   └─ Row ID
  └───── Table name (mqtt_a_b_c)
```

**Examples:**
- Topic: `home/sensors/temp` → Table: `mqtt_home_sensors`, Row: `temp`
- Topic: `home/sensors/temp/living-room` → Table: `mqtt_home_sensors_temp`, Row: `living-room`
- Subscription: `home/sensors/#` → Creates table: `mqtt_home_sensors`

### Key Components

#### 1. Table Creation with MQTT Export

Tables must be created with the `export` option to register them as MQTT resources:

```javascript
async function createTableWithMqttExport(topic, tableName) {
    logger.info(`Creating table '${tableName}' for MQTT topic '${topic}'`);

    const table = await server.ensureTable({
        name: tableName,
        schema: {
            id: { type: 'string', primaryKey: true },
            topic: { type: 'string', indexed: true },
            payload: { type: 'string' },
            qos: { type: 'number' },
            retain: { type: 'boolean' },
            timestamp: { type: 'string' },
            client_id: { type: 'string' }
        },
        export: {
            name: topic,           // Export as MQTT topic "a/b/c"
            contentType: 'mqtt'    // Register for MQTT protocol
        }
    });

    // Track in registry
    tableRegistry.set(tableName, {
        tableName,
        topic,
        subscriptionCount: 0,
        hasRetained: false
    });

    logger.info(`Table '${tableName}' created and exported as MQTT topic '${topic}'`);
    return table;
}
```

**Key change:** Adding `export: { name: topic, contentType: 'mqtt' }` ensures that when `resources.getMatch(topic, 'mqtt')` is called, HarperDB finds this table.

#### 2. Topic Parsing Helper

Extract the base topic from various patterns:

```javascript
/**
 * Extract base topic from MQTT topic or pattern
 * @param {string} topic - MQTT topic or pattern
 * @returns {string} - Base topic for table creation
 *
 * Examples:
 *   "a/b/c/d" → "a/b/c"
 *   "a/b/c/#" → "a/b/c"
 *   "a/b/c/+" → "a/b/c"
 *   "a/b/c" → "a/b"
 */
function extractBaseTopic(topic) {
    // Remove wildcard suffixes
    let cleanTopic = topic.replace(/#$/, '').replace(/\+$/, '');
    // Remove trailing slash
    cleanTopic = cleanTopic.replace(/\/$/, '');

    // Split into segments
    const segments = cleanTopic.split('/');

    // For hierarchical topics, all but last segment = table
    // Last segment = row ID
    if (segments.length > 1) {
        return segments.slice(0, -1).join('/');
    }

    // Single segment topics use default table
    return cleanTopic;
}

/**
 * Get table name for a topic (existing function, enhanced)
 * @param {string} topic - MQTT topic or base topic
 * @returns {string} - Sanitized table name
 */
function getTableNameForTopic(topic) {
    if (!topic) {
        return 'mqtt_messages';
    }

    // Sanitize: lowercase, replace invalid chars with underscore
    const sanitized = topic
        .toLowerCase()
        .replace(/\//g, '_')  // Slashes become underscores
        .replace(/[^a-z0-9_]/g, '_');

    return `mqtt_${sanitized}`;
}
```

#### 3. Subscription Event Handler (Enhanced)

Update the existing subscription handler in `mqtt.js`:

```javascript
mqttEvents.on('subscribe', async (subscriptions, session) => {
    const clientId = session?.sessionId;

    if (Array.isArray(subscriptions)) {
        for (const sub of subscriptions) {
            const topic = typeof sub === 'string' ? sub : sub?.topic;
            logger.info(`Subscription request - clientId: ${clientId}, topic: ${topic}`);

            // Skip empty topics
            if (!topic) {
                logger.debug('Skipping empty topic subscription');
                continue;
            }

            // Handle $SYS topics separately (existing code)
            if (topic.startsWith('$SYS/') || topic === '$SYS/#') {
                logger.info(`$SYS topic subscription - clientId: ${clientId}, topic: ${topic}`);
                metrics.onSubscribe(clientId, topic);
                onSysTopicSubscribe(clientId, topic);
                continue;
            }

            // Extract base topic and table name
            const baseTopic = extractBaseTopic(topic);
            const tableName = getTableNameForTopic(baseTopic);

            logger.debug(`Subscription mapping - topic: ${topic}, baseTopic: ${baseTopic}, table: ${tableName}`);

            // Create table if doesn't exist
            if (!tableRegistry.has(tableName)) {
                logger.info(`Creating new table for subscription - table: ${tableName}, baseTopic: ${baseTopic}`);
                try {
                    await createTableWithMqttExport(baseTopic, tableName);
                } catch (error) {
                    logger.error(`Failed to create table '${tableName}':`, error);
                    // Continue anyway - might already exist
                }
            }

            // Get or initialize table entry
            let tableEntry = tableRegistry.get(tableName);
            if (!tableEntry) {
                tableEntry = {
                    tableName,
                    topic: baseTopic,
                    subscriptionCount: 0,
                    hasRetained: false
                };
                tableRegistry.set(tableName, tableEntry);
            }

            // Increment subscription count
            tableEntry.subscriptionCount++;
            logger.debug(`Subscription count for table '${tableName}': ${tableEntry.subscriptionCount}`);

            // Update metrics
            metrics.onSubscribe(clientId, topic);
        }
    }
});
```

#### 4. Publish Event Handler (Enhanced)

Update the existing publish handler in `mqtt.js`:

```javascript
mqttEvents.on('publish', async (packet, session) => {
    const topic = packet?.topic;
    const payload = packet?.payload;
    const clientId = session?.sessionId;
    const qos = packet?.qos || 0;
    const retain = packet?.retain || false;
    const byteCount = payload ? Buffer.byteLength(payload) : 0;

    logger.debug(`Publish received - clientId: ${clientId}, topic: ${topic}, bytes: ${byteCount}`);
    metrics.onPublishReceived({ topic, payload }, byteCount);

    // Skip $SYS topics (existing code)
    if (topic && topic.startsWith('$SYS/')) {
        logger.trace('Skipping $SYS topic publish');
        return;
    }

    // Track topic in registry
    if (topic) {
        topicRegistry.add(topic);
        logger.trace(`Topic added to registry: ${topic}`);

        // Extract base topic and table name
        const baseTopic = extractBaseTopic(topic);
        const tableName = getTableNameForTopic(baseTopic);

        logger.debug(`Publish mapping - topic: ${topic}, baseTopic: ${baseTopic}, table: ${tableName}`);

        // Create table if doesn't exist
        if (!tableRegistry.has(tableName)) {
            logger.info(`Creating new table for publish - table: ${tableName}, baseTopic: ${baseTopic}`);
            try {
                await createTableWithMqttExport(baseTopic, tableName);
            } catch (error) {
                logger.error(`Failed to create table '${tableName}':`, error);
                // Continue anyway - might already exist from another thread
            }
        }

        // Write message to table
        await writeMessageToTable(tableName, {
            topic,
            payload,
            qos,
            retain,
            client_id: clientId
        });

        // Update retained message tracking
        if (retain) {
            logger.debug(`Retained message published to topic '${topic}'`);
            updateRetainedStatus(tableName, true);
        }
    }
});
```

#### 5. Updated writeMessageToTable()

Simplify since table creation is now handled earlier:

```javascript
async function writeMessageToTable(tableName, message) {
    try {
        // Get table from global tables
        const table = globalThis.tables?.[tableName];
        if (!table) {
            logger.warn(`Table '${tableName}' not found for topic '${message.topic}'`);
            return;
        }

        await table.put({
            id: generateMessageId(),
            topic: message.topic,
            payload: message.payload,
            qos: message.qos,
            retain: message.retain,
            timestamp: new Date().toISOString(),
            client_id: message.client_id
        });

        logger.trace(`Wrote message to table '${tableName}'`);
    } catch (error) {
        logger.error(`Write error for table '${tableName}':`, error.message);
    }
}
```

## Implementation Plan

### Phase 1: Core Table Creation

1. ✅ Understand publish flow and identify integration points
2. ✅ Design table creation with MQTT export
3. Add `createTableWithMqttExport()` function to `mqtt.js`
4. Add `extractBaseTopic()` helper function to `mqtt.js`
5. Test table creation manually

### Phase 2: Subscription Handler Integration

1. Update subscription event handler to call `createTableWithMqttExport()`
2. Test subscribing to new topics (e.g., `mosquitto_sub -t "test/sensor/#"`)
3. Verify `resources.getMatch()` finds the created table
4. Test wildcard subscriptions

### Phase 3: Publish Handler Integration

1. Update publish event handler to call `createTableWithMqttExport()`
2. Test publishing to new topics (e.g., `mosquitto_pub -t "test/sensor/temp" -m "25"`)
3. Verify messages are written to correct tables
4. Test publish before subscribe (table should be created)

### Phase 4: Testing & Validation

1. Test subscription-first workflow
2. Test publish-first workflow
3. Test concurrent subscriptions/publishes from multiple clients
4. Test edge cases (empty topics, invalid characters, very long topics)
5. Verify table registry stays synchronized
6. Performance testing (many topics, many tables)

## Data Flow

### Subscription Flow

```
Client subscribes to "a/b/c/#"
    ↓
MQTT event: 'subscribe'
    ↓
Extract base topic: "a/b/c"
    ↓
Get table name: "mqtt_a_b_c"
    ↓
Check tableRegistry
    ↓
NOT FOUND → createTableWithMqttExport("a/b/c", "mqtt_a_b_c")
    ↓
server.ensureTable({ export: { name: "a/b/c", contentType: "mqtt" } })
    ↓
Table registered with HarperDB resources
    ↓
resources.getMatch("a/b/c", "mqtt") → SUCCESS ✓
    ↓
Subscription established
```

### Publish Flow

```
Client publishes to "a/b/c/d"
    ↓
MQTT event: 'publish'
    ↓
Extract base topic: "a/b/c"
    ↓
Get table name: "mqtt_a_b_c"
    ↓
Check tableRegistry
    ↓
NOT FOUND → createTableWithMqttExport("a/b/c", "mqtt_a_b_c")
    ↓
Table exists (from subscription or just created)
    ↓
writeMessageToTable("mqtt_a_b_c", { id: "d", payload: ... })
    ↓
Message stored and broadcast to subscribers
```

## Edge Cases & Considerations

### 1. Race Conditions

**Problem:** Multiple clients subscribe/publish to same topic simultaneously

**Solution:**
- Use `server.ensureTable()` which is idempotent
- Wrap in try-catch and continue if table already exists
- Check `globalThis.tables` after creation to verify

### 2. Invalid Topic Names

**Problem:** Topics with special characters (e.g., `topic/with spaces/test`)

**Solution:**
- Sanitize in `getTableNameForTopic()`: replace invalid chars with `_`
- Keep original topic name in `export: { name: topic }` for MQTT routing

### 3. Very Long Topics

**Problem:** Topic hierarchy can be arbitrarily deep (e.g., `a/b/c/d/e/f/g/h/i/j/k`)

**Solution:**
- Maintain current approach: all segments except last → table name
- Table name length limits will naturally cap hierarchy depth
- Consider adding max depth validation

### 4. Table Cleanup

**Problem:** Tables created but never used again

**Solution:**
- Existing cleanup logic remains: track `subscriptionCount`
- When count reaches 0 and no retained messages, optionally delete table
- Or keep tables indefinitely for historical data

### 5. Topic Collisions

**Problem:** Topics that map to same table name after sanitization

**Solution:**
- Accept this as a feature: related topics share a table
- Row IDs (last segment) differentiate messages
- Document this behavior

## Testing Strategy

### Unit Tests

```javascript
describe('extractBaseTopic', () => {
    test('extracts base from full topic', () => {
        expect(extractBaseTopic('a/b/c/d')).toBe('a/b/c');
    });

    test('handles wildcard patterns', () => {
        expect(extractBaseTopic('a/b/c/#')).toBe('a/b/c');
        expect(extractBaseTopic('a/b/c/+')).toBe('a/b/c');
    });

    test('handles single segment', () => {
        expect(extractBaseTopic('test')).toBe('test');
    });
});

describe('getTableNameForTopic', () => {
    test('converts topic to table name', () => {
        expect(getTableNameForTopic('a/b/c')).toBe('mqtt_a_b_c');
    });

    test('sanitizes special characters', () => {
        expect(getTableNameForTopic('test-topic')).toBe('mqtt_test_topic');
    });
});

describe('createTableWithMqttExport', () => {
    test('creates table with export', async () => {
        const table = await createTableWithMqttExport('test/topic', 'mqtt_test_topic');
        expect(table).toBeDefined();
        expect(globalThis.tables['mqtt_test_topic']).toBeDefined();
    });

    test('registers with correct contentType', async () => {
        await createTableWithMqttExport('test/mqtt', 'mqtt_test_mqtt');
        // Verify resources.getMatch() finds it
        const entry = resources.getMatch('test/mqtt', 'mqtt');
        expect(entry).not.toBeNull();
    });
});
```

### Integration Tests

```javascript
describe('Dynamic Table Creation - Integration', () => {
    test('subscription creates table', async () => {
        const client = mqtt.connect('mqtt://localhost:1883');

        await new Promise((resolve) => {
            client.subscribe('dynamic/test/#', () => resolve());
        });

        // Verify table exists
        expect(globalThis.tables['mqtt_dynamic_test']).toBeDefined();

        client.end();
    });

    test('publish creates table', async () => {
        const client = mqtt.connect('mqtt://localhost:1883');

        await new Promise((resolve) => {
            client.publish('dynamic/publish/sensor', 'test', () => resolve());
        });

        // Verify table exists
        expect(globalThis.tables['mqtt_dynamic_publish_sensor']).toBeDefined();

        client.end();
    });

    test('publish before subscribe works', async () => {
        const client = mqtt.connect('mqtt://localhost:1883');

        // Publish first
        await new Promise((resolve) => {
            client.publish('order/test/temp', '25', () => resolve());
        });

        // Subscribe second
        const messages = [];
        client.subscribe('order/test/#');
        client.on('message', (topic, message) => {
            messages.push({ topic, message: message.toString() });
        });

        // Publish again
        await new Promise((resolve) => {
            client.publish('order/test/humidity', '60', () => resolve());
        });

        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should receive the second message
        expect(messages.length).toBeGreaterThan(0);

        client.end();
    });
});
```

### E2E Tests with Real Tools

```bash
# Test 1: Subscribe to new topic
mosquitto_sub -h localhost -t "e2e/test/#" -v &
sleep 1
mosquitto_pub -h localhost -t "e2e/test/sensor" -m "25"
# Expected: subscriber receives message

# Test 2: Publish to new topic, then subscribe
mosquitto_pub -h localhost -t "e2e/publish-first/temp" -m "20"
sleep 1
mosquitto_sub -h localhost -t "e2e/publish-first/#" -v -C 1
# Expected: subscriber receives retained message (if retain flag set)

# Test 3: Wildcard patterns
mosquitto_sub -h localhost -t "e2e/wildcard/+/sensor" -v &
sleep 1
mosquitto_pub -h localhost -t "e2e/wildcard/room1/sensor" -m "data1"
mosquitto_pub -h localhost -t "e2e/wildcard/room2/sensor" -m "data2"
# Expected: subscriber receives both messages
```

## Success Criteria

Implementation is complete when:

1. ✓ Clients can subscribe to arbitrary topics without 404 errors
2. ✓ Tables are created automatically with `export: { contentType: 'mqtt' }`
3. ✓ `resources.getMatch(topic, 'mqtt')` finds dynamically created tables
4. ✓ Publishes work before subscriptions exist
5. ✓ Subscriptions work before publishes happen
6. ✓ Wildcard subscriptions (`#`, `+`) create appropriate base tables
7. ✓ Messages are routed correctly through HarperDB's MQTT system
8. ✓ Table registry stays synchronized
9. ✓ All tests pass
10. ✓ Performance is acceptable (no measurable overhead vs. pre-created tables)

## Files to Modify

- **src/mqtt.js** - Add `createTableWithMqttExport()`, `extractBaseTopic()`, update event handlers
- **test/table-creation.test.js** - New test file for table creation logic
- **test/integration.test.js** - Update with new integration tests
- **README.md** - Document dynamic table creation feature

## Future Enhancements

### Option 1: Configurable Table Structure

Allow users to configure table schema per topic pattern:

```yaml
mqtt:
  topic_tables:
    "sensors/#":
      schema:
        temperature: number
        humidity: number
        timestamp: datetime
```

### Option 2: Table Expiration

Automatically clean up unused tables:

```yaml
mqtt:
  table_expiration:
    enabled: true
    after_days: 30  # Delete tables with no activity for 30 days
```

### Option 3: Topic-to-Table Strategies

Support different mapping strategies:

```yaml
mqtt:
  table_strategy: "hierarchical"  # current: a/b/c/d → table a/b/c
  # or "flat": a/b/c/d → table mqtt_messages, indexed by full topic
  # or "per-segment": each segment gets its own table
```

## References

- [MQTT Topic Best Practices](https://www.hivemq.com/blog/mqtt-essentials-part-5-mqtt-topics-best-practices/)
- [HarperDB Resource Documentation](https://docs.harperdb.io/docs/reference/resources)
- [Design Document: MQTT $SYS Topics](./2025-11-14-mqtt-sys-topics-design.md)

---

**Document Status**: Draft for Implementation
**Last Updated**: 2025-12-07
**Author**: Claude Code (with user collaboration)
