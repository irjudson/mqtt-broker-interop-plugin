// my plugin entry point
import { globals } from './globals.js';

import { loadConfig } from './config-loader.js';


export async function handleApplication(scope) {
	const logger = scope.logger;
	const options = scope.options.getAll();

	// Load and normalize configuration (converts legacy single-table to multi-table format)
	const fullConfig = loadConfig(options);

	// Do plugin initialization.
}
