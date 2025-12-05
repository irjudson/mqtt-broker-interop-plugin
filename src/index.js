// MQTT Broker Interoperability Plugin
// Provides standard MQTT $SYS topics for HarperDB

import { loadConfig } from './config-loader.js';
// import { setupMqttMonitoring, setupSysTopicsPublisher } from './mqtt.js';


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

  // Create $SYS metrics table
  try {
    logger.info('[MQTT-Broker-Interop-Plugin:Index]: Creating mqtt_sys_metrics table');
    const sysMetricsTable = server.ensureTable({
      database: 'mqtt_topics',
      table: 'mqtt_sys_metrics',
      primaryKey: 'id'
    });
    logger.info('[MQTT-Broker-Interop-Plugin:Index]: $SYS metrics table created successfully');

    // Pass table reference to mqtt module
    const { setSysMetricsTable } = await import('./mqtt.js');
    setSysMetricsTable(sysMetricsTable);
  } catch (error) {
    logger.error('[MQTT-Broker-Interop-Plugin:Index]: Failed to create $SYS metrics table:', error);
  }

  // Register $SYS topics resource
  if (scope.resources) {
    logger.info('[MQTT-Broker-Interop-Plugin:Index]: Registering $SYS topics resource');
    const { SysTopicsResource } = await import('./resources.js');
    scope.resources.set('$SYS', SysTopicsResource);
    logger.info('[MQTT-Broker-Interop-Plugin:Index]: Registered $SYS topic resource');
  } else {
    logger.warn('[MQTT-Broker-Interop-Plugin:Index]: No resources Map available for $SYS registration');
  }

  // Note: Resources are also automatically loaded from jsResource config
  logger.info('[MQTT-Broker-Interop-Plugin:Index]: Resources configured (loaded from jsResource config)');

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

// Export resource classes for MQTT topic handling
// export { SysTopicsResource, WildcardTopicsResource } from './resources.js';
