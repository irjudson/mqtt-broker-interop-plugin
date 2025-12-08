#!/usr/bin/env node
/**
 * MQTT Client Test
 * Tests the $SYS topics implementation by subscribing to HarperDB's MQTT broker
 */

import net from 'net';

const MQTT_HOST = 'localhost';
const MQTT_PORT = 1883;
const CLIENT_ID = 'sys-topic-tester';

class SimpleTestClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.subscriptions = new Set();
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log(`Connecting to ${MQTT_HOST}:${MQTT_PORT}...`);

      this.socket = net.createConnection(MQTT_PORT, MQTT_HOST);

      this.socket.on('connect', () => {
        console.log('TCP connection established');
        this.sendConnect();
      });

      this.socket.on('data', (data) => {
        this.handlePacket(data);

        // Check for CONNACK packet (0x20)
        if (data[0] === 0x20 && !this.connected) {
          // Check the return code (byte 3)
          const returnCode = data[3];
          if (returnCode === 0x00) {
            this.connected = true;
            console.log('✅ Connected to MQTT broker');
            resolve();
          } else {
            const errors = {
              0x01: 'Connection refused: unacceptable protocol version',
              0x02: 'Connection refused: identifier rejected',
              0x03: 'Connection refused: server unavailable',
              0x04: 'Connection refused: bad username or password',
              0x05: 'Connection refused: not authorized'
            };
            console.error(
              `❌ Connection refused: ${errors[returnCode] || `Unknown error (${returnCode})`}`
            );
            reject(new Error(errors[returnCode] || 'Connection refused'));
          }
        }
      });

      this.socket.on('error', (error) => {
        console.error('❌ Connection error:', error.message);
        reject(error);
      });

      this.socket.on('close', () => {
        console.log('Connection closed');
        this.connected = false;
      });

      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  sendConnect() {
    // Build CONNECT packet with proper flags
    const protocolName = Buffer.from('MQTT');
    const protocolLevel = Buffer.from([0x04]); // MQTT 3.1.1

    // Connect flags: Clean session only (no auth)
    const connectFlags = Buffer.from([0x02]); // bit 1: clean session

    const keepAlive = Buffer.from([0x00, 0x3c]); // 60 seconds
    const clientIdLength = Buffer.from([0x00, CLIENT_ID.length]);
    const clientIdBuffer = Buffer.from(CLIENT_ID);

    // Calculate total remaining length
    const remainingLength =
      2 +
      protocolName.length + // Protocol name
      1 + // Protocol level
      1 + // Connect flags
      2 + // Keep alive
      2 +
      CLIENT_ID.length; // Client ID

    const packet = Buffer.concat([
      Buffer.from([0x10]), // CONNECT packet type
      Buffer.from([remainingLength]), // Remaining length
      Buffer.from([0x00, protocolName.length]), // Protocol name length
      protocolName, // 'MQTT'
      protocolLevel, // Version 4
      connectFlags, // Flags
      keepAlive, // Keep alive
      clientIdLength, // Client ID length
      clientIdBuffer // Client ID
    ]);

    console.log(`Sending CONNECT packet (${packet.length} bytes)`);
    this.socket.write(packet);
  }

  subscribe(topic) {
    if (!this.connected) {
      console.error('Cannot subscribe - not connected');
      return;
    }

    console.log(`Subscribing to ${topic}...`);

    const topicBuffer = Buffer.from(topic);
    const packet = Buffer.concat([
      Buffer.from([0x82]), // SUBSCRIBE packet with QoS 1
      Buffer.from([5 + topicBuffer.length]), // Remaining length
      Buffer.from([0x00, 0x01]), // Packet ID
      Buffer.from([0x00, topicBuffer.length]), // Topic length
      topicBuffer,
      Buffer.from([0x00]) // QoS 0
    ]);

    this.socket.write(packet);
    this.subscriptions.add(topic);
  }

  handlePacket(data) {
    const type = (data[0] >> 4) & 0x0f;

    switch (type) {
    case 0x03: // PUBLISH
      this.handlePublish(data);
      break;
    case 0x09: // SUBACK
      console.log('✅ Subscription acknowledged');
      break;
    case 0x0d: // PINGRESP
      console.log('Ping response received');
      break;
    }
  }

  handlePublish(data) {
    let offset = 1;

    // Read remaining length
    let multiplier = 1;
    let remainingLength = 0;
    let byte;
    do {
      byte = data[offset++];
      remainingLength += (byte & 0x7f) * multiplier;
      multiplier *= 128;
    } while ((byte & 0x80) !== 0);

    // Read topic length
    const topicLength = data.readUInt16BE(offset);
    offset += 2;

    // Read topic
    const topic = data.slice(offset, offset + topicLength).toString();
    offset += topicLength;

    // Read payload
    const payloadEnd = 1 + (offset - 1) + remainingLength - topicLength - 2;
    const payload = data.slice(offset, payloadEnd).toString();

    console.log(`📨 Message on ${topic}: ${payload}`);
  }

  ping() {
    if (this.connected) {
      this.socket.write(Buffer.from([0xc0, 0x00]));
    }
  }

  disconnect() {
    if (this.connected) {
      this.socket.write(Buffer.from([0xe0, 0x00]));
      this.socket.end();
      this.connected = false;
      console.log('Disconnected');
    }
  }
}

// Main test function
async function test() {
  const client = new SimpleTestClient();

  try {
    // Connect to broker
    await client.connect();

    // Subscribe to different patterns
    console.log('\n📋 Testing subscriptions:');

    // Subscribe to sys table (HarperDB's table-based approach)
    client.subscribe('sys/#');
    console.log('Subscribed to sys/# (table-based)');

    // Also try traditional $SYS topics
    client.subscribe('$SYS/#');
    console.log('Subscribed to $SYS/# (traditional)');

    // Subscribe to specific topics
    client.subscribe('sys/broker_version');
    client.subscribe('sys/broker_clients_connected');

    // Keep alive
    const pingInterval = setInterval(() => {
      client.ping();
    }, 30000);

    // Listen for messages
    console.log('\n🎧 Listening for messages...');
    console.log(
      '(Messages should appear every 10 seconds if plugin is working)\n'
    );

    // Run for 60 seconds then exit
    setTimeout(() => {
      console.log('\n✅ Test complete');
      clearInterval(pingInterval);
      client.disconnect();
      process.exit(0);
    }, 60000);
  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

// Handle signals
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});

// Run test
console.log('🧪 MQTT $SYS Topics Test Client');
console.log('================================\n');
test();
