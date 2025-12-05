// MQTT $SYS Topics Resource
// Handles GET requests for $SYS/* topics and wildcard subscriptions

import { SysTopics, metrics, topicRegistry } from './mqtt.js';

// Access global server and logger
const {server} = globalThis;
const logger = server?.logger || console;

// Create singleton instance of SysTopics
const sysTopics = new SysTopics();

// Define all available $SYS topics based on Mosquitto standard
const ALL_SYS_TOPICS = [
  // Static topics
  '$SYS/broker/version',
  '$SYS/broker/timestamp',

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

  // Storage metrics
  '$SYS/broker/store/messages/count',
  '$SYS/broker/store/messages/bytes',

  // Subscriptions & retained
  '$SYS/broker/subscriptions/count',
  '$SYS/broker/retained messages/count',

  // System metrics
  '$SYS/broker/heap/current',
  '$SYS/broker/heap/maximum',
  '$SYS/broker/uptime',

  // Load averages (1min, 5min, 15min)
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

/**
 * Resource class for handling $SYS topic requests and wildcard subscriptions
 * Maps MQTT $SYS topic paths to current metric values
 */
export class SysTopicsResource {
  /**
   * GET handler for $SYS topics and wildcard patterns
   * @param {Object} request - Request object with path property
   * @returns {Object|Array|null} - Topic value(s) or null if unknown
   */
  get(request) {
    const topic = request.path || request.url;
    logger.trace(`[MQTT-Broker-Interop-Plugin:Resources]: SysTopicsResource GET request - topic: ${topic}`);

    // Handle wildcard /#  - all non-$SYS topics
    if (topic === '/#' || topic === '#') {
      const allTopics = Array.from(topicRegistry);
      logger.debug(`[MQTT-Broker-Interop-Plugin:Resources]: Returning all non-$SYS topics - count: ${allTopics.length}`);

      return {
        pattern: '/#',
        count: allTopics.length,
        topics: allTopics.map(t => ({
          topic: t,
          timestamp: new Date().toISOString()
        }))
      };
    }

    // Handle wildcard $SYS/# - all $SYS topics
    if (topic === '$SYS/#' || topic === '$SYS/*') {
      const result = {
        pattern: '$SYS/#',
        count: ALL_SYS_TOPICS.length,
        topics: ALL_SYS_TOPICS.map(t => ({
          topic: t,
          value: sysTopics.get({ path: t }),
          timestamp: new Date().toISOString()
        })).filter(item => item.value !== null)
      };
      logger.debug(`[MQTT-Broker-Interop-Plugin:Resources]: Returning all $SYS topics - count: ${result.topics.length}`);
      return result;
    }

    // Handle partial $SYS wildcards like $SYS/broker/clients/#
    if (topic && topic.startsWith('$SYS/') && topic.includes('#')) {
      const prefix = topic.replace('/#', '/').replace('#', '');
      const matchingTopics = ALL_SYS_TOPICS.filter(t => t.startsWith(prefix));
      logger.debug(`[MQTT-Broker-Interop-Plugin:Resources]: Partial $SYS wildcard - prefix: ${prefix}, matches: ${matchingTopics.length}`);

      return {
        pattern: topic,
        count: matchingTopics.length,
        topics: matchingTopics.map(t => ({
          topic: t,
          value: sysTopics.get({ path: t }),
          timestamp: new Date().toISOString()
        })).filter(item => item.value !== null)
      };
    }

    // Handle individual $SYS topic
    if (topic && topic.startsWith('$SYS/')) {
      const value = sysTopics.get({ path: topic });

      if (value !== null && value !== undefined) {
        logger.trace(`[MQTT-Broker-Interop-Plugin:Resources]: Individual $SYS topic - topic: ${topic}, value: ${value}`);
        return {
          topic: topic,
          value: value,
          timestamp: new Date().toISOString()
        };
      }
    }

    // Unknown topic
    logger.debug(`[MQTT-Broker-Interop-Plugin:Resources]: Unknown topic request - ${topic}`);
    return null;
  }

  /**
   * Alias for get() to support search operations
   * @param {Object} request - Request object
   * @returns {Object|Array|null} - Topic value(s) or null
   */
  search(request) {
    return this.get(request);
  }

  /**
   * Subscribe to MQTT topic updates
   * Returns an async iterator for real-time updates
   * @param {Object} request - Request object with path property
   * @returns {AsyncIterator} - Async iterator for topic updates
   */
  async *subscribe(request) {
    const topic = request.path || request.url;
    logger.info(`[MQTT-Broker-Interop-Plugin:Resources]: SysTopicsResource subscribe - topic: ${topic}`);

    // Yield initial value
    const initialValue = this.get(request);
    if (initialValue !== null) {
      yield initialValue;
    }

    // Keep subscription alive - yield updates periodically
    // The subscription will stay open until the client unsubscribes
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second interval
      const currentValue = this.get(request);
      if (currentValue !== null) {
        yield currentValue;
      }
    }
  }
}

// Export the resource for the $SYS path
export const SYS = SysTopicsResource;

/**
 * Resource class for handling wildcard /# subscriptions
 * Returns all non-$SYS topics
 */
export class WildcardTopicsResource {
  /**
   * GET handler for /# wildcard pattern
   * @param {Object} request - Request object with path property
   * @returns {Object} - All non-$SYS topics
   */
  get(request) {
    const topic = request.path || request.url;
    logger.trace(`[MQTT-Broker-Interop-Plugin:Resources]: WildcardTopicsResource GET request - topic: ${topic}`);

    // Handle /# wildcard - return all non-$SYS topics
    if (topic === '/#' || topic === '#' || topic === '/') {
      // Filter out any $SYS topics that might be in the registry
      const allTopics = Array.from(topicRegistry).filter(t => !t.startsWith('$SYS/'));
      logger.debug(`[MQTT-Broker-Interop-Plugin:Resources]: WildcardTopicsResource returning topics - count: ${allTopics.length}`);

      return {
        pattern: '/#',
        count: allTopics.length,
        topics: allTopics.map(t => ({
          topic: t,
          timestamp: new Date().toISOString()
        }))
      };
    }

    logger.trace(`[MQTT-Broker-Interop-Plugin:Resources]: WildcardTopicsResource no match - topic: ${topic}`);
    return null;
  }

  /**
   * Subscribe to MQTT topic updates
   * Returns an async iterator for real-time updates
   * @param {Object} request - Request object with path property
   * @returns {AsyncIterator} - Async iterator for topic updates
   */
  async *subscribe(request) {
    const topic = request.path || request.url;
    logger.info(`[MQTT-Broker-Interop-Plugin:Resources]: WildcardTopicsResource subscribe - topic: ${topic}`);

    // Yield initial value
    const initialValue = this.get(request);
    if (initialValue !== null) {
      yield initialValue;
    }

    // Keep subscription alive - yield updates periodically
    // The subscription will stay open until the client unsubscribes
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second interval
      const currentValue = this.get(request);
      if (currentValue !== null) {
        yield currentValue;
      }
    }
  }
}

// Export the wildcard resource
export const Wildcard = WildcardTopicsResource;

/**
 * Dynamic Topics Resource - handles non-$SYS MQTT topics
 * NOTE: This is intentionally NOT exported as $wildcard to allow HarperDB's
 * native wildcard handling to work properly.
 *
 * Tables are created dynamically when messages are PUBLISHED, not when subscribed.
 * Wildcard subscriptions (/#, /+) use HarperDB's built-in topic matching.
 */
export class DynamicTopicsResource {
  /**
   * GET handler for any non-$SYS topic
   * @param {Object} request - Request object with path property
   * @returns {Object|Array} - Messages from the topic's table
   */
  async get(request) {
    const topic = request.path || request.url;
    logger.debug(`[MQTT-Broker-Interop-Plugin:Resources]: DynamicTopicsResource GET request - topic: ${topic}`);

    // Don't handle wildcard requests - let HarperDB handle those natively
    if (topic.includes('#') || topic.includes('+')) {
      logger.debug(`[MQTT-Broker-Interop-Plugin:Resources]: Wildcard topic, deferring to HarperDB: ${topic}`);
      return null;
    }

    // Import helper functions
    const { getTableNameForTopic } = await import('./mqtt.js');

    // Get the table name for this topic
    const tableName = getTableNameForTopic(topic);

    // Check if table exists (don't create on GET)
    const table = globalThis.tables?.[tableName];
    if (!table) {
      logger.debug(`[MQTT-Broker-Interop-Plugin:Resources]: Table '${tableName}' not found for topic: ${topic}`);
      return { topic, messages: [] };
    }

    // Return recent messages from the table
    try {
      const messages = [];
      for await (const message of table.search()) {
        messages.push(message);
      }

      logger.debug(`[MQTT-Broker-Interop-Plugin:Resources]: Returning ${messages.length} messages for topic: ${topic}`);
      return { topic, messages };
    } catch (error) {
      logger.error(`[MQTT-Broker-Interop-Plugin:Resources]: Error reading messages:`, error);
      return { topic, messages: [] };
    }
  }

  /**
   * Subscribe to any MQTT topic
   * For wildcard subscriptions, defer to HarperDB's native handling
   * @param {Object} request - Request object with path property
   * @returns {AsyncIterator} - Async iterator for topic updates
   */
  async *subscribe(request) {
    const topic = request.path || request.url;
    logger.info(`[MQTT-Broker-Interop-Plugin:Resources]: DynamicTopicsResource subscribe - topic: ${topic}`);

    // For wildcard subscriptions, defer to HarperDB's built-in wildcard handling
    if (topic.includes('#') || topic.includes('+')) {
      logger.info(`[MQTT-Broker-Interop-Plugin:Resources]: Wildcard subscription, deferring to HarperDB: ${topic}`);
      // Don't yield anything - let HarperDB handle it
      return;
    }

    // For concrete topics, check if table exists (will be created on first publish)
    const { getTableNameForTopic } = await import('./mqtt.js');
    const tableName = getTableNameForTopic(topic);
    const table = globalThis.tables?.[tableName];

    if (!table) {
      logger.info(`[MQTT-Broker-Interop-Plugin:Resources]: Table not yet created for ${topic}, will be created on first publish`);
    }

    logger.info(`[MQTT-Broker-Interop-Plugin:Resources]: Subscription active for topic: ${topic}`);

    // Yield initial acknowledgment
    yield {
      topic: topic,
      timestamp: new Date().toISOString(),
      status: 'subscribed'
    };

    // Keep subscription alive with periodic updates
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 30000));
      yield {
        topic: topic,
        timestamp: new Date().toISOString(),
        status: 'alive'
      };
    }
  }
}

// DO NOT export as $wildcard - this would interfere with HarperDB's native wildcard handling
// Tables are created dynamically when messages are published via the MQTT event handlers

// Export a helper to get current metrics directly
export function getMetrics() {
  logger.trace('[MQTT-Broker-Interop-Plugin:Resources]: getMetrics called');
  const metricsSnapshot = {
    startTime: metrics.startTime,
    clients: { ...metrics.clients },
    messages: { ...metrics.messages },
    bytes: { ...metrics.bytes },
    subscriptions: { ...metrics.subscriptions },
    retained: { ...metrics.retained },
    store: { ...metrics.store },
    heap: { ...metrics.heap },
    load: JSON.parse(JSON.stringify(metrics.load))
  };
  logger.debug(`[MQTT-Broker-Interop-Plugin:Resources]: Returning metrics snapshot - clients: ${metricsSnapshot.clients.connected}, messages: ${metricsSnapshot.messages.received}`);
  return metricsSnapshot;
}
