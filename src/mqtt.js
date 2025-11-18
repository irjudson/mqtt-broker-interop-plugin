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
// 🔧 INTEGRATION POINT 1: Import Harper's MQTT Broker
// ============================================================================
// TODO: Add import for Harper's MQTT broker instance
// Example (syntax depends on Harper's API):
// import { broker } from 'harper'; // or similar
// OR if broker is globally available:
// const broker = globalThis.broker; // or similar
//
// HUMAN ACTION REQUIRED: Research Harper's documentation to find:
// - How to access the MQTT broker instance from a resource file
// - What the broker object is called
// - Whether it needs to be imported or is globally available
// ============================================================================

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
    // ⚠️ TODO: Replace with actual HarperDB version ⚠️
    // WHAT TO RESEARCH:
    // - How to get Harper's version at runtime
    // - Possible locations: process.env, global object, import from Harper core
    return 'HarperDB 4.7.0';
  }
}

// ============================================================================
// 🔧 INTEGRATION POINT 2: Event Hook Registration (PHASE 3)
// ============================================================================
// HUMAN ACTION REQUIRED: Wire up event listeners to Harper's MQTT broker
//
// The metrics object has all the handler methods ready (metrics.onConnect, etc.)
// You just need to call them when Harper's MQTT events fire.
//
// Example implementation (adjust to match Harper's actual API):
//
// broker.on('client.connected', (clientId, cleanSession) => {
//   metrics.onConnect(clientId, !cleanSession);
// });
//
// broker.on('client.disconnected', (clientId, cleanSession) => {
//   metrics.onDisconnect(clientId, !cleanSession);
// });
//
// broker.on('message.received', (message) => {
//   const byteCount = message.payload.length; // or however Harper provides size
//   metrics.onPublishReceived(message, byteCount);
// });
//
// broker.on('message.sent', (message) => {
//   const byteCount = message.payload.length;
//   metrics.onPublishSent(message, byteCount);
// });
//
// broker.on('client.subscribed', (clientId, topic) => {
//   metrics.onSubscribe(clientId, topic);
//   if (topic.startsWith('$SYS/')) {
//     onSysTopicSubscribe(clientId, topic); // defined in INTEGRATION POINT 3
//   }
// });
//
// broker.on('client.unsubscribed', (clientId, topic) => {
//   metrics.onUnsubscribe(clientId, topic);
//   if (topic.startsWith('$SYS/')) {
//     onSysTopicUnsubscribe(clientId, topic); // defined in INTEGRATION POINT 3
//   }
// });
//
// WHAT TO RESEARCH:
// 1. Harper's event names (might be different from 'client.connected', etc.)
// 2. Event handler signatures (what parameters are passed to callbacks)
// 3. How to get message byte size from Harper's message objects
// 4. Whether Harper tracks retained messages (for onRetainedMessageAdded/Removed)
//
// ⚠️ INSERT EVENT REGISTRATION CODE HERE ⚠️
// ============================================================================

// ============================================================================
// 🔧 INTEGRATION POINT 3: Update Publisher (PHASE 4)
// ============================================================================
// HUMAN ACTION REQUIRED: Implement periodic publishing of $SYS topic updates
//
// This code is ready to use - just uncomment and adjust the TODOs below.
// ============================================================================

let publishInterval = null;
let sysSubscriberCount = 0;

function startSysPublisher(intervalSeconds) {
  if (publishInterval) return; // Already running

  publishInterval = setInterval(() => {
    publishAllSysTopics();
  }, intervalSeconds * 1000);
}

function stopSysPublisher() {
  if (publishInterval) {
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

    // ⚠️ TODO: Replace with Harper's actual publish API ⚠️
    // broker.publish(topic, String(value), { qos: 0 });
    //
    // WHAT TO RESEARCH:
    // - How to publish a message to a topic from JavaScript
    // - Whether the value needs to be a string or can be a number
    // - What the publish method signature is
  });
}

function onSysTopicSubscribe(clientId, topic) {
  sysSubscriberCount++;

  if (sysSubscriberCount === 1) {
    // First subscriber - start publishing

    // ⚠️ TODO: Get sys_interval from config ⚠️
    const interval = 10; // Default to 10 seconds
    // Replace with: const interval = config.mqtt?.sys_interval || 10;
    //
    // WHAT TO RESEARCH:
    // - How to access config.yaml values at runtime in Harper
    // - Whether there's a global config object

    startSysPublisher(interval);
  }

  // Send static topics immediately on subscription
  const sys = new SysTopics();

  // Send version if subscribed to it specifically or via wildcard
  if (topic === '$SYS/broker/version' || topic.includes('#')) {
    // ⚠️ TODO: Replace with Harper's publish API ⚠️
    // broker.publish('$SYS/broker/version', sys.getVersion(), { qos: 0 });
  }

  // Send timestamp if subscribed to it specifically or via wildcard
  if (topic === '$SYS/broker/timestamp' || topic.includes('#')) {
    // ⚠️ TODO: Replace with Harper's publish API ⚠️
    // broker.publish('$SYS/broker/timestamp', sys.get({ path: '$SYS/broker/timestamp' }), { qos: 0 });
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