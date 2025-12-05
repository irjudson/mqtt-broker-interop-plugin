/**
 * Integration test for MQTT $SYS Topics
 * Run this after deploying the plugin to HarperDB to verify it works
 */

// IMPORTANT: Setup logger FIRST before importing any modules that use it
import './helpers/setup-logger.js';

const mqtt = require('mqtt');

// Configuration
const MQTT_BROKER_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const TEST_DURATION = 30000; // 30 seconds

console.log('MQTT $SYS Topics Integration Test');
console.log('==================================');
console.log(`Connecting to: ${MQTT_BROKER_URL}`);
console.log(`Test duration: ${TEST_DURATION / 1000} seconds`);
console.log('');

// Connect to MQTT broker
const client = mqtt.connect(MQTT_BROKER_URL, {
  clientId: `sys-test-${  Date.now()}`,
  clean: true
});

// Track received topics
const receivedTopics = new Set();
const topicValues = {};

// Expected static topics
const staticTopics = [
  '$SYS/broker/version',
  '$SYS/broker/timestamp'
];

// Expected dynamic topics
const dynamicTopics = [
  '$SYS/broker/clients/connected',
  '$SYS/broker/clients/disconnected',
  '$SYS/broker/clients/maximum',
  '$SYS/broker/clients/total',
  '$SYS/broker/messages/received',
  '$SYS/broker/messages/sent',
  '$SYS/broker/publish/messages/received',
  '$SYS/broker/publish/messages/sent',
  '$SYS/broker/bytes/received',
  '$SYS/broker/bytes/sent',
  '$SYS/broker/subscriptions/count',
  '$SYS/broker/retained messages/count'
];

const allTopics = [...staticTopics, ...dynamicTopics];

client.on('connect', () => {
  console.log('✓ Connected to MQTT broker');
  console.log('');

  // Subscribe to all $SYS topics
  client.subscribe('$SYS/#', (err) => {
    if (err) {
      console.error('✗ Failed to subscribe:', err);
      process.exit(1);
    }
    console.log('✓ Subscribed to $SYS/#');
    console.log('');
    console.log('Waiting for $SYS topic messages...');
    console.log('');
  });

  // Also publish a test message to generate activity
  setTimeout(() => {
    client.publish('test/topic', 'Hello from integration test');
  }, 1000);
});

client.on('message', (topic, message) => {
  const value = message.toString();

  if (!receivedTopics.has(topic)) {
    receivedTopics.add(topic);
    console.log(`✓ Received: ${topic} = ${value}`);
  }

  // Store latest value
  topicValues[topic] = value;
});

client.on('error', (err) => {
  console.error('✗ MQTT error:', err);
  process.exit(1);
});

// Check results after test duration
setTimeout(() => {
  console.log('');
  console.log('Test Results');
  console.log('============');
  console.log(`Topics received: ${receivedTopics.size}/${allTopics.length}`);
  console.log('');

  // Check which topics were received
  console.log('Static Topics:');
  staticTopics.forEach(topic => {
    const received = receivedTopics.has(topic);
    const status = received ? '✓' : '✗';
    const value = topicValues[topic] || 'not received';
    console.log(`  ${status} ${topic}: ${value}`);
  });

  console.log('');
  console.log('Dynamic Topics:');
  dynamicTopics.forEach(topic => {
    const received = receivedTopics.has(topic);
    const status = received ? '✓' : '✗';
    const value = topicValues[topic] || 'not received';
    console.log(`  ${status} ${topic}: ${value}`);
  });

  console.log('');

  // Check for unexpected topics
  const unexpectedTopics = Array.from(receivedTopics).filter(t => !allTopics.includes(t));
  if (unexpectedTopics.length > 0) {
    console.log('Unexpected topics received:');
    unexpectedTopics.forEach(topic => {
      console.log(`  - ${topic}: ${topicValues[topic]}`);
    });
    console.log('');
  }

  // Summary
  const allReceived = allTopics.every(t => receivedTopics.has(t));
  if (allReceived) {
    console.log('✓ SUCCESS: All expected $SYS topics received!');
    process.exit(0);
  } else {
    const missing = allTopics.filter(t => !receivedTopics.has(t));
    console.log(`✗ INCOMPLETE: Missing ${missing.length} topics:`);
    missing.forEach(t => console.log(`  - ${t}`));
    process.exit(1);
  }
}, TEST_DURATION);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  client.end();
  process.exit(0);
});
