/**
 * MQTT $SYS Topics Implementation
 * Provides standard MQTT broker statistics via $SYS topics
 */

/**
 * MqttMetrics - Tracks MQTT broker statistics
 * This is the primary extension point for adding new metrics
 */
export class MqttMetrics {
  constructor() {
    this.startTime = new Date();

    this.clients = {
      connected: 0,
      disconnected: 0,  // persistent sessions
      maximum: 0,
      total: 0
    };

    this.messages = {
      received: 0,
      sent: 0,
      publishReceived: 0,
      publishSent: 0
    };

    this.bytes = {
      received: 0,
      sent: 0
    };

    this.subscriptions = {
      count: 0
    };

    this.retained = {
      count: 0
    };

    // Extension point for future metrics (option C):
    // this.load = { oneMin: 0, fiveMin: 0, fifteenMin: 0 };
    // this.system = { uptime: 0, heapCurrent: 0, heapMaximum: 0 };
    // this.perClient = new Map(); // client-id → stats
  }

  onConnect(clientId, persistent) {
    this.clients.connected++;
    this.clients.total = this.clients.connected + this.clients.disconnected;

    if (this.clients.connected > this.clients.maximum) {
      this.clients.maximum = this.clients.connected;
    }
  }

  onDisconnect(clientId, persistent) {
    this.clients.connected--;

    if (persistent) {
      this.clients.disconnected++;
    }

    this.clients.total = this.clients.connected + this.clients.disconnected;
  }

  onPublishReceived(message, byteCount) {
    this.messages.received++;
    this.messages.publishReceived++;
    this.bytes.received += byteCount;
  }

  onPublishSent(message, byteCount) {
    this.messages.sent++;
    this.messages.publishSent++;
    this.bytes.sent += byteCount;
  }

  onSubscribe(clientId, topic) {
    this.subscriptions.count++;
  }

  onUnsubscribe(clientId, topic) {
    this.subscriptions.count--;
  }

  onRetainedMessageAdded() {
    this.retained.count++;
  }

  onRetainedMessageRemoved() {
    this.retained.count--;
  }
}

// Singleton instance
export const metrics = new MqttMetrics();

// ============================================================================
// HarperDB Server and MQTT Integration
// ============================================================================
let harperServer = null;
let harperLogger = null;
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

    // Extension point for future topics:
    // if (topic === '$SYS/broker/uptime') {
    //   const uptime = Date.now() - this.metrics.startTime.getTime();
    //   return Math.floor(uptime / 1000); // seconds
    // }

    // Unknown topic
    return null;
  }

  /**
   * Get HarperDB version string
   */
  getVersion() {
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
// MQTT Event Monitoring Setup
// ============================================================================

/**
 * Setup MQTT event monitoring on worker threads
 * @param {Object} server - HarperDB server instance
 * @param {Object} logger - Logger instance
 * @param {number} sysInterval - Update interval in seconds
 */
export function setupMqttMonitoring(server, logger, sysInterval) {
  if (!server?.mqtt?.events) {
    logger.warn('MQTT events not available on this thread');
    return;
  }

  harperServer = server;
  harperLogger = logger;
  const mqttEvents = server.mqtt.events;

  // Monitor client connections
  mqttEvents.on('connected', (data) => {
    const { clientId, username, cleanSession } = data;
    logger.debug(`MQTT client connected: ${clientId}`);
    metrics.onConnect(clientId, !cleanSession);
  });

  // Monitor client disconnections
  mqttEvents.on('disconnected', (data) => {
    const { clientId, cleanSession } = data;
    logger.debug(`MQTT client disconnected: ${clientId}`);
    metrics.onDisconnect(clientId, !cleanSession);
  });

  // Monitor publish events (messages received from clients)
  mqttEvents.on('publish', (data) => {
    const { topic, payload, clientId } = data;
    const byteCount = payload ? Buffer.byteLength(payload) : 0;
    logger.debug(`MQTT publish received on topic ${topic}: ${byteCount} bytes`);
    metrics.onPublishReceived({ topic, payload }, byteCount);
  });

  // Monitor subscription events
  mqttEvents.on('subscribe', (data) => {
    const { clientId, topics } = data;
    if (Array.isArray(topics)) {
      topics.forEach(topic => {
        logger.debug(`MQTT client ${clientId} subscribed to ${topic}`);
        metrics.onSubscribe(clientId, topic);

        // Check if it's a $SYS topic subscription
        if (topic.startsWith('$SYS/') || topic === '$SYS/#') {
          onSysTopicSubscribe(clientId, topic);
        }
      });
    }
  });

  // Monitor unsubscription events
  mqttEvents.on('unsubscribe', (data) => {
    const { clientId, topics } = data;
    if (Array.isArray(topics)) {
      topics.forEach(topic => {
        logger.debug(`MQTT client ${clientId} unsubscribed from ${topic}`);
        metrics.onUnsubscribe(clientId, topic);

        // Check if it's a $SYS topic unsubscription
        if (topic.startsWith('$SYS/') || topic === '$SYS/#') {
          onSysTopicUnsubscribe(clientId, topic);
        }
      });
    }
  });

  // Monitor retained message events if available
  if (mqttEvents.on) {
    mqttEvents.on('retained-added', (data) => {
      logger.debug(`Retained message added`);
      metrics.onRetainedMessageAdded();
    });

    mqttEvents.on('retained-removed', (data) => {
      logger.debug(`Retained message removed`);
      metrics.onRetainedMessageRemoved();
    });
  }

  logger.info('MQTT event monitoring setup complete');
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
 * @param {Object} logger - Logger instance
 * @param {number} sysInterval - Update interval in seconds
 */
export function setupSysTopicsPublisher(server, logger, sysInterval) {
  harperServer = server;
  harperLogger = logger;
  sysIntervalConfig = sysInterval || 10;

  // Initialize the publish table if needed
  initializePublishTable(server);

  logger.info(`$SYS topics publisher configured with ${sysIntervalConfig}s interval`);
}

/**
 * Initialize the table used for publishing MQTT messages
 */
async function initializePublishTable(server) {
  try {
    // In HarperDB, we can publish to topics through the MQTT system directly
    // or use a table-based approach. For $SYS topics, we'll use direct publishing
    mqttPublishTable = server?.mqtt?.publish || null;

    if (!mqttPublishTable) {
      harperLogger?.warn('MQTT publish interface not available');
    }
  } catch (error) {
    harperLogger?.error('Failed to initialize publish table:', error);
  }
}

function startSysPublisher(intervalSeconds) {
  if (publishInterval) return; // Already running

  harperLogger?.info(`Starting $SYS topics publisher with ${intervalSeconds}s interval`);

  // Publish initial values immediately
  publishAllSysTopics();

  // Then set up periodic publishing
  publishInterval = setInterval(() => {
    publishAllSysTopics();
  }, intervalSeconds * 1000);
}

function stopSysPublisher() {
  if (publishInterval) {
    harperLogger?.info('Stopping $SYS topics publisher');
    clearInterval(publishInterval);
    publishInterval = null;
  }
}

function publishAllSysTopics() {
  const dynamicTopics = [
    '$SYS/broker/clients/connected',
    '$SYS/broker/clients/disconnected',
    '$SYS/broker/clients/maximum',
    '$SYS/broker/clients/total',
    '$SYS/broker/messages/received',
    '$SYS/broker/messages/sent',
    '$SYS/broker/publish/messages/received',
    '$SYS/broker/publish/messages/sent',
    '$SYS/broker/bytes/received',
    '$SYS/broker/bytes/sent',
    '$SYS/broker/subscriptions/count',
    '$SYS/broker/retained messages/count'
  ];

  const sys = new SysTopics();

  dynamicTopics.forEach(topic => {
    const value = sys.get({ path: topic });

    // Publish to MQTT topic
    publishToMqtt(topic, String(value));
  });
}

/**
 * Publish a message to an MQTT topic
 * @param {string} topic - MQTT topic
 * @param {string} message - Message to publish
 */
function publishToMqtt(topic, message) {
  try {
    if (harperServer?.mqtt?.publish) {
      // Use HarperDB's MQTT publish API
      harperServer.mqtt.publish({
        topic: topic,
        payload: message,
        qos: 0,
        retain: false
      });
      harperLogger?.debug(`Published to ${topic}: ${message}`);
    } else if (mqttPublishTable) {
      // Alternative: Use table-based publishing
      mqttPublishTable.create({
        topic: topic,
        payload: message,
        timestamp: new Date().toISOString()
      });
    } else {
      harperLogger?.warn(`Cannot publish to ${topic} - no publish interface available`);
    }
  } catch (error) {
    harperLogger?.error(`Failed to publish to ${topic}:`, error);
  }
}

function onSysTopicSubscribe(clientId, topic) {
  sysSubscriberCount++;

  if (sysSubscriberCount === 1) {
    // First subscriber - start publishing
    startSysPublisher(sysIntervalConfig);
  }

  // Send static topics immediately on subscription
  const sys = new SysTopics();

  // Send version if subscribed to it specifically or via wildcard
  if (topic === '$SYS/broker/version' || topic.includes('#')) {
    publishToMqtt('$SYS/broker/version', sys.getVersion());
  }

  // Send timestamp if subscribed to it specifically or via wildcard
  if (topic === '$SYS/broker/timestamp' || topic.includes('#')) {
    publishToMqtt('$SYS/broker/timestamp', sys.get({ path: '$SYS/broker/timestamp' }));
  }
}

function onSysTopicUnsubscribe(clientId, topic) {
  sysSubscriberCount--;

  if (sysSubscriberCount <= 0) {
    sysSubscriberCount = 0;
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