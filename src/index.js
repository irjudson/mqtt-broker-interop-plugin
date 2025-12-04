// MQTT Broker Interoperability Plugin
// Provides standard MQTT $SYS topics for HarperDB

import { loadConfig } from './config-loader.js';
// import { setupMqttMonitoring, setupSysTopicsPublisher } from './mqtt.js';


export async function handleApplication(scope) {
	const logger = scope.logger;
	const options = scope.options.getAll();
	const server = scope.server;
	const ensureTable = scope.ensureTable;

	logger.info('[MQTT-Broker-Interop-Plugin:Index]: Starting plugin initialization');
	logger.debug(`[MQTT-Broker-Interop-Plugin:Index]: Scope keys: ${JSON.stringify(Object.keys(scope))}`);
	logger.debug(`[MQTT-Broker-Interop-Plugin:Index]: Scope options: ${JSON.stringify(Object.keys(options))}`);

	// Load and normalize configuration
	const fullConfig = loadConfig(options);

	// Extract MQTT configuration
	const sysInterval = fullConfig?.mqtt?.sys_interval || 10;
	logger.info(`[MQTT-Broker-Interop-Plugin:Index]: Configuration loaded - sys_interval: ${sysInterval}s`);

	logger.info('[MQTT-Broker-Interop-Plugin:Index]: Initializing MQTT Broker Interop Plugin');

	// Create $SYS topics table for publish/subscribe
	// let sysTopicsTable = null;
	// if (ensureTable) {
	// 	logger.info('[MQTT-Broker-Interop-Plugin:Index]: Creating $SYS topics table');
	// 	sysTopicsTable = ensureTable({
	// 		table: 'mqtt_sys_topics',
	// 		database: 'mqtt_monitor',
	// 		attributes: []
	// 	});
	// 	logger.info('[MQTT-Broker-Interop-Plugin:Index]: $SYS topics table created');

		// Register the table as the $SYS resource
		// Note: We register the table's constructor (class), not the instance
		// The Resources.set() method expects a class that it will instantiate as needed
	// 	if (scope.resources) {
	// 		// Get the class from the table instance
	// 		const TableClass = Object.getPrototypeOf(sysTopicsTable).constructor;
	// 		scope.resources.set('$SYS', TableClass);
	// 		logger.info('[MQTT-Broker-Interop-Plugin:Index]: Registered $SYS topic resource');
	// 	}
	// } else {
	// 	logger.warn('[MQTT-Broker-Interop-Plugin:Index]: ensureTable not available, cannot create $SYS topics table');
	// }

	// Register wildcard # handler for all non-$SYS topics
	// if (scope.resources) {
	// 	logger.info('[MQTT-Broker-Interop-Plugin:Index]: Registering # wildcard resource');
	// 	const { WildcardTopicsResource } = await import('./resources.js');
	// 	scope.resources.set('#', WildcardTopicsResource);
	// 	logger.info('[MQTT-Broker-Interop-Plugin:Index]: Registered # wildcard resource');
	// } else {
	// 	logger.warn('[MQTT-Broker-Interop-Plugin:Index]: No resources Map available for # wildcard registration');
	// }

	// Setup MQTT event monitoring (on worker threads)
	// if (server?.mqtt?.events) {
	// 	logger.info('[MQTT-Broker-Interop-Plugin:Index]: MQTT events available, setting up event monitoring on worker thread');
	// 	setupMqttMonitoring(server, logger, sysInterval);
	// } else {
	// 	logger.debug('[MQTT-Broker-Interop-Plugin:Index]: MQTT events not available on this thread');
	// }

	// Setup $SYS topics publisher (on main thread) - pass the table
	// if (typeof setupSysTopicsPublisher === 'function' && sysTopicsTable) {
	// 	logger.info('[MQTT-Broker-Interop-Plugin:Index]: Setting up $SYS topics publisher with table');
	// 	setupSysTopicsPublisher(server, logger, sysInterval, sysTopicsTable);
	// } else if (typeof setupSysTopicsPublisher === 'function') {
	// 	logger.info('[MQTT-Broker-Interop-Plugin:Index]: Setting up $SYS topics publisher without table');
	// 	setupSysTopicsPublisher(server, logger, sysInterval);
	// } else {
	// 	logger.warn('[MQTT-Broker-Interop-Plugin:Index]: setupSysTopicsPublisher function not available');
	// }

	logger.info('[MQTT-Broker-Interop-Plugin:Index]: MQTT Broker Interop Plugin initialized successfully');
}

// Export resource classes for MQTT topic handling
// export { SysTopicsResource, WildcardTopicsResource } from './resources.js';
