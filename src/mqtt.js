/**
 * MQTT $SYS Topics Implementation
 * Provides standard MQTT broker statistics via $SYS topics
 */

// Access global server and logger
const server = globalThis.server;
const logger = server?.logger || console;

// Global topic registry to track all published topics
export const topicRegistry = new Set();

// Table registry to track table metadata
export const tableRegistry = new Map();

/**
 * MqttMetrics - Tracks MQTT broker statistics
 * This is the primary extension point for adding new metrics
 */
export class MqttMetrics {
  constructor() {
    logger.info('[MQTT-Broker-Interop-Plugin:MQTT]: Initializing MQTT metrics tracking');
    this.startTime = new Date();

    this.clients = {
      connected: 0,
      disconnected: 0,  // persistent sessions
      maximum: 0,
      total: 0,
      expired: 0  // expired persistent sessions
    };

    this.messages = {
      received: 0,
      sent: 0,
      publishReceived: 0,
      publishSent: 0,
      publishDropped: 0,  // dropped messages
      inflight: 0,  // QoS > 0 messages awaiting acknowledgment
      stored: 0  // messages in storage
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

    // Update system metrics periodically
    this._updateSystemMetrics();
    this._metricsInterval = setInterval(() => this._updateSystemMetrics(), 60000); // Update every minute
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

  onConnecting(socket) {
    logger.debug('[MQTT-Broker-Interop-Plugin:MQTT]: Client connecting');
  }

  onConnect(clientId, persistent) {
    logger.debug(`[MQTT-Broker-Interop-Plugin:MQTT]: Client connected - clientId: ${clientId}, persistent: ${persistent}`);
    this.clients.connected++;
    this.clients.total = this.clients.connected + this.clients.disconnected;

    if (this.clients.connected > this.clients.maximum) {
      this.clients.maximum = this.clients.connected;
      logger.info(`[MQTT-Broker-Interop-Plugin:MQTT]: New maximum clients reached: ${this.clients.maximum}`);
    }
  }

  onDisconnect(clientId, persistent) {
    logger.debug(`[MQTT-Broker-Interop-Plugin:MQTT]: Client disconnected - clientId: ${clientId}, persistent: ${persistent}`);
    this.clients.connected--;

    if (persistent) {
      this.clients.disconnected++;
    }

    this.clients.total = this.clients.connected + this.clients.disconnected;
  }

  onPublishReceived(message, byteCount) {
    logger.trace(`[MQTT-Broker-Interop-Plugin:MQTT]: Message received - topic: ${message.topic}, bytes: ${byteCount}`);
    this.messages.received++;
    this.messages.publishReceived++;
    this.bytes.received += byteCount;
  }

  onPublishSent(message, byteCount) {
    logger.trace(`[MQTT-Broker-Interop-Plugin:MQTT]: Message sent - topic: ${message.topic}, bytes: ${byteCount}`);
    this.messages.sent++;
    this.messages.publishSent++;
    this.bytes.sent += byteCount;
  }

  onSubscribe(clientId, topic) {
    logger.debug(`[MQTT-Broker-Interop-Plugin:MQTT]: Client subscribed - clientId: ${clientId}, topic: ${topic}`);
    this.subscriptions.count++;
  }

  onUnsubscribe(clientId, topic) {
    logger.debug(`[MQTT-Broker-Interop-Plugin:MQTT]: Client unsubscribed - clientId: ${clientId}, topic: ${topic}`);
    this.subscriptions.count--;
  }

  onRetainedMessageAdded() {
    logger.debug('[MQTT-Broker-Interop-Plugin:MQTT]: Retained message added');
    this.retained.count++;
  }

  onRetainedMessageRemoved() {
    logger.debug('[MQTT-Broker-Interop-Plugin:MQTT]: Retained message removed');
    this.retained.count--;
  }

  onMessageDropped() {
    logger.warn('[MQTT-Broker-Interop-Plugin:MQTT]: Message dropped');
    this.messages.publishDropped++;
  }

  onMessageInflight(delta) {
    logger.trace(`[MQTT-Broker-Interop-Plugin:MQTT]: Message inflight delta: ${delta}, total: ${this.messages.inflight + delta}`);
    this.messages.inflight += delta;
  }

  onMessageStored(delta) {
    logger.trace(`[MQTT-Broker-Interop-Plugin:MQTT]: Message stored delta: ${delta}, total: ${this.messages.stored + delta}`);
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
    this._loadSamples.connections.push({ time: now, value: this.clients.connected });
    this._loadSamples.messagesReceived.push({ time: now, value: this.messages.received });
    this._loadSamples.messagesSent.push({ time: now, value: this.messages.sent });
    this._loadSamples.bytesReceived.push({ time: now, value: this.bytes.received });
    this._loadSamples.bytesSent.push({ time: now, value: this.bytes.sent });
    this._loadSamples.publishReceived.push({ time: now, value: this.messages.publishReceived });
    this._loadSamples.publishSent.push({ time: now, value: this.messages.publishSent });

    // Clean old samples (keep 15 minutes worth)
    const cutoff = now - 15 * 60 * 1000;
    Object.keys(this._loadSamples).forEach(key => {
      this._loadSamples[key] = this._loadSamples[key].filter(s => s.time > cutoff);
    });

    // Calculate averages
    this._calculateLoadAverages();
  }

  _calculateLoadAverages() {
    const now = Date.now();
    const oneMinAgo = now - 60 * 1000;
    const fiveMinAgo = now - 5 * 60 * 1000;
    const fifteenMinAgo = now - 15 * 60 * 1000;

    Object.keys(this._loadSamples).forEach(metric => {
      const samples = this._loadSamples[metric];

      // Get samples in each time window
      const oneMinSamples = samples.filter(s => s.time > oneMinAgo);
      const fiveMinSamples = samples.filter(s => s.time > fiveMinAgo);
      const fifteenMinSamples = samples.filter(s => s.time > fifteenMinAgo);

      // Calculate averages
      const metricKey = metric.replace('messages', 'messages').replace('bytes', 'bytes');

      if (oneMinSamples.length > 0) {
        const delta = oneMinSamples[oneMinSamples.length - 1].value - oneMinSamples[0].value;
        this.load[metric].oneMin = delta / (oneMinSamples.length > 1 ? 1 : 1);
      }

      if (fiveMinSamples.length > 0) {
        const delta = fiveMinSamples[fiveMinSamples.length - 1].value - fiveMinSamples[0].value;
        this.load[metric].fiveMin = delta / (fiveMinSamples.length > 1 ? 5 : 1);
      }

      if (fifteenMinSamples.length > 0) {
        const delta = fifteenMinSamples[fifteenMinSamples.length - 1].value - fifteenMinSamples[0].value;
        this.load[metric].fifteenMin = delta / (fifteenMinSamples.length > 1 ? 15 : 1);
      }
    });
  }
}

// Singleton instance
export const metrics = new MqttMetrics();

// ============================================================================
// HarperDB Server and MQTT Integration
// ============================================================================
let harperServer = null;
let mqttPublishTable = null;

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
    logger.trace(`[MQTT-Broker-Interop-Plugin:MQTT]: $SYS topic request - ${topic}`);

    // Static topics
    if (topic === '$SYS/broker/version') {
      return this.getVersion();
    }
    if (topic === '$SYS/broker/timestamp') {
      return this.metrics.startTime.toISOString();
    }

    // Client metrics
    if (topic === '$SYS/broker/clients/connected') {
      return this.metrics.clients.connected;
    }
    if (topic === '$SYS/broker/clients/disconnected') {
      return this.metrics.clients.disconnected;
    }
    if (topic === '$SYS/broker/clients/maximum') {
      return this.metrics.clients.maximum;
    }
    if (topic === '$SYS/broker/clients/total') {
      return this.metrics.clients.total;
    }

    // Message metrics
    if (topic === '$SYS/broker/messages/received') {
      return this.metrics.messages.received;
    }
    if (topic === '$SYS/broker/messages/sent') {
      return this.metrics.messages.sent;
    }
    if (topic === '$SYS/broker/publish/messages/received') {
      return this.metrics.messages.publishReceived;
    }
    if (topic === '$SYS/broker/publish/messages/sent') {
      return this.metrics.messages.publishSent;
    }

    // Bandwidth metrics
    if (topic === '$SYS/broker/bytes/received') {
      return this.metrics.bytes.received;
    }
    if (topic === '$SYS/broker/bytes/sent') {
      return this.metrics.bytes.sent;
    }

    // Subscription metrics
    if (topic === '$SYS/broker/subscriptions/count') {
      return this.metrics.subscriptions.count;
    }
    if (topic === '$SYS/broker/retained messages/count') {
      return this.metrics.retained.count;
    }

    // Additional client metrics
    if (topic === '$SYS/broker/clients/expired') {
      return this.metrics.clients.expired;
    }

    // Additional message metrics
    if (topic === '$SYS/broker/messages/inflight') {
      return this.metrics.messages.inflight;
    }
    if (topic === '$SYS/broker/messages/stored') {
      return this.metrics.messages.stored;
    }
    if (topic === '$SYS/broker/publish/messages/dropped') {
      return this.metrics.messages.publishDropped;
    }

    // Store metrics
    if (topic === '$SYS/broker/store/messages/count') {
      return this.metrics.store.messageCount;
    }
    if (topic === '$SYS/broker/store/messages/bytes') {
      return this.metrics.store.messageBytes;
    }

    // System metrics
    if (topic === '$SYS/broker/heap/current') {
      return this.metrics.heap.current;
    }
    if (topic === '$SYS/broker/heap/maximum') {
      return this.metrics.heap.maximum;
    }
    if (topic === '$SYS/broker/uptime') {
      const uptime = Date.now() - this.metrics.startTime.getTime();
      return Math.floor(uptime / 1000); // seconds
    }

    // Load average metrics - Connections
    if (topic === '$SYS/broker/load/connections/1min') {
      return Math.round(this.metrics.load.connections.oneMin);
    }
    if (topic === '$SYS/broker/load/connections/5min') {
      return Math.round(this.metrics.load.connections.fiveMin);
    }
    if (topic === '$SYS/broker/load/connections/15min') {
      return Math.round(this.metrics.load.connections.fifteenMin);
    }

    // Load average metrics - Messages Received
    if (topic === '$SYS/broker/load/messages/received/1min') {
      return Math.round(this.metrics.load.messagesReceived.oneMin);
    }
    if (topic === '$SYS/broker/load/messages/received/5min') {
      return Math.round(this.metrics.load.messagesReceived.fiveMin);
    }
    if (topic === '$SYS/broker/load/messages/received/15min') {
      return Math.round(this.metrics.load.messagesReceived.fifteenMin);
    }

    // Load average metrics - Messages Sent
    if (topic === '$SYS/broker/load/messages/sent/1min') {
      return Math.round(this.metrics.load.messagesSent.oneMin);
    }
    if (topic === '$SYS/broker/load/messages/sent/5min') {
      return Math.round(this.metrics.load.messagesSent.fiveMin);
    }
    if (topic === '$SYS/broker/load/messages/sent/15min') {
      return Math.round(this.metrics.load.messagesSent.fifteenMin);
    }

    // Load average metrics - Bytes Received
    if (topic === '$SYS/broker/load/bytes/received/1min') {
      return Math.round(this.metrics.load.bytesReceived.oneMin);
    }
    if (topic === '$SYS/broker/load/bytes/received/5min') {
      return Math.round(this.metrics.load.bytesReceived.fiveMin);
    }
    if (topic === '$SYS/broker/load/bytes/received/15min') {
      return Math.round(this.metrics.load.bytesReceived.fifteenMin);
    }

    // Load average metrics - Bytes Sent
    if (topic === '$SYS/broker/load/bytes/sent/1min') {
      return Math.round(this.metrics.load.bytesSent.oneMin);
    }
    if (topic === '$SYS/broker/load/bytes/sent/5min') {
      return Math.round(this.metrics.load.bytesSent.fiveMin);
    }
    if (topic === '$SYS/broker/load/bytes/sent/15min') {
      return Math.round(this.metrics.load.bytesSent.fifteenMin);
    }

    // Load average metrics - Publish Received
    if (topic === '$SYS/broker/load/publish/received/1min') {
      return Math.round(this.metrics.load.publishReceived.oneMin);
    }
    if (topic === '$SYS/broker/load/publish/received/5min') {
      return Math.round(this.metrics.load.publishReceived.fiveMin);
    }
    if (topic === '$SYS/broker/load/publish/received/15min') {
      return Math.round(this.metrics.load.publishReceived.fifteenMin);
    }

    // Load average metrics - Publish Sent
    if (topic === '$SYS/broker/load/publish/sent/1min') {
      return Math.round(this.metrics.load.publishSent.oneMin);
    }
    if (topic === '$SYS/broker/load/publish/sent/5min') {
      return Math.round(this.metrics.load.publishSent.fiveMin);
    }
    if (topic === '$SYS/broker/load/publish/sent/15min') {
      return Math.round(this.metrics.load.publishSent.fifteenMin);
    }

    // Unknown topic
    logger.warn(`[MQTT-Broker-Interop-Plugin:MQTT]: Unknown $SYS topic requested - ${topic}`);
    return null;
  }

  /**
   * Get HarperDB version string
   */
  getVersion() {
    logger.trace('[MQTT-Broker-Interop-Plugin:MQTT]: Getting broker version');
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
  const sanitized = firstSegment
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');

  return `mqtt_${sanitized}`;
}

/**
 * Generate unique message ID for table storage
 * @returns {string} - Unique ID (timestamp-random)
 */
export function generateMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ============================================================================
// MQTT Event Monitoring Setup
// ============================================================================

/**
 * Setup MQTT event monitoring on worker threads
 * @param {Object} server - HarperDB server instance
 * @param {Object} logger - Logger instance
 * @param {number} sysInterval - Update interval in seconds
 */
export function setupMqttMonitoring(server, _logger, _sysInterval) {
  logger.info('[MQTT-Broker-Interop-Plugin:MQTT]: Setting up MQTT monitoring');
  if (!server?.mqtt?.events) {
    logger.warn('[MQTT-Broker-Interop-Plugin:MQTT]: MQTT events not available on this thread');
    return;
  }

  harperServer = server;
  const mqttEvents = server.mqtt.events;
  logger.debug('[MQTT-Broker-Interop-Plugin:MQTT]: MQTT events object obtained');

  // Monitor client connections
  mqttEvents.on('connected', (session, _socket) => {
    const clientId = session?.sessionId;
    const username = session?.user?.username;
    // In MQTT, clean flag determines if session is persistent (clean=false means persistent)
    const clean = session?.clean ?? true; // Default to true (non-persistent) if not specified
    logger.info(`[MQTT-Broker-Interop-Plugin:MQTT]: Client connected - clientId: ${clientId}, username: ${username}, clean: ${clean}`);
    metrics.onConnect(clientId, !clean); // !clean = persistent
  });

  // Monitor client disconnections
  mqttEvents.on('disconnected', (session, _socket) => {
    // Handle case where session is undefined (connection failed before auth)
    if (!session || !session.sessionId) {
      logger.debug('[MQTT-Broker-Interop-Plugin:MQTT]: Disconnect event with no session (pre-auth disconnect)');
      return;
    }

    const clientId = session.sessionId;
    // Check if session was persistent - sessionWasPresent indicates persistent session
    const persistent = session.sessionWasPresent || false;
    logger.info(`[MQTT-Broker-Interop-Plugin:MQTT]: Client disconnected - clientId: ${clientId}, persistent: ${persistent}`);
    metrics.onDisconnect(clientId, persistent);
  });

  // Monitor publish events (messages received from clients)
  mqttEvents.on('publish', (packet, session) => {
    const topic = packet?.topic;
    const payload = packet?.payload;
    const clientId = session?.sessionId;
    const byteCount = payload ? Buffer.byteLength(payload) : 0;
    logger.debug(`[MQTT-Broker-Interop-Plugin:MQTT]: Publish received - clientId: ${clientId}, topic: ${topic}, bytes: ${byteCount}`);
    metrics.onPublishReceived({ topic, payload }, byteCount);

    // Track topic in registry (exclude $SYS topics from general registry)
    if (topic && !topic.startsWith('$SYS/')) {
      topicRegistry.add(topic);
      logger.trace(`[MQTT-Broker-Interop-Plugin:MQTT]: Topic added to registry: ${topic}`);
    }
  });

  // Monitor subscription events
  mqttEvents.on('subscribe', (subscriptions, session) => {
    const clientId = session?.sessionId;
    if (Array.isArray(subscriptions)) {
      subscriptions.forEach(sub => {
        const topic = typeof sub === 'string' ? sub : sub?.topic;
        logger.info(`[MQTT-Broker-Interop-Plugin:MQTT]: Subscription - clientId: ${clientId}, topic: ${topic}`);
        metrics.onSubscribe(clientId, topic);

        // Check if it's a $SYS topic subscription
        if (topic && (topic.startsWith('$SYS/') || topic === '$SYS/#')) {
          logger.info(`[MQTT-Broker-Interop-Plugin:MQTT]: $SYS topic subscription detected - clientId: ${clientId}, topic: ${topic}`);
          onSysTopicSubscribe(clientId, topic);
        }
      });
    }
  });

  // Monitor unsubscription events
  mqttEvents.on('unsubscribe', (unsubscriptions, session) => {
    const clientId = session?.sessionId;
    if (Array.isArray(unsubscriptions)) {
      unsubscriptions.forEach(topic => {
        logger.info(`[MQTT-Broker-Interop-Plugin:MQTT]: Unsubscription - clientId: ${clientId}, topic: ${topic}`);
        metrics.onUnsubscribe(clientId, topic);

        // Check if it's a $SYS topic unsubscription
        if (topic && (topic.startsWith('$SYS/') || topic === '$SYS/#')) {
          logger.info(`[MQTT-Broker-Interop-Plugin:MQTT]: $SYS topic unsubscription detected - clientId: ${clientId}, topic: ${topic}`);
          onSysTopicUnsubscribe(clientId, topic);
        }
      });
    }
  });

  // Monitor retained message events if available
  if (mqttEvents.on) {
    mqttEvents.on('retained-added', (packet) => {
      const topic = packet?.topic;
      logger.debug(`[MQTT-Broker-Interop-Plugin:MQTT]: Retained message added - topic: ${topic}`);
      metrics.onRetainedMessageAdded();
    });

    mqttEvents.on('retained-removed', (topic) => {
      logger.debug(`[MQTT-Broker-Interop-Plugin:MQTT]: Retained message removed - topic: ${topic}`);
      metrics.onRetainedMessageRemoved();
    });
  }

  logger.info('[MQTT-Broker-Interop-Plugin:MQTT]: MQTT event monitoring setup complete');
}

// ============================================================================
// $SYS Topics Publisher Setup
// ============================================================================

let publishInterval = null;
let sysSubscriberCount = 0;
let sysIntervalConfig = 10; // Default to 10 seconds

/**
 * Setup the $SYS topics publisher
 * @param {Object} server - HarperDB server instance
 * @param {Object} _logger - Logger instance (unused, using global)
 * @param {number} sysInterval - Update interval in seconds
 * @param {Object} sysTable - HarperDB table for publishing $SYS topics
 */
export function setupSysTopicsPublisher(server, _logger, sysInterval, sysTable = null) {
  logger.info('[MQTT-Broker-Interop-Plugin:MQTT]: Setting up $SYS topics publisher');
  harperServer = server;
  sysIntervalConfig = sysInterval || 10;
  mqttPublishTable = sysTable; // Store the table for publishing
  logger.debug(`[MQTT-Broker-Interop-Plugin:MQTT]: $SYS interval configured: ${sysIntervalConfig}s`);

  if (mqttPublishTable) {
    logger.info('[MQTT-Broker-Interop-Plugin:MQTT]: $SYS topics will publish to table');
  } else {
    logger.warn('[MQTT-Broker-Interop-Plugin:MQTT]: No table provided, will attempt direct MQTT publishing');
    // Initialize the publish table if needed
    initializePublishTable(server);
  }

  logger.info(`[MQTT-Broker-Interop-Plugin:MQTT]: $SYS topics publisher configured with ${sysIntervalConfig}s interval`);
}

/**
 * Initialize the table used for publishing MQTT messages
 */
async function initializePublishTable(server) {
  try {
    logger.debug('[MQTT-Broker-Interop-Plugin:MQTT]: Initializing MQTT publish table');
    // In HarperDB, we can publish to topics through the MQTT system directly
    // or use a table-based approach. For $SYS topics, we'll use direct publishing
    mqttPublishTable = server?.mqtt?.publish || null;

    if (!mqttPublishTable) {
      logger.warn('[MQTT-Broker-Interop-Plugin:MQTT]: MQTT publish interface not available');
    } else {
      logger.debug('[MQTT-Broker-Interop-Plugin:MQTT]: MQTT publish interface initialized');
    }
  } catch (error) {
    logger.error('[MQTT-Broker-Interop-Plugin:MQTT]: Failed to initialize publish table:', error);
  }
}

function startSysPublisher(intervalSeconds) {
  if (publishInterval) {
    logger.debug('[MQTT-Broker-Interop-Plugin:MQTT]: $SYS publisher already running, skipping start');
    return; // Already running
  }

  logger.info(`[MQTT-Broker-Interop-Plugin:MQTT]: Starting $SYS topics publisher with ${intervalSeconds}s interval`);

  // Publish initial values immediately
  publishAllSysTopics();

  // Then set up periodic publishing
  publishInterval = setInterval(() => {
    publishAllSysTopics();
  }, intervalSeconds * 1000);

  logger.debug(`[MQTT-Broker-Interop-Plugin:MQTT]: $SYS publisher interval timer established`);
}

function stopSysPublisher() {
  if (publishInterval) {
    logger.info('[MQTT-Broker-Interop-Plugin:MQTT]: Stopping $SYS topics publisher');
    clearInterval(publishInterval);
    publishInterval = null;
    logger.debug('[MQTT-Broker-Interop-Plugin:MQTT]: $SYS publisher stopped');
  } else {
    logger.debug('[MQTT-Broker-Interop-Plugin:MQTT]: $SYS publisher not running, nothing to stop');
  }
}

async function publishAllSysTopics() {
  logger.trace('[MQTT-Broker-Interop-Plugin:MQTT]: Publishing all $SYS topics');
  const dynamicTopics = [
    // Client metrics
    '$SYS/broker/clients/connected',
    '$SYS/broker/clients/disconnected',
    '$SYS/broker/clients/maximum',
    '$SYS/broker/clients/total',
    '$SYS/broker/clients/expired',

    // Message metrics
    '$SYS/broker/messages/received',
    '$SYS/broker/messages/sent',
    '$SYS/broker/messages/inflight',
    '$SYS/broker/messages/stored',

    // Publish metrics
    '$SYS/broker/publish/messages/received',
    '$SYS/broker/publish/messages/sent',
    '$SYS/broker/publish/messages/dropped',

    // Byte metrics
    '$SYS/broker/bytes/received',
    '$SYS/broker/bytes/sent',

    // Store metrics
    '$SYS/broker/store/messages/count',
    '$SYS/broker/store/messages/bytes',

    // Subscription and retained metrics
    '$SYS/broker/subscriptions/count',
    '$SYS/broker/retained messages/count',

    // System metrics
    '$SYS/broker/heap/current',
    '$SYS/broker/heap/maximum',
    '$SYS/broker/uptime',

    // Load averages - all metrics
    '$SYS/broker/load/connections/1min',
    '$SYS/broker/load/connections/5min',
    '$SYS/broker/load/connections/15min',
    '$SYS/broker/load/messages/received/1min',
    '$SYS/broker/load/messages/received/5min',
    '$SYS/broker/load/messages/received/15min',
    '$SYS/broker/load/messages/sent/1min',
    '$SYS/broker/load/messages/sent/5min',
    '$SYS/broker/load/messages/sent/15min',
    '$SYS/broker/load/bytes/received/1min',
    '$SYS/broker/load/bytes/received/5min',
    '$SYS/broker/load/bytes/received/15min',
    '$SYS/broker/load/bytes/sent/1min',
    '$SYS/broker/load/bytes/sent/5min',
    '$SYS/broker/load/bytes/sent/15min',
    '$SYS/broker/load/publish/received/1min',
    '$SYS/broker/load/publish/received/5min',
    '$SYS/broker/load/publish/received/15min',
    '$SYS/broker/load/publish/sent/1min',
    '$SYS/broker/load/publish/sent/5min',
    '$SYS/broker/load/publish/sent/15min'
  ];

  const sys = new SysTopics();
  let publishCount = 0;

  // Publish all topics in parallel
  await Promise.all(dynamicTopics.map(async (topic) => {
    const value = sys.get({ path: topic });
    await publishToMqtt(topic, String(value));
    publishCount++;
  }));

  logger.trace(`[MQTT-Broker-Interop-Plugin:MQTT]: Published ${publishCount} $SYS topics`);
}

/**
 * Publish a message to an MQTT topic
 * @param {string} topic - MQTT topic
 * @param {string} message - Message to publish
 */
async function publishToMqtt(topic, message) {
  try {
    if (mqttPublishTable && mqttPublishTable.publish) {
      // Use HarperDB table's publish method - this is the proper Harper way
      await mqttPublishTable.publish(topic, {
        topic: topic,
        value: message,
        timestamp: Date.now()
      });
      logger.trace(`[MQTT-Broker-Interop-Plugin:MQTT]: Published via table to ${topic}: ${message}`);
    } else if (harperServer?.mqtt?.publish) {
      // Fallback: Use HarperDB's MQTT publish API
      harperServer.mqtt.publish({
        topic: topic,
        payload: message,
        qos: 0,
        retain: false
      });
      logger.trace(`[MQTT-Broker-Interop-Plugin:MQTT]: Published directly to ${topic}: ${message}`);
    } else {
      logger.warn(`[MQTT-Broker-Interop-Plugin:MQTT]: Cannot publish to ${topic} - no publish interface available`);
    }
  } catch (error) {
    logger.error(`[MQTT-Broker-Interop-Plugin:MQTT]: Failed to publish to ${topic}:`, error);
  }
}

function onSysTopicSubscribe(clientId, topic) {
  sysSubscriberCount++;
  logger.info(`[MQTT-Broker-Interop-Plugin:MQTT]: $SYS topic subscriber added - clientId: ${clientId}, topic: ${topic}, total subscribers: ${sysSubscriberCount}`);

  if (sysSubscriberCount === 1) {
    // First subscriber - start publishing
    logger.info('[MQTT-Broker-Interop-Plugin:MQTT]: First $SYS subscriber, starting publisher');
    startSysPublisher(sysIntervalConfig);
  }

  // Send static topics immediately on subscription
  const sys = new SysTopics();

  // Send version if subscribed to it specifically or via wildcard
  if (topic === '$SYS/broker/version' || topic.includes('#')) {
    logger.debug(`[MQTT-Broker-Interop-Plugin:MQTT]: Sending broker version to ${clientId}`);
    publishToMqtt('$SYS/broker/version', sys.getVersion());
  }

  // Send timestamp if subscribed to it specifically or via wildcard
  if (topic === '$SYS/broker/timestamp' || topic.includes('#')) {
    logger.debug(`[MQTT-Broker-Interop-Plugin:MQTT]: Sending broker timestamp to ${clientId}`);
    publishToMqtt('$SYS/broker/timestamp', sys.get({ path: '$SYS/broker/timestamp' }));
  }
}

function onSysTopicUnsubscribe(clientId, topic) {
  sysSubscriberCount--;
  logger.info(`[MQTT-Broker-Interop-Plugin:MQTT]: $SYS topic subscriber removed - clientId: ${clientId}, topic: ${topic}, total subscribers: ${sysSubscriberCount}`);

  if (sysSubscriberCount <= 0) {
    sysSubscriberCount = 0;
    logger.info('[MQTT-Broker-Interop-Plugin:MQTT]: No more $SYS subscribers, stopping publisher');
    stopSysPublisher();
  }
}

// ============================================================================
// ⚠️ IMPORTANT: The functions above are called from INTEGRATION POINT 2 ⚠️
// When a client subscribes/unsubscribes to a $SYS topic, call:
// - onSysTopicSubscribe(clientId, topic)
// - onSysTopicUnsubscribe(clientId, topic)
// ============================================================================

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