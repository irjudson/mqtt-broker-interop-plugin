// MQTT $SYS Topics Resource
// Handles GET requests for $SYS/* topics

import { SysTopics, metrics } from './mqtt.js';

// Create singleton instance of SysTopics
const sysTopics = new SysTopics();

/**
 * Resource class for handling $SYS topic requests
 * Maps MQTT $SYS topic paths to current metric values
 */
export class SysTopicsResource {
  /**
   * GET handler for $SYS topics
   * @param {Object} request - Request object with path property
   * @returns {string|number|null} - Current metric value or null if unknown topic
   */
  get(request) {
    const topic = request.path || request.url;

    // Handle $SYS topics
    if (topic && topic.startsWith('$SYS/')) {
      const value = sysTopics.get({ path: topic });

      if (value !== null && value !== undefined) {
        return {
          topic: topic,
          value: value,
          timestamp: new Date().toISOString()
        };
      }
    }

    // Unknown topic
    return null;
  }

  /**
   * Handle wildcard subscriptions like $SYS/#
   * @param {Object} request - Request object
   * @returns {Array} - Array of all matching topics and values
   */
  search(request) {
    const pattern = request.path || request.url;

    if (pattern === '$SYS/#' || pattern === '$SYS/*') {
      // Return all $SYS topics
      const allTopics = [
        '$SYS/broker/version',
        '$SYS/broker/timestamp',
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

      return allTopics.map(topic => ({
        topic: topic,
        value: sysTopics.get({ path: topic }),
        timestamp: new Date().toISOString()
      }));
    }

    // Handle partial wildcards like $SYS/broker/clients/#
    if (pattern && pattern.includes('#')) {
      const prefix = pattern.replace('/#', '/').replace('#', '');
      const allTopics = [
        '$SYS/broker/version',
        '$SYS/broker/timestamp',
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

      const matchingTopics = allTopics.filter(t => t.startsWith(prefix));

      return matchingTopics.map(topic => ({
        topic: topic,
        value: sysTopics.get({ path: topic }),
        timestamp: new Date().toISOString()
      }));
    }

    return [];
  }
}

// Export the resource for the $SYS path
export const SYS = SysTopicsResource;

// Export a helper to get current metrics directly
export function getMetrics() {
  return {
    startTime: metrics.startTime,
    clients: { ...metrics.clients },
    messages: { ...metrics.messages },
    bytes: { ...metrics.bytes },
    subscriptions: { ...metrics.subscriptions },
    retained: { ...metrics.retained }
  };
}