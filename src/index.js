// MQTT Broker Interoperability Plugin
// Provides standard MQTT $SYS topics for HarperDB

import { loadConfig } from './config-loader.js';

export async function handleApplication(scope) {
  const {logger} = scope;
  const options = scope.options.getAll();
  const {server} = scope;

  // Store server in globalThis so it's accessible from resources.js and mqtt.js
  if (!globalThis.server) {
    globalThis.server = server;
  }

  logger.info('[MQTT-Broker-Interop-Plugin:Index]: Starting plugin initialization');

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
      const { setSysMetricsTable, upsertSysMetric } = await import('./mqtt.js');
      setSysMetricsTable(mqtt_sys_metrics);
      logger.info('[MQTT-Broker-Interop-Plugin:Index]: $SYS metrics table initialized');

      // Write static topics at startup
      upsertSysMetric('$SYS/broker/version', process.env.HARPERDB_VERSION || 'HarperDB 4.x');
      upsertSysMetric('$SYS/broker/timestamp', new Date().toISOString());
      logger.info('[MQTT-Broker-Interop-Plugin:Index]: Static $SYS topics (version, timestamp) written to table');
    } else {
      logger.info('[MQTT-Broker-Interop-Plugin:Index]: $SYS metrics table not found (metrics will be in-memory only)');
    }
  } catch (error) {
    logger.error('[MQTT-Broker-Interop-Plugin:Index]: Error accessing tables:', error);
  }

  // Note: $SYS topics resource is automatically loaded from jsResource config in config.yaml
  // Do NOT register it manually here to avoid "Conflicting paths" error
  logger.info('[MQTT-Broker-Interop-Plugin:Index]: Resources will be loaded from jsResource config (src/resources.js)');

  // Note: MQTT publish interception is not currently implemented
  // HarperDB's @export directive handles subscriptions (table → MQTT)
  // but does not provide hooks for intercepting publishes (MQTT → table)
  // Future implementation would require finding appropriate HarperDB APIs

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
