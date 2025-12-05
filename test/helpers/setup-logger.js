/**
 * Test Helper: Setup Global Server Logger
 * Creates a mock server.logger for testing
 */

/**
 * Creates a console logger with all log levels
 * @param {boolean} silent - If true, suppress all output (default: false)
 * @returns {Object} Logger object with all methods
 */
export function createConsoleLogger(silent = false) {
  const noop = () => {};

  const log = (level, ...args) => {
    if (silent) {return;}
    console.log(`[${level.toUpperCase()}]`, ...args);
  };

  return {
    trace: silent ? noop : (...args) => log('trace', ...args),
    debug: silent ? noop : (...args) => log('debug', ...args),
    info: silent ? noop : (...args) => log('info', ...args),
    warn: silent ? noop : (...args) => log('warn', ...args),
    error: silent ? noop : (...args) => log('error', ...args),
    fatal: silent ? noop : (...args) => log('fatal', ...args)
  };
}

/**
 * Setup global server.logger for tests
 * Call this before importing any modules that use server.logger
 * @param {boolean} silent - If true, suppress all log output (default: true for tests)
 */
export function setupGlobalLogger(silent = true) {
  // Create global server object if it doesn't exist
  if (typeof global.server === 'undefined') {
    global.server = {};
  }

  // Attach logger
  global.server.logger = createConsoleLogger(silent);

  return global.server.logger;
}

/**
 * Cleanup global server.logger after tests
 */
export function cleanupGlobalLogger() {
  if (global.server) {
    delete global.server.logger;
  }
}

// Auto-setup for when this module is imported
// This ensures server.logger exists before any other modules are loaded
setupGlobalLogger(true);
