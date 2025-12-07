// MQTT Broker Interoperability Plugin
// Provides standard MQTT $SYS topics for HarperDB

import { loadConfig } from './config-loader.js';

export async function handleApplication(scope) {
  const {logger} = scope;
  const options = scope.options.getAll();
  const {server} = scope;

  logger.info('[MQTT-Broker-Interop-Plugin:Index]: Starting plugin initialization');
  logger.debug(`[MQTT-Broker-Interop-Plugin:Index]: Scope keys: ${JSON.stringify(Object.keys(scope))}`);
  logger.debug(`[MQTT-Broker-Interop-Plugin:Index]: Scope options: ${JSON.stringify(Object.keys(options))}`);

  // Load and normalize configuration
  const fullConfig = loadConfig(options);

  // Extract MQTT configuration
  const sysInterval = fullConfig?.mqtt?.sys_interval || 10;
  logger.info(`[MQTT-Broker-Interop-Plugin:Index]: Configuration loaded - sys_interval: ${sysInterval}s`);

  logger.info('[MQTT-Broker-Interop-Plugin:Index]: Initializing MQTT Broker Interop Plugin');

  // Access $SYS metrics table from global tables object
  try {
    const { mqtt_sys_metrics } = globalThis.tables || {};

    if (mqtt_sys_metrics) {
      const { setSysMetricsTable } = await import('./mqtt.js');
      setSysMetricsTable(mqtt_sys_metrics);
      logger.info('[MQTT-Broker-Interop-Plugin:Index]: $SYS metrics table initialized');
    } else {
      logger.info('[MQTT-Broker-Interop-Plugin:Index]: $SYS metrics table not found (metrics will be in-memory only)');
    }
  } catch (error) {
    logger.error('[MQTT-Broker-Interop-Plugin:Index]: Error accessing tables:', error);
  }

  // Note: $SYS topics resource is automatically loaded from jsResource config in config.yaml
  // Do NOT register it manually here to avoid "Conflicting paths" error
  logger.info('[MQTT-Broker-Interop-Plugin:Index]: Resources will be loaded from jsResource config (src/resources.js)');

  // Register a catch-all MQTT topic handler if possible
  if (server?.mqtt) {
    logger.info('[MQTT-Broker-Interop-Plugin:Index]: Attempting to register catch-all MQTT topic handler');
    try {
      // Try to register a wildcard handler for all topics
      if (server.mqtt.addTopicHandler) {
        server.mqtt.addTopicHandler('#', async (topic, message) => {
          logger.debug(`[MQTT-Broker-Interop-Plugin:Index]: Wildcard handler - topic: ${topic}`);
          return { topic, status: 'accepted' };
        });
        logger.info('[MQTT-Broker-Interop-Plugin:Index]: Registered wildcard topic handler');
      } else if (server.mqtt.registerTopic) {
        server.mqtt.registerTopic('#');
        logger.info('[MQTT-Broker-Interop-Plugin:Index]: Registered wildcard topic');
      } else {
        logger.warn('[MQTT-Broker-Interop-Plugin:Index]: No API found to register wildcard topics');
      }
    } catch (error) {
      logger.error('[MQTT-Broker-Interop-Plugin:Index]: Failed to register wildcard handler:', error);
    }
  }

  // Setup MQTT event monitoring (on worker threads)
  if (server?.mqtt?.events) {
    logger.info('[MQTT-Broker-Interop-Plugin:Index]: MQTT events available, setting up event monitoring on worker thread');
    const { setupMqttMonitoring } = await import('./mqtt.js');
    setupMqttMonitoring(server, logger, sysInterval);
  } else {
    logger.debug('[MQTT-Broker-Interop-Plugin:Index]: MQTT events not available on this thread');
  }

  logger.info('[MQTT-Broker-Interop-Plugin:Index]: MQTT Broker Interop Plugin initialized successfully');
}
