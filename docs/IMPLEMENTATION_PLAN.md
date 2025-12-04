# MQTT $SYS Topics Implementation Plan for HarperDB

## Key Discoveries

1. **HarperDB's MQTT is Database-Driven**: MQTT topics map directly to database tables and records
   - Topic pattern: `table-name/record-id`
   - Publishing = updating a database record (with retain flag)
   - Subscribing = watching database records for changes

2. **MQTT Events are on `server.mqtt.events`**: Not `server.mqtt.on()` or `server.mqtt`
   - Available events: `connected`, `connection`, `auth-failed`, `disconnected`
   - Example: `server.mqtt.events.on('connected', (session, socket) => {})`

3. **Publishing Through Tables**: To publish MQTT messages, you update table records
   - Retained messages = database updates
   - Non-retained = transient notifications

## Implementation Strategy

### 1. Create $SYS Topics Table
Create a table called `sys` with records for each $SYS topic:
- Record ID: The topic path (e.g., "broker/version")
- Fields: `value`, `timestamp`, `description`

### 2. Map $SYS Topics to Records
Transform paths like `$SYS/broker/version` to record IDs:
- Remove `$SYS/` prefix
- Replace `/` with `_` or keep hierarchical

### 3. Update Records to Publish
When metrics change, update the corresponding record:
```javascript
await sysTable.update({
  id: 'broker_version',
  value: '1.0.0',
  timestamp: Date.now()
});
```
This automatically publishes to MQTT topic `sys/broker_version`

### 4. Listen to MQTT Events
Track connections, disconnections, and messages:
```javascript
server.mqtt.events.on('connected', (session) => {
  metrics.onConnect(session.clientId);
});
```

### 5. Handle Subscriptions
When clients subscribe to `$SYS/#`, they're subscribing to `sys/#` table records

## File Structure

```
src/
├── plugin.js              # Main plugin entry
├── lib/
│   ├── sys-table.js      # Manages $SYS topics table
│   ├── mqtt-events.js    # MQTT event listeners
│   ├── metrics.js        # Metrics tracking (existing)
│   └── sys-updater.js    # Updates $SYS records periodically
└── resources.js           # REST endpoints (existing)
```

## Topics Mapping

| MQTT Topic | Table Record ID | Value |
|------------|-----------------|-------|
| `$SYS/broker/version` | `broker_version` | "1.0.0" |
| `$SYS/broker/clients/connected` | `broker_clients_connected` | 42 |
| `$SYS/broker/messages/received` | `broker_messages_received` | 1000 |

## Key Code Changes Needed

1. **Stop trying to call `mqtt.publish()`** - doesn't exist
2. **Use table updates instead** - this is how HarperDB publishes
3. **Access events via `server.mqtt.events`** - not `server.mqtt`
4. **Create actual database records** for each $SYS topic

## Testing Plan

1. Create the sys table with initial records
2. Connect MQTT client and subscribe to `sys/#`
3. Update a record and verify MQTT message received
4. Monitor MQTT events and update metrics
5. Verify periodic updates work

## Why Previous Attempts Failed

- We were trying to use `server.mqtt.publish()` which doesn't exist
- We didn't understand topics map to table records
- We weren't creating actual database entries
- We were looking for events in the wrong place (`server.mqtt` vs `server.mqtt.events`)