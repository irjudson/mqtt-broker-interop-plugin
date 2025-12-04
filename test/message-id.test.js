/**
 * Test for message ID generation
 */

import './helpers/setup-logger.js';

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateMessageId } from '../src/mqtt.js';

describe('generateMessageId', () => {
  it('generates unique IDs', () => {
    const id1 = generateMessageId();
    const id2 = generateMessageId();
    const id3 = generateMessageId();

    assert.ok(id1);
    assert.ok(id2);
    assert.ok(id3);
    assert.notEqual(id1, id2);
    assert.notEqual(id2, id3);
  });

  it('generates string IDs', () => {
    const id = generateMessageId();
    assert.equal(typeof id, 'string');
  });

  it('generates IDs with reasonable length', () => {
    const id = generateMessageId();
    assert.ok(id.length > 10); // timestamp + random part
    assert.ok(id.length < 50); // not excessive
  });

  it('includes timestamp component', () => {
    const beforeTimestamp = Date.now();
    const id = generateMessageId();
    const afterTimestamp = Date.now();

    // ID should start with a timestamp close to now
    const idTimestamp = parseInt(id.split('-')[0]);
    assert.ok(idTimestamp >= beforeTimestamp);
    assert.ok(idTimestamp <= afterTimestamp + 1);
  });
});
