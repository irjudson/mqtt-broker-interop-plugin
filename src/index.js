// MQTT Broker Interoperability Plugin
// Provides standard MQTT $SYS topics for HarperDB

import { loadConfig } from './config-loader.js';
import { setupMqttMonitoring, setupSysTopicsPublisher } from './mqtt.js';

export async function handleApplication(scope) {
	const logger = scope.logger;
	const options = scope.options.getAll();
	const server = scope.server;

	server.logger.info('[MQTT-Broker-Interop-Plugin:Index]: Starting plugin initialization');
	server.logger.debug(`[MQTT-Broker-Interop-Plugin:Index]: Scope options: ${JSON.stringify(Object.keys(options))}`);

	// Load and normalize configuration
	const fullConfig = loadConfig(options);

	// Extract MQTT configuration
	const sysInterval = fullConfig?.mqtt?.sys_interval || 10;
	server.logger.info(`[MQTT-Broker-Interop-Plugin:Index]: Configuration loaded - sys_interval: ${sysInterval}s`);

	server.logger.info('[MQTT-Broker-Interop-Plugin:Index]: Initializing MQTT Broker Interop Plugin');

	// Setup MQTT event monitoring (on worker threads)
	if (server?.mqtt?.events) {
		server.logger.info('[MQTT-Broker-Interop-Plugin:Index]: MQTT events available, setting up event monitoring on worker thread');
		setupMqttMonitoring(server, logger, sysInterval);
	} else {
		server.logger.debug('[MQTT-Broker-Interop-Plugin:Index]: MQTT events not available on this thread');
	}

	// Setup $SYS topics publisher (on main thread)
	if (typeof setupSysTopicsPublisher === 'function') {
		server.logger.info('[MQTT-Broker-Interop-Plugin:Index]: Setting up $SYS topics publisher');
		setupSysTopicsPublisher(server, logger, sysInterval);
	} else {
		server.logger.warn('[MQTT-Broker-Interop-Plugin:Index]: setupSysTopicsPublisher function not available');
	}

	server.logger.info('[MQTT-Broker-Interop-Plugin:Index]: MQTT Broker Interop Plugin initialized successfully');
}
