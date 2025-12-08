/**
 * Test for table naming logic
 */

import './helpers/setup-logger.js';

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getTableNameForTopic } from '../src/mqtt.js';

describe('getTableNameForTopic', () => {
  describe('hierarchical topics', () => {
    it('extracts first segment for simple hierarchy', () => {
      assert.equal(getTableNameForTopic('home/temperature'), 'mqtt_home');
      assert.equal(getTableNameForTopic('sensors/humidity'), 'mqtt_sensors');
    });

    it('extracts first segment for deep hierarchy', () => {
      assert.equal(
        getTableNameForTopic('home/living/temperature'),
        'mqtt_home'
      );
      assert.equal(getTableNameForTopic('a/b/c/d/e'), 'mqtt_a');
    });

    it('sanitizes invalid characters', () => {
      assert.equal(getTableNameForTopic('my-topic/value'), 'mqtt_my_topic');
      assert.equal(getTableNameForTopic('topic.name/value'), 'mqtt_topic_name');
      assert.equal(getTableNameForTopic('123topic/value'), 'mqtt_123topic');
    });

    it('converts to lowercase', () => {
      assert.equal(getTableNameForTopic('HOME/temperature'), 'mqtt_home');
      assert.equal(getTableNameForTopic('MyTopic/value'), 'mqtt_mytopic');
    });
  });

  describe('non-hierarchical topics', () => {
    it('returns default table for topics without slash', () => {
      assert.equal(getTableNameForTopic('temperature'), 'mqtt_messages');
      assert.equal(getTableNameForTopic('status'), 'mqtt_messages');
    });

    it('sanitizes and uses default table', () => {
      assert.equal(getTableNameForTopic('my-topic'), 'mqtt_messages');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      assert.equal(getTableNameForTopic(''), 'mqtt_messages');
    });

    it('handles leading slash', () => {
      assert.equal(getTableNameForTopic('/home/temperature'), 'mqtt_messages');
    });

    it('handles trailing slash', () => {
      assert.equal(getTableNameForTopic('home/'), 'mqtt_home');
    });
  });
});
