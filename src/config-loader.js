/**
 * Configuration Loader
 * Loads and parses the config.yaml file for both the plugin and synthesizer
 */

import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load configuration from config.yaml or accept a config object
 * @param {string|Object|null} configPath - Path to config file or config object or options object
 * @returns {Object} Parsed and normalized configuration object
 * @throws {Error} If config file cannot be read or parsed
 */
export function loadConfig(configPath = null) {
	try {
		server.logger.debug('[MQTT-Broker-Interop-Plugin:ConfigLoader]: Loading configuration');
		let config;
		let source;

		// Handle different input types
		if (configPath === null || configPath === undefined) {
			// Default to config.yaml in project root
			const path = join(__dirname, '..', 'config.yaml');
			server.logger.debug(`[MQTT-Broker-Interop-Plugin:ConfigLoader]: Loading config from default path: ${path}`);
			const fileContent = readFileSync(path, 'utf8');
			config = parse(fileContent);
			source = path;
		} else if (typeof configPath === 'string') {
			// Path to config file
			server.logger.debug(`[MQTT-Broker-Interop-Plugin:ConfigLoader]: Loading config from: ${configPath}`);
			const fileContent = readFileSync(configPath, 'utf8');
			config = parse(fileContent);
			source = configPath;
		} else if (typeof configPath === 'object') {
			// Config object passed directly (for testing)
			server.logger.debug('[MQTT-Broker-Interop-Plugin:ConfigLoader]: Using config object passed directly');
			// Check if it's an options object with 'config' property
			if (configPath.config) {
				config = configPath.config;
			} else {
				config = configPath;
			}
			source = 'object';
		} else {
			server.logger.error('[MQTT-Broker-Interop-Plugin:ConfigLoader]: Invalid configPath type');
			throw new Error('configPath must be a string, object, or null');
		}

		if (!config) {
			server.logger.error('[MQTT-Broker-Interop-Plugin:ConfigLoader]: Failed to parse configuration');
			throw new Error('Failed to parse configuration');
		}

		server.logger.info(`[MQTT-Broker-Interop-Plugin:ConfigLoader]: Successfully loaded config from: ${source}`);

		// Normalize to multi-table format if needed
		// return normalizeConfig(config);
		return(config);
	} catch (error) {
		server.logger.error(`[MQTT-Broker-Interop-Plugin:ConfigLoader]: Configuration loading failed: ${error.message}`);
		throw new Error(`Failed to load configuration: ${error.message}`);
	}
}

export default {
	loadConfig
};
