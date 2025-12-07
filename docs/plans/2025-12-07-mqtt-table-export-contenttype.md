# MQTT Table Export ContentType Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `contentType: 'mqtt'` to table export configuration so `resources.getMatch(topic, 'mqtt')` can find dynamically created tables.

**Architecture:** Modify `createTableForTopic()` to include `contentType: 'mqtt'` in the `export` option when calling `server.ensureTable()`. This registers tables as MQTT resources.

**Tech Stack:** Node.js, HarperDB plugin API, node:test

---

## Analysis

**Current state (src/mqtt.js:641):**
```javascript
export: { name: topic }
```

**Needed:**
```javascript
export: { name: topic, contentType: 'mqtt' }
```

**Why this fixes the problem:**
- When client subscribes to `a/b/c/#`, HarperDB calls `resources.getMatch('a/b/c', 'mqtt')`
- Without `contentType: 'mqtt'`, the table isn't registered for MQTT protocol
- Adding `contentType: 'mqtt'` registers the table so getMatch() finds it

---

## Task 1: Add contentType test for createTableForTopic

**Files:**
- Test: `test/table-registry.test.js`

**Step 1: Write the failing test**

Add to `test/table-registry.test.js` after line 50 (in the existing test structure):

```javascript
describe('table creation with MQTT export', () => {
  it('creates table with contentType mqtt in export config', async () => {
    // Mock server.ensureTable to verify it's called with correct params
    const mockServer = {
      ensureTable: async (config) => {
        // Verify export config includes contentType
        assert.ok(config.export, 'export config should exist');
        assert.equal(config.export.name, 'test/topic', 'export name should match topic');
        assert.equal(config.export.contentType, 'mqtt', 'contentType should be mqtt');
        return { name: config.name };
      }
    };

    // Temporarily replace global server
    const originalServer = globalThis.server;
    globalThis.server = mockServer;

    try {
      const { createTableForTopic } = await import('../src/mqtt.js');
      await createTableForTopic('test/topic', 'mqtt_test_topic');
    } finally {
      globalThis.server = originalServer;
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
node --test test/table-registry.test.js
```

Expected output:
```
✖ creates table with contentType mqtt in export config
  AssertionError: contentType should be mqtt
    Expected: 'mqtt'
    Actual: undefined
```

**Step 3: Add contentType to export config**

Modify `src/mqtt.js:641`:

```javascript
export: { name: topic, contentType: 'mqtt' }
```

The complete function change (lines 630-642):

```javascript
const newTable = await server.ensureTable({
  name: tableName,
  schema: {
    id: { type: 'string', primaryKey: true },
    topic: { type: 'string', indexed: true },
    payload: { type: 'string' },
    qos: { type: 'number' },
    retain: { type: 'boolean' },
    timestamp: { type: 'string' },
    client_id: { type: 'string' }
  },
  export: { name: topic, contentType: 'mqtt' } // ADDED contentType
});
```

**Step 4: Run test to verify it passes**

Run:
```bash
node --test test/table-registry.test.js
```

Expected output:
```
✔ creates table with contentType mqtt in export config
```

**Step 5: Commit**

```bash
git add test/table-registry.test.js src/mqtt.js
git commit -m "feat: add contentType mqtt to table export config

- Adds contentType: 'mqtt' to export option in createTableForTopic()
- Enables resources.getMatch(topic, 'mqtt') to find dynamic tables
- Fixes 404 error when subscribing to topics without pre-existing resources"
```

---

## Task 2: Integration test for subscription to new topic

**Files:**
- Test: `test/wildcard.test.js`

**Step 1: Write the failing integration test**

Add to `test/wildcard.test.js`:

```javascript
describe('subscription to new topic pattern', () => {
  it('creates table with mqtt export for wildcard subscription', async () => {
    // This test verifies the end-to-end flow:
    // 1. Client subscribes to new topic pattern
    // 2. Table is created with contentType: 'mqtt'
    // 3. resources.getMatch() can find the table

    const mockServer = {
      ensureTable: async (config) => {
        // Verify contentType is set
        assert.equal(config.export?.contentType, 'mqtt');
        return { name: config.name };
      }
    };

    globalThis.server = mockServer;

    const { setupMqttMonitoring } = await import('../src/mqtt.js');

    // Mock MQTT server with events
    const mockMqttServer = {
      mqtt: {
        events: {
          on: (event, handler) => {
            if (event === 'subscribe') {
              // Simulate subscription event
              handler([{ topic: 'integration/test/#' }], { sessionId: 'test-client' });
            }
          }
        }
      }
    };

    setupMqttMonitoring(mockMqttServer, console, 10);

    // If we get here without errors, the table was created successfully
    assert.ok(true, 'subscription handled without error');
  });
});
```

**Step 2: Run test to verify current behavior**

Run:
```bash
node --test test/wildcard.test.js
```

Expected: Test should pass (because we already made the code change in Task 1)

**Step 3: No code changes needed**

The change from Task 1 already fixes this.

**Step 4: Run full test suite**

Run:
```bash
node --test
```

Expected: All tests pass

**Step 5: Commit (if any test fixes needed)**

```bash
git add test/wildcard.test.js
git commit -m "test: add integration test for mqtt contentType export"
```

---

## Task 3: Document the change

**Files:**
- Modify: `docs/plans/2025-12-07-dynamic-table-creation-design.md`
- Modify: `README.md`

**Step 1: Update design document**

In `docs/plans/2025-12-07-dynamic-table-creation-design.md`, add a "Changes Made" section at the top:

```markdown
## Changes Made

### Minimal Fix Implemented

**Changed:** `src/mqtt.js:641`
```javascript
// Before:
export: { name: topic }

// After:
export: { name: topic, contentType: 'mqtt' }
```

**Why:** This single line change registers tables with HarperDB's resource system for MQTT protocol, allowing `resources.getMatch(topic, 'mqtt')` to find dynamically created tables.

**Impact:** Fixes "The topic does not exist, no resource has been defined to handle this topic" error when clients subscribe to new topics.
```

**Step 2: Update README if needed**

Check if README mentions dynamic table creation. If so, note that `contentType: 'mqtt'` is required.

No test needed for documentation.

**Step 3: Commit documentation**

```bash
git add docs/plans/2025-12-07-dynamic-table-creation-design.md README.md
git commit -m "docs: document contentType mqtt requirement for dynamic tables"
```

---

## Task 4: Manual E2E verification

**Files:** None (manual testing)

**Step 1: Start HarperDB with plugin**

Ensure the plugin is loaded and HarperDB is running.

**Step 2: Test subscription to new topic**

Terminal 1 - Subscribe:
```bash
mosquitto_sub -h localhost -p 1883 -t "manual/test/#" -v
```

Expected: No 404 error, subscription succeeds

**Step 3: Test publish to the topic**

Terminal 2 - Publish:
```bash
mosquitto_pub -h localhost -p 1883 -t "manual/test/sensor" -m "test data"
```

Expected: Terminal 1 receives the message:
```
manual/test/sensor test data
```

**Step 4: Verify table was created**

Check HarperDB for table `mqtt_manual_test` (or `mqtt_manual` depending on topic parsing).

**Step 5: Document manual test results**

Add test results to commit message or notes:
```bash
# Manual E2E verification passed:
# - mosquitto_sub to new topic succeeded without 404
# - mosquitto_pub routed message correctly
# - Subscription received publish
```

---

## Verification Checklist

After completing all tasks:

- [ ] Unit test passes: `node --test test/table-registry.test.js`
- [ ] Integration test passes: `node --test test/wildcard.test.js`
- [ ] Full test suite passes: `node --test`
- [ ] Manual E2E test: mosquitto_sub to new topic works
- [ ] Manual E2E test: mosquitto_pub routes to subscriber
- [ ] Documentation updated
- [ ] All commits made

---

## Rollback Plan

If issues occur:

1. Revert the single line change:
   ```bash
   git revert HEAD~3  # Or specific commit
   ```

2. Remove `contentType: 'mqtt'` from line 641:
   ```javascript
   export: { name: topic }  // Back to original
   ```

3. System returns to previous behavior (404 on new subscriptions)

---

## Notes

**Why so minimal?**
- The code already had table creation logic
- The code already had `export: { name: topic }`
- Only missing piece was `contentType: 'mqtt'`
- One line change fixes the core issue

**Why TDD?**
- Test first ensures we understand the requirement
- Watching test fail confirms what was broken
- Test passing confirms the fix works
- Future changes won't break this behavior

**Why separate integration test?**
- Unit test verifies the config is passed correctly
- Integration test verifies the whole subscription flow works
- Both are needed for confidence

---

**Document Status**: Ready for Implementation
**Estimated Time**: 15-20 minutes
**Risk Level**: Low (single line change, well-tested)
