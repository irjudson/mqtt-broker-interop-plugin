# Test Helpers

## setup-logger.js

This helper sets up a global `server.logger` mock for testing modules that depend on `server.logger`.

### Usage

Import this helper **before** any other modules that use `server.logger`:

```javascript
// IMPORTANT: Setup logger FIRST before importing any modules that use it
import './helpers/setup-logger.js';

import { describe, it } from 'node:test';
import { MqttMetrics } from '../src/mqtt.js';

describe('MyTest', () => {
  it('works with logging', () => {
    // server.logger is now available globally
    const metrics = new MqttMetrics();
    // ...
  });
});
```

### API

- **`setupGlobalLogger(silent = true)`** - Sets up `global.server.logger` with console logger
  - `silent`: If `true`, suppresses all log output (default for tests)

- **`createConsoleLogger(silent = false)`** - Creates a console logger instance
  - Returns logger with methods: `trace`, `debug`, `info`, `warn`, `error`, `fatal`

- **`cleanupGlobalLogger()`** - Removes the global `server.logger`

### Log Levels

The mock logger supports all standard log levels:
- `trace` - Very detailed debugging
- `debug` - Debugging information
- `info` - Informational messages
- `warn` - Warnings
- `error` - Errors
- `fatal` - Fatal errors

### Silent Mode

By default, the logger runs in silent mode for tests. To see log output during tests:

```javascript
import { setupGlobalLogger } from './helpers/setup-logger.js';

// Enable logging output
setupGlobalLogger(false);
```

### Auto-Setup

This module automatically calls `setupGlobalLogger(true)` when imported, so you don't need to call it explicitly in most cases.
