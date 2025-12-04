# MQTT $SYS Topics Solution for HarperDB

## 🎯 The Key Discovery

HarperDB's MQTT implementation is **table-centric**, not a traditional MQTT broker:

1. **MQTT topics = Database records**: Topic `table-name/record-id` maps to a database record
2. **Publishing = Table updates**: Updating a record publishes to MQTT
3. **Subscribing = Watching records**: Subscribers get notified of record changes
4. **Events on `server.mqtt.events`**: Not `server.mqtt` or `server.mqtt.on()`

## 📂 Solution Architecture

```
HarperDB Database
    ↓
┌─────────────┐
│  sys table  │  ← Records for each $SYS topic
├─────────────┤
│ broker_ver  │ → Publishes to: sys/broker_version
│ clients_con │ → Publishes to: sys/broker_clients_connected
│ msgs_recv   │ → Publishes to: sys/broker_messages_received
└─────────────┘
    ↓
MQTT Clients subscribe to sys/#
```

## 🔧 Implementation Components

### 1. `plugin-v2.js` - Main Plugin
- Creates the `sys` table in `mqtt` database
- Sets up MQTT event listeners on `server.mqtt.events`
- Starts periodic updates

### 2. `lib/sys-table.js` - Table Manager
- Creates records for each $SYS topic
- Updates records (which publishes to MQTT)
- Maps topic paths to record IDs

### 3. `lib/mqtt-events.js` - Event Handler
- Listens to `connected`, `disconnected`, etc. on `server.mqtt.events`
- Updates metrics based on events

### 4. `lib/metrics.js` - Metrics Tracking (existing)
- Tracks all broker statistics
- Used by sys-table to get current values

## 🚀 How It Works

1. **Plugin starts**: Creates `sys` table with records for each metric
2. **MQTT events occur**: Event listeners update metrics
3. **Periodic updates**: Every 10 seconds, update all records with current values
4. **HarperDB publishes**: Table updates automatically publish to MQTT topics
5. **Clients receive**: Subscribers to `sys/#` get the updates

## ✅ Testing

### Method 1: Using Test Client
```bash
# Run the test client
node test/mqtt-client-test.js

# It will:
# - Connect to localhost:1883
# - Subscribe to sys/#
# - Display received messages
```

### Method 2: Using MQTT Explorer
1. Connect to `localhost:1883`
2. Subscribe to `sys/#`
3. Watch for updates every 10 seconds

### Method 3: Using mosquitto_sub
```bash
# Subscribe to all sys topics
mosquitto_sub -h localhost -t 'sys/#' -v

# Subscribe to specific topic
mosquitto_sub -h localhost -t 'sys/broker_clients_connected' -v
```

## 📊 Expected Topics

When working correctly, you'll see messages on these topics:

- `sys/broker_version` - Broker version
- `sys/broker_clients_connected` - Connected client count
- `sys/broker_messages_received` - Total messages received
- `sys/broker_bytes_received` - Total bytes received
- ... and 30+ more metrics

## 🔍 Debugging

Check the HarperDB logs for:

1. **Plugin initialization**:
   ```
   [mqtt-broker-interop:plugin-v2] ✅ $SYS topics table initialized
   [mqtt-broker-interop:plugin-v2] ✅ MQTT event listeners configured
   ```

2. **Table updates**:
   ```
   [mqtt-broker-interop:sys-table] Updated 36/36 $SYS topics
   ```

3. **Event handling**:
   ```
   [mqtt-broker-interop:mqtt-events] Client connected: client-123
   ```

## ⚠️ Common Issues

1. **No messages received**: Check if `sys` table exists in HarperDB
2. **Events not firing**: Verify `server.mqtt.events` is available
3. **Table not created**: Ensure plugin runs in context with `ensureTable`

## 🎉 Success Criteria

The plugin is working when:
- ✅ `sys` table exists with records for each metric
- ✅ Records update every 10 seconds
- ✅ MQTT clients can subscribe to `sys/#` and receive updates
- ✅ Metrics reflect actual MQTT activity

## 📈 Performance

- **Minimal overhead**: Updates only run every 10 seconds
- **Efficient**: Uses HarperDB's native pub/sub
- **Scalable**: Works with HarperDB clustering