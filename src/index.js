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

  // Create $SYS metrics table using operations API
  try {
    logger.info('[MQTT-Broker-Interop-Plugin:Index]: Creating mqtt_sys_metrics table via operations API');

    // Use operations API to create table
    const response = await server.request({
      operation: 'create_table',
      database: 'mqtt_topics',
      table: 'mqtt_sys_metrics',
      primary_key: 'id'
    });

    logger.info('[MQTT-Broker-Interop-Plugin:Index]: $SYS metrics table created successfully');
    logger.debug(`[MQTT-Broker-Interop-Plugin:Index]: Create table response: ${JSON.stringify(response)}`);

    // Get table reference and pass to mqtt module
    const { setSysMetricsTable } = await import('./mqtt.js');
    const sysMetricsTable = server.tables?.mqtt_topics?.mqtt_sys_metrics;
    if (sysMetricsTable) {
      setSysMetricsTable(sysMetricsTable);
    } else {
      logger.warn('[MQTT-Broker-Interop-Plugin:Index]: Could not get table reference after creation');
    }
  } catch (error) {
    // Table might already exist, try to get reference anyway
    logger.info(`[MQTT-Broker-Interop-Plugin:Index]: Table creation result: ${error.message}`);
    try {
      const { setSysMetricsTable } = await import('./mqtt.js');
      const sysMetricsTable = server.tables?.mqtt_topics?.mqtt_sys_metrics;
      if (sysMetricsTable) {
        setSysMetricsTable(sysMetricsTable);
        logger.info('[MQTT-Broker-Interop-Plugin:Index]: Using existing mqtt_sys_metrics table');
      }
    } catch (e) {
      logger.error('[MQTT-Broker-Interop-Plugin:Index]: Failed to get $SYS metrics table:', e);
    }
  }

  // Note: $SYS topics resource is automatically loaded from jsResource config in config.yaml
  // Do NOT register it manually here to avoid "Conflicting paths" error
  logger.info('[MQTT-Broker-Interop-Plugin:Index]: Resources will be loaded from jsResource config (src/resources.js)');

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
