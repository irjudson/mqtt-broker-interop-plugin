# MQTT Broker Interoperability Plugin for HarperDB

Adds standard MQTT `$SYS` metrics and monitoring capabilities to HarperDB's built-in MQTT broker.

## Features

- **$SYS Metrics** - Standard MQTT broker statistics (clients, messages, bytes, subscriptions)
- **Real-time Monitoring** - Event-driven updates to metrics as MQTT activity occurs
- **Subscription Tracking** - Automatic cleanup when clients disconnect
- **Load Averages** - 1/5/15 minute load statistics for connections, messages, and bytes

## Installation

### Prerequisites

- HarperDB 4.x or higher
- Node.js 20+ (required by HarperDB)

### Setup

1. Clone this plugin into your HarperDB project:

```bash
cd /path/to/your/harperdb/project
git clone https://github.com/HarperDB/mqtt-broker-interop-plugin.git
```

2. Install dependencies:

```bash
cd mqtt-broker-interop-plugin
npm install
```

3. The plugin will be automatically loaded by HarperDB on startup.

## Configuration

Configuration is handled via `config.yaml`. The default MQTT settings are:

```yaml
mqtt:
  network:
    port: 1883
    securePort: 8883
  webSocket: true
  mTLS: false
  requireAuthentication: false
```

Modify these settings as needed for your deployment.

## Usage

### Monitoring with $SYS Topics

Subscribe to broker metrics using any MQTT client:

#### Using mosquitto_sub

```bash
# Subscribe to all $SYS topics
mosquitto_sub -h localhost -t '$SYS/#' -v

# Subscribe to specific metrics
mosquitto_sub -h localhost -t '$SYS/broker/clients/connected'
mosquitto_sub -h localhost -t '$SYS/broker/messages/received'
```

#### Using MQTT.js

```javascript
const mqtt = require("mqtt");
const client = mqtt.connect("mqtt://localhost:1883");

client.subscribe("$SYS/#");
client.on("message", (topic, message) => {
  console.log(`${topic}: ${message.toString()}`);
});
```

#### Using Python (paho-mqtt)

```python
import paho.mqtt.client as mqtt

def on_message(client, userdata, message):
    print(f"{message.topic}: {message.payload.decode()}")

client = mqtt.Client()
client.on_message = on_message
client.connect("localhost", 1883)
client.subscribe("$SYS/#")
client.loop_forever()
```

### Available Metrics

#### Static Topics (sent once on connection)

- `$SYS/broker/version` - HarperDB version
- `$SYS/broker/timestamp` - Broker start time (ISO 8601)

#### Client Metrics

- `$SYS/broker/clients/connected` - Currently connected clients
- `$SYS/broker/clients/disconnected` - Disconnected clients with persistent sessions
- `$SYS/broker/clients/maximum` - Peak concurrent connections
- `$SYS/broker/clients/total` - Total clients (connected + disconnected)
- `$SYS/broker/clients/expired` - Expired persistent sessions

#### Message Metrics

- `$SYS/broker/messages/received` - Total messages received
- `$SYS/broker/messages/sent` - Total messages sent
- `$SYS/broker/messages/inflight` - QoS > 0 messages awaiting acknowledgment
- `$SYS/broker/messages/stored` - Messages in persistent storage
- `$SYS/broker/publish/messages/received` - PUBLISH packets received
- `$SYS/broker/publish/messages/sent` - PUBLISH packets sent
- `$SYS/broker/publish/messages/dropped` - Dropped messages

#### Bandwidth Metrics

- `$SYS/broker/bytes/received` - Total bytes received
- `$SYS/broker/bytes/sent` - Total bytes sent

#### Storage Metrics

- `$SYS/broker/store/messages/count` - Messages in storage
- `$SYS/broker/store/messages/bytes` - Storage size in bytes

#### Subscription Metrics

- `$SYS/broker/subscriptions/count` - Active subscriptions
- `$SYS/broker/retained messages/count` - Retained messages

#### System Metrics

- `$SYS/broker/heap/current` - Current heap memory usage (bytes)
- `$SYS/broker/heap/maximum` - Peak heap memory usage (bytes)
- `$SYS/broker/uptime` - Broker uptime in seconds

#### Load Averages (1/5/15 minute intervals)

- `$SYS/broker/load/connections/*min` - Connection rate
- `$SYS/broker/load/messages/received/*min` - Message receive rate
- `$SYS/broker/load/messages/sent/*min` - Message send rate
- `$SYS/broker/load/bytes/received/*min` - Byte receive rate
- `$SYS/broker/load/bytes/sent/*min` - Byte send rate
- `$SYS/broker/load/publish/received/*min` - Publish receive rate
- `$SYS/broker/load/publish/sent/*min` - Publish send rate

## Schema

The plugin uses two HarperDB tables:

### mqtt_topics

Stores all MQTT messages with subscription tracking. Exported as MQTT root path (`/`).

### mqtt_sys_metrics

Stores $SYS metric values. Exported as `$SYS` path for MQTT subscriptions.

Both tables are automatically created from `schema/schema.graphql`.

## Testing

Run the test suite:

```bash
npm test
```

Current test coverage: **47/47 tests passing** ✅

### Adding Tests

More tests are always welcome! The test suite uses Node.js built-in test runner:

```javascript
import { describe, it } from "node:test";
import assert from "node:assert";

describe("Your Feature", () => {
  it("does something", () => {
    assert.equal(actual, expected);
  });
});
```

## Architecture

The plugin consists of three main components:

1. **MqttMetrics** (`src/mqtt.js`) - Tracks all broker statistics in real-time
2. **SysTopics Resource** (`src/resources.js`) - Exposes metrics via MQTT $SYS topics
3. **Event Monitoring** (`src/mqtt.js`) - Hooks into HarperDB's MQTT events to update metrics

Metrics are updated immediately as MQTT events occur (connections, publishes, subscribes) and written to the `mqtt_sys_metrics` table. HarperDB's `@export` mechanism makes them available via MQTT subscriptions.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Submit a pull request

**Areas especially welcome:**

- Additional test coverage
- Performance improvements
- Documentation enhancements

## License

Apache-2.0

## Links

- [HarperDB Documentation](https://docs.harperdb.io/)
- [MQTT Protocol Specification](https://mqtt.org/)
- [MQTT $SYS Topics Specification](https://github.com/mqtt/mqtt.org/wiki/SYS-Topics)
