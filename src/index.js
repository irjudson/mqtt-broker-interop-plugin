// MQTT Broker Interoperability Plugin
// Provides standard MQTT $SYS topics for HarperDB

import { loadConfig } from './config-loader.js';
import { setupMqttMonitoring, setupSysTopicsPublisher } from './mqtt.js';

export async function handleApplication(scope) {
	const logger = scope.logger;
	const options = scope.options.getAll();
	const server = scope.server;

	// Load and normalize configuration
	const fullConfig = loadConfig(options);

	// Extract MQTT configuration
	const sysInterval = fullConfig?.mqtt?.sys_interval || 10;

	logger.info('Initializing MQTT Broker Interop Plugin');

	// Setup MQTT event monitoring (on worker threads)
	if (server?.mqtt?.events) {
		logger.info('Setting up MQTT event monitoring on worker thread');
		setupMqttMonitoring(server, logger, sysInterval);
	} else {
		logger.debug('MQTT events not available on this thread');
	}

	// Setup $SYS topics publisher (on main thread)
	if (typeof setupSysTopicsPublisher === 'function') {
		logger.info('Setting up $SYS topics publisher');
		setupSysTopicsPublisher(server, logger, sysInterval);
	}

	logger.info('MQTT Broker Interop Plugin initialized successfully');
}
