/**
 * MQTT $SYS Topics Implementation
 * Provides standard MQTT broker statistics via $SYS topics
 */

// Access global server and logger
const { server } = globalThis;
const logger = server?.logger || console;

// Access tables from globalThis (it's a global, not an import)
const {tables} = globalThis;

// Load average time windows
const TIME_WINDOWS = {
  ONE_MIN: { ms: 60 * 1000, minutes: 1 },
  FIVE_MIN: { ms: 5 * 60 * 1000, minutes: 5 },
  FIFTEEN_MIN: { ms: 15 * 60 * 1000, minutes: 15 }
};

// Global topic registry to track all published topics
export const topicRegistry = new Set();

// Table registry to track table metadata
export const tableRegistry = new Map();

// $SYS metrics table reference (set during plugin initialization)
let sysMetricsTable = null;

/**
 * MqttMetrics - Tracks MQTT broker statistics
 * This is the primary extension point for adding new metrics
 */
export class MqttMetrics {
  constructor() {
    logger.info(
      '[MQTT-Broker-Interop-Plugin:MQTT]: Initializing MQTT metrics tracking'
    );
    this.startTime = new Date();

    this.clients = {
      connected: 0,
      disconnected: 0, // persistent sessions
      maximum: 0,
      total: 0,
      expired: 0 // expired persistent sessions
    };

    this.messages = {
      received: 0,
      sent: 0,
      publishReceived: 0,
      publishSent: 0,
      publishDropped: 0, // dropped messages
      inflight: 0, // QoS > 0 messages awaiting acknowledgment
      stored: 0 // messages in storage
    };

    this.bytes = {
      received: 0,
      sent: 0
    };

    this.store = {
      messageCount: 0,
      messageBytes: 0
    };

    this.subscriptions = {
      count: 0
    };

    this.retained = {
      count: 0
    };

    // System metrics
    this.heap = {
      current: 0,
      maximum: 0
    };

    // Load averages
    this.load = {
      connections: { oneMin: 0, fiveMin: 0, fifteenMin: 0 },
      messagesReceived: { oneMin: 0, fiveMin: 0, fifteenMin: 0 },
      messagesSent: { oneMin: 0, fiveMin: 0, fifteenMin: 0 },
      bytesReceived: { oneMin: 0, fiveMin: 0, fifteenMin: 0 },
      bytesSent: { oneMin: 0, fiveMin: 0, fifteenMin: 0 },
      publishReceived: { oneMin: 0, fiveMin: 0, fifteenMin: 0 },
      publishSent: { oneMin: 0, fiveMin: 0, fifteenMin: 0 }
    };

    // Track samples for load average calculation
    this._loadSamples = {
      connections: [],
      messagesReceived: [],
      messagesSent: [],
      bytesReceived: [],
      bytesSent: [],
      publishReceived: [],
      publishSent: []
    };

    // Update system metrics periodically (delayed start after table initialization)
    this._metricsInterval = setInterval(
      () => this._updateSystemMetrics(),
      10000
    ); // Update every 10 seconds
    // Allow Node.js to exit if this is the only thing keeping it alive (important for tests)
    if (this._metricsInterval.unref) {
      this._metricsInterval.unref();
    }
  }

  /**
   * Stop the metrics update interval (useful for testing)
   */
  stopMetricsUpdates() {
    if (this._metricsInterval) {
      clearInterval(this._metricsInterval);
      this._metricsInterval = null;
    }
  }

  onConnecting(_socket) {
    logger.debug('[MQTT-Broker-Interop-Plugin:MQTT]: Client connecting');
  }

  onConnect(clientId, persistent) {
    logger.debug(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Client connected - clientId: ${clientId}, persistent: ${persistent}`
    );
    this.clients.connected++;
    this.clients.total = this.clients.connected + this.clients.disconnected;

    if (this.clients.connected > this.clients.maximum) {
      this.clients.maximum = this.clients.connected;
      logger.info(
        `[MQTT-Broker-Interop-Plugin:MQTT]: New maximum clients reached: ${this.clients.maximum}`
      );
    }

    // Upsert metrics to table
    upsertSysMetric('$SYS/broker/clients/connected', this.clients.connected);
    upsertSysMetric('$SYS/broker/clients/total', this.clients.total);
    upsertSysMetric('$SYS/broker/clients/maximum', this.clients.maximum);
  }

  onDisconnect(clientId, persistent) {
    logger.debug(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Client disconnected - clientId: ${clientId}, persistent: ${persistent}`
    );
    if (this.clients.connected > 0) {
      this.clients.connected--;
    }

    if (persistent) {
      this.clients.disconnected++;
    }

    this.clients.total = this.clients.connected + this.clients.disconnected;

    // Upsert metrics to table
    upsertSysMetric('$SYS/broker/clients/connected', this.clients.connected);
    upsertSysMetric(
      '$SYS/broker/clients/disconnected',
      this.clients.disconnected
    );
  }

  onPublishReceived(message, byteCount) {
    logger.trace(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Message received - topic: ${message.topic}, bytes: ${byteCount}`
    );
    this.messages.received++;
    this.messages.publishReceived++;
    this.bytes.received += byteCount;

    // Upsert metrics to table
    upsertSysMetric('$SYS/broker/messages/received', this.messages.received);
    upsertSysMetric(
      '$SYS/broker/publish/messages/received',
      this.messages.publishReceived
    );
    upsertSysMetric('$SYS/broker/bytes/received', this.bytes.received);
  }

  onPublishSent(message, byteCount) {
    logger.trace(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Message sent - topic: ${message.topic}, bytes: ${byteCount}`
    );
    this.messages.sent++;
    this.messages.publishSent++;
    this.bytes.sent += byteCount;

    // Upsert metrics to table
    upsertSysMetric('$SYS/broker/messages/sent', this.messages.sent);
    upsertSysMetric(
      '$SYS/broker/publish/messages/sent',
      this.messages.publishSent
    );
    upsertSysMetric('$SYS/broker/bytes/sent', this.bytes.sent);
  }

  onSubscribe(clientId, topic) {
    logger.debug(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Client subscribed - clientId: ${clientId}, topic: ${topic}`
    );
    this.subscriptions.count++;

    // Upsert metrics to table
    upsertSysMetric(
      '$SYS/broker/subscriptions/count',
      this.subscriptions.count
    );
  }

  onUnsubscribe(clientId, topic) {
    logger.debug(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Client unsubscribed - clientId: ${clientId}, topic: ${topic}`
    );
    this.subscriptions.count--;

    // Upsert metrics to table
    upsertSysMetric(
      '$SYS/broker/subscriptions/count',
      this.subscriptions.count
    );
  }

  onRetainedMessageAdded() {
    logger.debug('[MQTT-Broker-Interop-Plugin:MQTT]: Retained message added');
    this.retained.count++;

    // Upsert metrics to table
    upsertSysMetric('$SYS/broker/retained messages/count', this.retained.count);
  }

  onRetainedMessageRemoved() {
    logger.debug('[MQTT-Broker-Interop-Plugin:MQTT]: Retained message removed');
    this.retained.count--;

    // Upsert metrics to table
    upsertSysMetric('$SYS/broker/retained messages/count', this.retained.count);
  }

  onMessageDropped() {
    logger.warn('[MQTT-Broker-Interop-Plugin:MQTT]: Message dropped');
    this.messages.publishDropped++;
  }

  onMessageInflight(delta) {
    logger.trace(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Message inflight delta: ${delta}, total: ${this.messages.inflight + delta}`
    );
    this.messages.inflight += delta;
  }

  onMessageStored(delta) {
    logger.trace(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Message stored delta: ${delta}, total: ${this.messages.stored + delta}`
    );
    this.messages.stored += delta;
  }

  onExpiredClient() {
    logger.info('[MQTT-Broker-Interop-Plugin:MQTT]: Client session expired');
    this.clients.expired++;
  }

  _updateSystemMetrics() {
    // Update heap metrics
    if (process.memoryUsage) {
      const memUsage = process.memoryUsage();
      this.heap.current = memUsage.heapUsed;
      this.heap.maximum = Math.max(this.heap.maximum, memUsage.heapUsed);
    }

    // Calculate load averages
    const now = Date.now();

    // Add current sample
    this._loadSamples.connections.push({
      time: now,
      value: this.clients.connected
    });
    this._loadSamples.messagesReceived.push({
      time: now,
      value: this.messages.received
    });
    this._loadSamples.messagesSent.push({
      time: now,
      value: this.messages.sent
    });
    this._loadSamples.bytesReceived.push({
      time: now,
      value: this.bytes.received
    });
    this._loadSamples.bytesSent.push({ time: now, value: this.bytes.sent });
    this._loadSamples.publishReceived.push({
      time: now,
      value: this.messages.publishReceived
    });
    this._loadSamples.publishSent.push({
      time: now,
      value: this.messages.publishSent
    });

    // Clean old samples (keep 15 minutes worth)
    const cutoff = now - 15 * 60 * 1000;
    Object.keys(this._loadSamples).forEach((key) => {
      this._loadSamples[key] = this._loadSamples[key].filter(
        (s) => s.time > cutoff
      );
    });

    // Calculate averages
    this._calculateLoadAverages();

    // Upsert heap metrics to table
    upsertSysMetric('$SYS/broker/heap/current', this.heap.current);
    upsertSysMetric('$SYS/broker/heap/maximum', this.heap.maximum);

    // Upsert uptime
    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    upsertSysMetric('$SYS/broker/uptime', uptime);

    // Upsert load averages
    upsertSysMetric(
      '$SYS/broker/load/connections/1min',
      this.load.connections.oneMin
    );
    upsertSysMetric(
      '$SYS/broker/load/connections/5min',
      this.load.connections.fiveMin
    );
    upsertSysMetric(
      '$SYS/broker/load/connections/15min',
      this.load.connections.fifteenMin
    );

    upsertSysMetric(
      '$SYS/broker/load/messages/received/1min',
      this.load.messagesReceived.oneMin
    );
    upsertSysMetric(
      '$SYS/broker/load/messages/received/5min',
      this.load.messagesReceived.fiveMin
    );
    upsertSysMetric(
      '$SYS/broker/load/messages/received/15min',
      this.load.messagesReceived.fifteenMin
    );

    upsertSysMetric(
      '$SYS/broker/load/messages/sent/1min',
      this.load.messagesSent.oneMin
    );
    upsertSysMetric(
      '$SYS/broker/load/messages/sent/5min',
      this.load.messagesSent.fiveMin
    );
    upsertSysMetric(
      '$SYS/broker/load/messages/sent/15min',
      this.load.messagesSent.fifteenMin
    );

    upsertSysMetric(
      '$SYS/broker/load/bytes/received/1min',
      this.load.bytesReceived.oneMin
    );
    upsertSysMetric(
      '$SYS/broker/load/bytes/received/5min',
      this.load.bytesReceived.fiveMin
    );
    upsertSysMetric(
      '$SYS/broker/load/bytes/received/15min',
      this.load.bytesReceived.fifteenMin
    );

    upsertSysMetric(
      '$SYS/broker/load/bytes/sent/1min',
      this.load.bytesSent.oneMin
    );
    upsertSysMetric(
      '$SYS/broker/load/bytes/sent/5min',
      this.load.bytesSent.fiveMin
    );
    upsertSysMetric(
      '$SYS/broker/load/bytes/sent/15min',
      this.load.bytesSent.fifteenMin
    );

    upsertSysMetric(
      '$SYS/broker/load/publish/received/1min',
      this.load.publishReceived.oneMin
    );
    upsertSysMetric(
      '$SYS/broker/load/publish/received/5min',
      this.load.publishReceived.fiveMin
    );
    upsertSysMetric(
      '$SYS/broker/load/publish/received/15min',
      this.load.publishReceived.fifteenMin
    );

    upsertSysMetric(
      '$SYS/broker/load/publish/sent/1min',
      this.load.publishSent.oneMin
    );
    upsertSysMetric(
      '$SYS/broker/load/publish/sent/5min',
      this.load.publishSent.fiveMin
    );
    upsertSysMetric(
      '$SYS/broker/load/publish/sent/15min',
      this.load.publishSent.fifteenMin
    );
  }

  _calculateLoadAverages() {
    const now = Date.now();

    // Helper function to calculate load average for a time window
    const calculatePeriodAverage = (samples, cutoffTime, minutes) => {
      const periodSamples = samples.filter((s) => s.time > cutoffTime);
      if (periodSamples.length > 0) {
        const delta =
          periodSamples[periodSamples.length - 1].value -
          periodSamples[0].value;
        return delta / minutes;
      }
      return 0;
    };

    // Calculate load averages for each metric across all time windows
    Object.keys(this._loadSamples).forEach((metric) => {
      const samples = this._loadSamples[metric];

      this.load[metric].oneMin = calculatePeriodAverage(
        samples,
        now - TIME_WINDOWS.ONE_MIN.ms,
        TIME_WINDOWS.ONE_MIN.minutes
      );
      this.load[metric].fiveMin = calculatePeriodAverage(
        samples,
        now - TIME_WINDOWS.FIVE_MIN.ms,
        TIME_WINDOWS.FIVE_MIN.minutes
      );
      this.load[metric].fifteenMin = calculatePeriodAverage(
        samples,
        now - TIME_WINDOWS.FIFTEEN_MIN.ms,
        TIME_WINDOWS.FIFTEEN_MIN.minutes
      );
    });
  }
}

// Singleton instance
export const metrics = new MqttMetrics();

// ============================================================================
// HarperDB Server and MQTT Integration
// ============================================================================
let harperServer = null;

/**
 * Topic-to-metric mapping for efficient $SYS topic resolution
 * Each key is a $SYS topic path, each value is a function that returns the current metric value
 */
// Helper function to get version (moved outside class for topic map)
function getBrokerVersion() {
  // Try to get HarperDB version from various possible sources
  if (harperServer?.version) {
    return harperServer.version;
  }
  if (process.env.HARPERDB_VERSION) {
    return process.env.HARPERDB_VERSION;
  }
  if (globalThis.harperVersion) {
    return globalThis.harperVersion;
  }
  // Fallback to a generic version string
  return 'HarperDB 4.x';
}

const SYS_TOPIC_MAP = {
  // Static topics
  '$SYS/broker/version': () => getBrokerVersion(),
  '$SYS/broker/timestamp': (m) => m.startTime.toISOString(),

  // Client metrics
  '$SYS/broker/clients/connected': (m) => m.clients.connected,
  '$SYS/broker/clients/disconnected': (m) => m.clients.disconnected,
  '$SYS/broker/clients/maximum': (m) => m.clients.maximum,
  '$SYS/broker/clients/total': (m) => m.clients.total,

  // Message metrics
  '$SYS/broker/messages/received': (m) => m.messages.received,
  '$SYS/broker/messages/sent': (m) => m.messages.sent,
  '$SYS/broker/messages/inflight': (m) => m.messages.inflight,
  '$SYS/broker/publish/messages/received': (m) => m.messages.publishReceived,
  '$SYS/broker/publish/messages/sent': (m) => m.messages.publishSent,

  // Bandwidth metrics
  '$SYS/broker/bytes/received': (m) => m.bytes.received,
  '$SYS/broker/bytes/sent': (m) => m.bytes.sent,

  // Subscription metrics
  '$SYS/broker/subscriptions/count': (m) => m.subscriptions.count,
  '$SYS/broker/retained messages/count': (m) => m.retained.count,

  // System metrics
  '$SYS/broker/heap/current': (m) => m.heap.current,
  '$SYS/broker/heap/current size': (m) => m.heap.current,
  '$SYS/broker/heap/maximum': (m) => m.heap.maximum,
  '$SYS/broker/heap/maximum size': (m) => m.heap.maximum,
  '$SYS/broker/uptime': (m) =>
    Math.floor((Date.now() - m.startTime.getTime()) / 1000),

  // Load averages - Connections
  '$SYS/broker/load/connections/1min': (m) =>
    Math.round(m.load.connections.oneMin),
  '$SYS/broker/load/connections/5min': (m) =>
    Math.round(m.load.connections.fiveMin),
  '$SYS/broker/load/connections/15min': (m) =>
    Math.round(m.load.connections.fifteenMin),

  // Load averages - Messages received
  '$SYS/broker/load/messages/received/1min': (m) =>
    Math.round(m.load.messagesReceived.oneMin),
  '$SYS/broker/load/messages/received/5min': (m) =>
    Math.round(m.load.messagesReceived.fiveMin),
  '$SYS/broker/load/messages/received/15min': (m) =>
    Math.round(m.load.messagesReceived.fifteenMin),

  // Load averages - Messages sent
  '$SYS/broker/load/messages/sent/1min': (m) =>
    Math.round(m.load.messagesSent.oneMin),
  '$SYS/broker/load/messages/sent/5min': (m) =>
    Math.round(m.load.messagesSent.fiveMin),
  '$SYS/broker/load/messages/sent/15min': (m) =>
    Math.round(m.load.messagesSent.fifteenMin),

  // Load averages - Bytes received
  '$SYS/broker/load/bytes/received/1min': (m) =>
    Math.round(m.load.bytesReceived.oneMin),
  '$SYS/broker/load/bytes/received/5min': (m) =>
    Math.round(m.load.bytesReceived.fiveMin),
  '$SYS/broker/load/bytes/received/15min': (m) =>
    Math.round(m.load.bytesReceived.fifteenMin),

  // Load averages - Bytes sent
  '$SYS/broker/load/bytes/sent/1min': (m) =>
    Math.round(m.load.bytesSent.oneMin),
  '$SYS/broker/load/bytes/sent/5min': (m) =>
    Math.round(m.load.bytesSent.fiveMin),
  '$SYS/broker/load/bytes/sent/15min': (m) =>
    Math.round(m.load.bytesSent.fifteenMin),

  // Load averages - Publish received
  '$SYS/broker/load/publish/received/1min': (m) =>
    Math.round(m.load.publishReceived.oneMin),
  '$SYS/broker/load/publish/received/5min': (m) =>
    Math.round(m.load.publishReceived.fiveMin),
  '$SYS/broker/load/publish/received/15min': (m) =>
    Math.round(m.load.publishReceived.fifteenMin),

  // Load averages - Publish sent
  '$SYS/broker/load/publish/sent/1min': (m) =>
    Math.round(m.load.publishSent.oneMin),
  '$SYS/broker/load/publish/sent/5min': (m) =>
    Math.round(m.load.publishSent.fiveMin),
  '$SYS/broker/load/publish/sent/15min': (m) =>
    Math.round(m.load.publishSent.fifteenMin)
};

/**
 * SysTopics - Resource class that handles all $SYS/* topic requests
 * Maps MQTT $SYS topic paths to current metric values
 */
export class SysTopics {
  constructor() {
    // Use singleton metrics instance
    this.metrics = metrics;
  }

  /**
   * GET handler for $SYS topics
   * @param {Object} request - Request object with path property
   * @returns {string|number|null} - Current metric value or null if unknown topic
   */
  get(request) {
    const topic = request.path;
    logger.trace(
      `[MQTT-Broker-Interop-Plugin:MQTT]: $SYS topic request - ${topic}`
    );

    // Use topic map for efficient lookup
    const handler = SYS_TOPIC_MAP[topic];
    if (handler) {
      return handler(this.metrics);
    }

    // Unknown topic
    logger.warn(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Unknown $SYS topic requested - ${topic}`
    );
    return null;
  }

  /**
   * Get HarperDB version string
   */
  getVersion() {
    logger.trace('[MQTT-Broker-Interop-Plugin:MQTT]: Getting broker version');
    return getBrokerVersion();
  }
}
// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get table name for a topic based on hierarchy
 * @param {string} topic - MQTT topic path
 * @returns {string} - Table name (mqtt_<segment> or mqtt_messages)
 */
export function getTableNameForTopic(topic) {
  if (!topic) {
    return 'mqtt_messages';
  }

  // Extract first segment before '/'
  const firstSegment = topic.split('/')[0];

  // If no hierarchy (no slash) or empty first segment, use default table
  if (!firstSegment || (firstSegment === topic && !topic.includes('/'))) {
    return 'mqtt_messages';
  }

  // Sanitize: lowercase, replace invalid chars with underscore
  const sanitized = firstSegment.toLowerCase().replace(/[^a-z0-9_]/g, '_');

  return `mqtt_${sanitized}`;
}

/**
 * Generate unique message ID for table storage
 * @returns {string} - Unique ID (timestamp-random)
 */
export function generateMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Upsert a $SYS metric to the table
 * @param {string} topic - $SYS topic path
 * @param {any} value - Metric value
 */
export function upsertSysMetric(topic, value) {
  if (!sysMetricsTable) {
    logger.debug(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Cannot upsert metric '${topic}' - table not initialized`
    );
    return;
  }

  try {
    // Remove $SYS/ prefix since the table is exported with @export(name: "$SYS")
    // HarperDB uses the 'id' field (primary key) as the MQTT topic path
    // So we store the relative path in 'id' and full path in 'topic' for queries
    const relativePath = topic.startsWith('$SYS/') ? topic.substring(5) : topic;

    logger.info(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Upserting $SYS metric - topic='${topic}', relativePath='${relativePath}', value='${value}'`
    );

    sysMetricsTable.put({
      id: relativePath, // Relative path as ID (e.g., "broker/clients/connected")
      topic: topic, // Full path for backwards compatibility with queries
      value: String(value),
      timestamp: new Date().toISOString()
    });
    logger.debug(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Upserted $SYS metric - ${topic} = ${value}`
    );
  } catch (error) {
    logger.error(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Failed to upsert $SYS metric '${topic}':`,
      error
    );
  }
}

/**
 * Set the $SYS metrics table reference
 * @param {Object} table - HarperDB table instance
 */
export function setSysMetricsTable(table) {
  sysMetricsTable = table;
  logger.info(
    '[MQTT-Broker-Interop-Plugin:MQTT]: $SYS metrics table reference set'
  );

  // Trigger initial system metrics update now that table is available
  metrics._updateSystemMetrics();
}

/**
 * Create/get table for a topic
 * @param {string} topic - MQTT topic path
 * @param {string} tableName - Sanitized table name
 */
export async function createTableForTopic(topic, tableName) {
  // Check if table exists in global tables
  const existingTable = globalThis.tables?.[tableName];
  if (existingTable) {
    logger.debug(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Table '${tableName}' already exists`
    );
    return existingTable;
  }

  logger.info(
    `[MQTT-Broker-Interop-Plugin:MQTT]: Creating table '${tableName}' for topic '${topic}'`
  );

  try {
    // Use an existing table's operation() method to create the new table
    // Pick any existing table (e.g., mqtt_topics) and call its operation() method
    const anyTable = tables.mqtt_topics || globalThis.tables?.mqtt_topics;

    if (!anyTable) {
      logger.error(
        '[MQTT-Broker-Interop-Plugin:MQTT]: No existing table found to call operation() on'
      );
      return null;
    }

    await anyTable.operation({
      operation: 'create_table',
      database: 'data',
      table: tableName,
      primary_key: 'id'
    });

    logger.info(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Table '${tableName}' created successfully`
    );

    // Return the newly created table
    return globalThis.tables?.[tableName] || tables[tableName];
  } catch (error) {
    // Ignore "already exists" errors (idempotent)
    if (error.message && error.message.includes('already exists')) {
      logger.debug(
        `[MQTT-Broker-Interop-Plugin:MQTT]: Table '${tableName}' already exists (caught during creation)`
      );
      return globalThis.tables?.[tableName] || globalThis.databases?.data?.[tableName];
    }

    logger.error(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Failed to create table '${tableName}':`,
      error
    );
    logger.error(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Error message: ${error.message}`
    );
    return null;
  }
}

/**
 * Write a message to the appropriate table
 * @param {string} tableName - Table name
 * @param {Object} message - Message data (topic, payload, qos, retain, client_id)
 */
export async function writeMessageToTable(tableName, message) {
  try {
    // Write directly to mqtt_topics table
    const mqttTopicsTable = globalThis.tables?.mqtt_topics;
    if (!mqttTopicsTable) {
      logger.debug(
        '[MQTT-Broker-Interop-Plugin:MQTT]: mqtt_topics table not available'
      );
      return;
    }

    // Get existing record to preserve subscription_count
    let subscriptionCount = 0;
    try {
      const existing = await mqttTopicsTable.get(message.topic);
      if (existing && existing.doesExist()) {
        subscriptionCount = existing.subscription_count || 0;
      }
    } catch {
      // Ignore, will create new record
    }

    // Convert payload to string if it's a Buffer
    const payloadStr = Buffer.isBuffer(message.payload)
      ? message.payload.toString()
      : message.payload;

    // id field must be the topic path for MQTT routing (HarperDB uses id as MQTT topic)
    await mqttTopicsTable.put({
      id: message.topic, // Use topic path as ID for MQTT routing
      topic: message.topic,
      payload: payloadStr,
      qos: message.qos,
      retain: message.retain,
      timestamp: new Date().toISOString(),
      client_id: message.client_id,
      subscription_count: subscriptionCount
    });

    logger.info(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Wrote message to mqtt_topics - topic: ${message.topic}, payload: ${payloadStr}`
    );
  } catch (error) {
    logger.error(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Write error: ${error.message}`
    );
  }
}

/**
 * Update retained message status for a table
 * @param {string} tableName - Table name
 * @param {boolean} hasRetained - Whether table has retained messages
 */
export function updateRetainedStatus(tableName, hasRetained) {
  const tableEntry = tableRegistry.get(tableName);
  if (tableEntry) {
    tableEntry.hasRetained = hasRetained;
    logger.trace(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Updated retained status for table '${tableName}': ${hasRetained}`
    );
  } else {
    logger.debug(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Cannot update retained status - table '${tableName}' not in registry`
    );
  }
}

/**
 * Cleanup table tracking when no longer needed
 * @param {string} tableName - Table name to cleanup
 */
export function cleanupTable(tableName) {
  logger.debug(
    `[MQTT-Broker-Interop-Plugin:MQTT]: Cleaning up tracking for table '${tableName}'`
  );
  tableRegistry.delete(tableName);
}

// ============================================================================
// MQTT Event Monitoring Setup
// ============================================================================

/**
 * Setup MQTT event monitoring on worker threads
 * @param {Object} server - HarperDB server instance
 * @param {Object} _logger - Logger instance
 */
export function setupMqttMonitoring(server, _logger) {
  logger.info('[MQTT-Broker-Interop-Plugin:MQTT]: Setting up MQTT monitoring');
  if (!server?.mqtt?.events) {
    logger.warn(
      '[MQTT-Broker-Interop-Plugin:MQTT]: MQTT events not available on this thread'
    );
    return;
  }

  harperServer = server;
  const mqttEvents = server.mqtt.events;
  logger.debug(
    '[MQTT-Broker-Interop-Plugin:MQTT]: MQTT events object obtained'
  );

  // Monitor client connections
  mqttEvents.on('connected', (session, _socket) => {
    const clientId = session?.sessionId;
    const username = session?.user?.username;
    // In MQTT, clean flag determines if session is persistent (clean=false means persistent)
    const clean = session?.clean ?? true; // Default to true (non-persistent) if not specified
    logger.info(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Client connected - clientId: ${clientId}, username: ${username}, clean: ${clean}`
    );

    // REMOVED: Wrapping session.publish breaks HarperDB's MQTT validation
    // session.publish is for OUTGOING messages (table → MQTT subscribers)
    // We need to intercept INCOMING messages (MQTT publishers → table) differently
    // For now, we rely on HarperDB's native @export to handle subscriptions

    metrics.onConnect(clientId, !clean); // !clean = persistent
  });

  // Monitor client disconnections
  mqttEvents.on('disconnected', (session, _socket) => {
    // Handle case where session is undefined (connection failed before auth)
    if (!session || !session.sessionId) {
      logger.debug(
        '[MQTT-Broker-Interop-Plugin:MQTT]: Disconnect event with no session (pre-auth disconnect)'
      );
      return;
    }

    const clientId = session.sessionId;
    // Check if session was persistent - sessionWasPresent indicates persistent session
    const persistent = session.sessionWasPresent || false;
    logger.info(
      `[MQTT-Broker-Interop-Plugin:MQTT]: Client disconnected - clientId: ${clientId}, persistent: ${persistent}`
    );
    metrics.onDisconnect(clientId, persistent);
  });

  // NOTE: HarperDB does NOT have a 'publish' event
  // Only these events exist: connection, connected, auth-failed, disconnected
  // See: https://docs.harperdb.io/docs/developers/applications/mqtt#mqtt-events
  // MQTT publishes are intercepted via server.mqtt.addTopicHandler('#') in index.js instead

  // Monitor subscription events
  mqttEvents.on('subscribe', (subscriptions, session) => {
    const clientId = session?.sessionId;
    if (Array.isArray(subscriptions)) {
      subscriptions.forEach((sub) => {
        const topic = typeof sub === 'string' ? sub : sub?.topic;
        logger.info(
          `[MQTT-Broker-Interop-Plugin:MQTT]: Subscription - clientId: ${clientId}, topic: ${topic}`
        );

        // Skip empty topics
        if (!topic) {
          logger.debug(
            '[MQTT-Broker-Interop-Plugin:MQTT]: Skipping empty topic subscription'
          );
          return;
        }

        // Handle $SYS topics - don't create tables
        if (topic.startsWith('$SYS/') || topic === '$SYS/#') {
          logger.info(
            `[MQTT-Broker-Interop-Plugin:MQTT]: $SYS topic subscription detected - clientId: ${clientId}, topic: ${topic}`
          );
          metrics.onSubscribe(clientId, topic);
          // Note: onSysTopicSubscribe removed with polling code
          return;
        }

        // Update subscription_count for non-wildcard topics in mqtt_topics table
        if (!topic.includes('#') && !topic.includes('+')) {
          const mqttTopicsTable = globalThis.tables?.mqtt_topics;
          if (mqttTopicsTable) {
            setTimeout(async () => {
              try {
                const existing = await mqttTopicsTable.get(topic);
                let subscriptionCount = 0;
                let existingData = {};

                if (existing) {
                  const doesExist =
                    typeof existing.doesExist === 'function'
                      ? existing.doesExist()
                      : existing.doesExist;
                  if (doesExist || (existing.id && existing.id === topic)) {
                    subscriptionCount = existing.subscription_count || 0;
                    existingData = {
                      payload: existing.payload,
                      qos: existing.qos,
                      retain: existing.retain,
                      client_id: existing.client_id,
                      timestamp: existing.timestamp
                    };
                  }
                }

                subscriptionCount++;

                await mqttTopicsTable.put({
                  id: topic,
                  topic: topic,
                  subscription_count: subscriptionCount,
                  ...existingData,
                  payload: existingData.payload || '',
                  qos: existingData.qos ?? 0,
                  retain: existingData.retain ?? false,
                  timestamp: existingData.timestamp || new Date().toISOString(),
                  client_id: existingData.client_id || clientId
                });

                logger.debug(
                  `[MQTT-Broker-Interop-Plugin:MQTT]: Updated subscription_count for ${topic}: ${subscriptionCount}`
                );
              } catch (error) {
                logger.error(
                  `[MQTT-Broker-Interop-Plugin:MQTT]: Failed to update subscription_count for ${topic}:`,
                  error
                );
              }
            });
          }
        }

        // Handle wildcards - extract base topic and create table for it
        if (topic.includes('#') || topic.includes('+')) {
          logger.info(
            `[MQTT-Broker-Interop-Plugin:MQTT]: Wildcard subscription - topic: ${topic}`
          );
          metrics.onSubscribe(clientId, topic);

          // Extract base topic (e.g., "testtopic/#" -> "testtopic")
          const baseTopic = topic.split('/')[0];
          if (baseTopic && baseTopic !== '#' && baseTopic !== '+') {
            const tableName = getTableNameForTopic(baseTopic);
            if (!tableRegistry.has(tableName)) {
              logger.info(
                `[MQTT-Broker-Interop-Plugin:MQTT]: Creating table for wildcard base - table: ${tableName}, baseTopic: ${baseTopic}`
              );
              // Fire-and-forget table creation with explicit error handling
              createTableForTopic(baseTopic, tableName).catch((error) => {
                logger.error(
                  `[MQTT-Broker-Interop-Plugin:MQTT]: Failed to create table for wildcard base '${baseTopic}':`,
                  error
                );
              });
              tableRegistry.set(tableName, {
                tableName,
                subscriptionCount: 1,
                hasRetained: false
              });
            } else {
              const entry = tableRegistry.get(tableName);
              entry.subscriptionCount++;
            }
          }
          return;
        }

        // Get table name for this topic
        const tableName = getTableNameForTopic(topic);

        // Create table if doesn't exist (check registry first)
        if (!tableRegistry.has(tableName)) {
          logger.info(
            `[MQTT-Broker-Interop-Plugin:MQTT]: Creating new table for subscription - table: ${tableName}, topic: ${topic}`
          );
          // Fire-and-forget table creation with explicit error handling
          createTableForTopic(topic, tableName).catch((error) => {
            logger.error(
              `[MQTT-Broker-Interop-Plugin:MQTT]: Failed to create table for subscription '${topic}':`,
              error
            );
          });
          tableRegistry.set(tableName, {
            tableName,
            subscriptionCount: 0,
            hasRetained: false
          });
        }

        // Increment subscription count
        const entry = tableRegistry.get(tableName);
        entry.subscriptionCount++;
        logger.debug(
          `[MQTT-Broker-Interop-Plugin:MQTT]: Incremented subscription count for table '${tableName}': ${entry.subscriptionCount}`
        );

        metrics.onSubscribe(clientId, topic);
      });
    }
  });

  // Monitor unsubscription events
  mqttEvents.on('unsubscribe', (unsubscriptions, session) => {
    const clientId = session?.sessionId;
    if (Array.isArray(unsubscriptions)) {
      unsubscriptions.forEach((topic) => {
        logger.info(
          `[MQTT-Broker-Interop-Plugin:MQTT]: Unsubscription - clientId: ${clientId}, topic: ${topic}`
        );
        metrics.onUnsubscribe(clientId, topic);

        // Skip $SYS topics
        if (topic && (topic.startsWith('$SYS/') || topic === '$SYS/#')) {
          logger.info(
            `[MQTT-Broker-Interop-Plugin:MQTT]: $SYS topic unsubscription detected - clientId: ${clientId}, topic: ${topic}`
          );
          // Note: onSysTopicUnsubscribe removed with polling code
          return;
        }

        // Skip wildcards
        if (topic && (topic.includes('#') || topic.includes('+'))) {
          logger.debug(
            `[MQTT-Broker-Interop-Plugin:MQTT]: Wildcard unsubscription - topic: ${topic}`
          );
          return;
        }

        // Skip empty topics
        if (!topic) {
          return;
        }

        // Decrement subscription_count for this topic
        const mqttTopicsTable = globalThis.tables?.mqtt_topics;
        if (mqttTopicsTable) {
          setTimeout(async () => {
            try {
              const existing = await mqttTopicsTable.get(topic);
              if (existing && existing.doesExist && existing.doesExist()) {
                let subscriptionCount = existing.subscription_count || 0;
                if (subscriptionCount > 0) {
                  subscriptionCount--;

                  // Delete record if no subscribers and not retained
                  if (subscriptionCount === 0 && !existing.retain) {
                    await mqttTopicsTable.delete(topic);
                    logger.debug(
                      `[MQTT-Broker-Interop-Plugin:MQTT]: Deleted record for ${topic} (no subscribers, not retained)`
                    );
                  } else {
                    // Keep record but update subscription count
                    await mqttTopicsTable.put({
                      id: topic,
                      topic: topic,
                      payload: existing.payload,
                      qos: existing.qos,
                      retain: existing.retain,
                      timestamp: existing.timestamp,
                      client_id: existing.client_id,
                      subscription_count: subscriptionCount
                    });

                    logger.debug(
                      `[MQTT-Broker-Interop-Plugin:MQTT]: Decremented subscription_count for ${topic}: ${subscriptionCount}`
                    );
                  }
                }
              }
            } catch (error) {
              logger.error(
                `[MQTT-Broker-Interop-Plugin:MQTT]: Failed to decrement subscription_count for ${topic}:`,
                error
              );
            }
          });
        }

        // Decrement subscription count
        const tableName = getTableNameForTopic(topic);
        const tableEntry = tableRegistry.get(tableName);

        if (tableEntry) {
          tableEntry.subscriptionCount--;
          logger.debug(
            `[MQTT-Broker-Interop-Plugin:MQTT]: Decremented subscription count for table '${tableName}': ${tableEntry.subscriptionCount}`
          );

          // Cleanup only if no subscribers AND no retained messages
          if (tableEntry.subscriptionCount === 0 && !tableEntry.hasRetained) {
            logger.info(
              `[MQTT-Broker-Interop-Plugin:MQTT]: Table '${tableName}' is now inactive, cleaning up`
            );
            cleanupTable(tableName);
          } else if (tableEntry.subscriptionCount === 0) {
            logger.info(
              `[MQTT-Broker-Interop-Plugin:MQTT]: Table '${tableName}' has no subscribers but has retained messages, keeping alive`
            );
          }
        } else {
          logger.debug(
            `[MQTT-Broker-Interop-Plugin:MQTT]: Unsubscribe from topic '${topic}' - table '${tableName}' not in registry`
          );
        }
      });
    }
  });

  // Monitor retained message events if available
  if (mqttEvents.on) {
    mqttEvents.on('retained-added', (packet) => {
      const topic = packet?.topic;
      logger.debug(
        `[MQTT-Broker-Interop-Plugin:MQTT]: Retained message added - topic: ${topic}`
      );
      metrics.onRetainedMessageAdded();
    });

    mqttEvents.on('retained-removed', (topic) => {
      logger.debug(
        `[MQTT-Broker-Interop-Plugin:MQTT]: Retained message removed - topic: ${topic}`
      );
      metrics.onRetainedMessageRemoved();
    });
  }

  logger.info(
    '[MQTT-Broker-Interop-Plugin:MQTT]: MQTT event monitoring setup complete'
  );
}

/*
 * ============================================================================
 * TODO: PHASE 5 - End-to-End Testing & Documentation
 * ============================================================================
 *
 * E2E TESTING:
 * 1. Test with real MQTT client (mosquitto_sub):
 *    mosquitto_sub -h localhost -t '$SYS/#' -v
 *
 * 2. Test with MQTT.js:
 *    const mqtt = require('mqtt');
 *    const client = mqtt.connect('mqtt://localhost:1883');
 *    client.subscribe('$SYS/broker/clients/connected');
 *    client.on('message', (topic, message) => {
 *      console.log(topic, message.toString());
 *    });
 *
 * 3. Test with MQTT Explorer GUI
 *
 * DOCUMENTATION:
 * - Update README with $SYS topics feature
 * - Document all 14 supported topics
 * - Document sys_interval configuration
 * - Add examples of monitoring with standard tools
 * - Note extension points for adding more metrics
 *
 * PERFORMANCE VALIDATION:
 * - Measure overhead of metric tracking
 * - Verify publisher uses minimal resources when no subscribers
 * - Test with high message volume
 */

/*
 * ============================================================================
 * EXTENSION POINTS - For Future Enhancement (Option C Metrics)
 * ============================================================================
 *
 * To add extended metrics, follow these steps:
 *
 * 1. Add new metric category to MqttMetrics constructor:
 *    this.load = { oneMin: 0, fiveMin: 0, fifteenMin: 0 };
 *    this.system = { uptime: 0, heapCurrent: 0, heapMaximum: 0 };
 *    this.perClient = new Map(); // client-id → stats
 *
 * 2. Add methods to update the metrics:
 *    updateLoadAverage() {
 *      // Calculate 1/5/15 minute load averages
 *    }
 *
 * 3. Add topic handlers to SysTopics.get():
 *    if (topic === '$SYS/broker/load/messages/received/1min') {
 *      return this.metrics.load.oneMin;
 *    }
 *    if (topic === '$SYS/broker/uptime') {
 *      const uptime = Date.now() - this.metrics.startTime.getTime();
 *      return Math.floor(uptime / 1000);
 *    }
 *
 * 4. Add topics to publishAllSysTopics() list if they should update periodically
 *
 * 5. Write tests for new metrics following TDD approach
 *
 * Example Extended Topics:
 * - $SYS/broker/load/messages/received/1min
 * - $SYS/broker/load/messages/received/5min
 * - $SYS/broker/load/messages/received/15min
 * - $SYS/broker/load/messages/sent/1min
 * - $SYS/broker/load/messages/sent/5min
 * - $SYS/broker/load/messages/sent/15min
 * - $SYS/broker/uptime (in seconds)
 * - $SYS/broker/heap/current
 * - $SYS/broker/heap/maximum
 * - $SYS/broker/clients/<client-id>/connected
 * - $SYS/broker/clients/<client-id>/messages/sent
 * - $SYS/broker/clients/<client-id>/messages/received
 */
