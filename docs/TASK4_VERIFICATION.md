# Task 4: Manual Verification Steps

## Overview
Task 4 creates the mqtt_sys_metrics table during plugin initialization and sets up the table reference in the mqtt module.

## Implementation
- Added module-level variable `sysMetricsTable` in src/mqtt.js
- Exported `setSysMetricsTable()` function to set the table reference
- Modified src/index.js to create the table during plugin initialization
- Added error handling for table creation failures

## Manual Verification Steps

### Prerequisites
- HarperDB server with MQTT broker enabled
- Plugin installed in HarperDB

### Step 1: Start HarperDB with the Plugin

```bash
# Start HarperDB server
harperdb start

# Watch the logs for plugin initialization messages
```

### Step 2: Check Logs for Table Creation

Look for the following log messages in sequence:

```
[MQTT-Broker-Interop-Plugin:Index]: Creating mqtt_sys_metrics table
[MQTT-Broker-Interop-Plugin:Index]: $SYS metrics table created successfully
[MQTT-Broker-Interop-Plugin:MQTT]: $SYS metrics table reference set
```

If you see these messages, the table creation was successful.

### Step 3: Verify Table Exists in Database

Use HarperDB Studio or SQL client to verify the table:

```sql
-- Check if the table exists
SHOW TABLES FROM mqtt_topics;

-- Should see: mqtt_sys_metrics
```

Or use the HarperDB API:

```bash
curl -X POST http://localhost:9925 \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic YOUR_AUTH_TOKEN" \
  -d '{
    "operation": "describe_table",
    "database": "mqtt_topics",
    "table": "mqtt_sys_metrics"
  }'
```

### Step 4: Verify Table Schema

The table should have the following structure:
- **Primary Key**: `id`
- **Fields**: Flexible schema (no type constraints)
- **Expected columns** (will be added by data):
  - `id` (string) - Topic path (e.g., "$SYS/broker/clients/connected")
  - `topic` (string) - Same as id
  - `value` (any type) - Metric value
  - `timestamp` (date) - Last update time

```sql
-- Check table structure
DESCRIBE mqtt_topics.mqtt_sys_metrics;
```

### Step 5: Verify Table is Empty Initially

The table should be empty until metrics start being written:

```sql
SELECT * FROM mqtt_topics.mqtt_sys_metrics;
-- Should return 0 rows initially
```

### Expected Behavior

1. Table is created in the `mqtt_topics` database
2. Table name is `mqtt_sys_metrics`
3. Primary key is set to `id`
4. Table reference is stored in the mqtt module
5. No errors in logs during initialization

### Error Scenarios

If table creation fails, you should see:

```
[MQTT-Broker-Interop-Plugin:Index]: Failed to create $SYS metrics table: [error message]
```

Common issues:
- Database `mqtt_topics` doesn't exist (create it first)
- Insufficient permissions
- HarperDB server not properly initialized

### Success Criteria

- [ ] Log shows "Creating mqtt_sys_metrics table"
- [ ] Log shows "$SYS metrics table created successfully"
- [ ] Log shows "$SYS metrics table reference set"
- [ ] Table exists in mqtt_topics database
- [ ] Table has primary key 'id'
- [ ] No errors in logs

## Next Steps

After verifying Task 4:
- Task 5 will implement the upsertSysMetric helper to write metrics to this table
- Tasks 6-11 will update all metric methods to call upsertSysMetric
- The table will start receiving metric data once those tasks are complete
