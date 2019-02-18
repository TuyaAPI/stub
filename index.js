const net = require('net');
const dgram = require('dgram');
const MessageParser = require('tuyapi/lib/message-parser');
const Cipher = require('tuyapi/lib/cipher');
const debug = require('debug')('TuyaStub');

/**
 * A stub implementation of the
 * Tuya protocol for local testing.
 * @class
 * @param {Object} options
 * @param {String} options.id ID of mock device
 * @param {String} options.key key of mock device
 * @param {Object} options.state inital state of device
 * @param {Number} [options.broadcastInterval=5]
 * interval (in seconds) to broadcast UDP packets at
 * @example
 * const stub = new TuyaStub({ id: 'xxxxxxxxxxxxxxxxxxxx',
                               key: 'xxxxxxxxxxxxxxxx',
                               state: {'1': false, '2': true}});
 */
class TuyaStub {
  constructor(options) {
    this.state = options.state ? options.state : {};

    this.id = options.id;
    this.key = options.key;

    if (!options.broadcastInterval) {
      this._broadcastInterval = 5;
    }

    this.cipher = new Cipher({key: this.key, version: 3.1});

    this.startUDPBroadcast();
  }

  /**
   * Starts the mocking server.
   * @param {Number} [port=6668] port to listen on
   */
  startServer(port) {
    port = port ? port : 6668;

    net.createServer(socket => {
      this.socket = socket;

      socket.on('data', data => {
        this._handleRequest(data);
      });
    }).listen(port);
  }

  /**
   * Starts the periodic UDP broadcast.
   * @param {Object} options
   * @param {Number} [options.port=6666] port to broadcast on
   * @param {Number} [options.interval=5] interval, in seconds, to broadcast at
   */
  startUDPBroadcast(options) {
    // Defaults
    options = options ? options : {};
    options.port = options.port ? options.port : 6666;
    options.interval = options.interval ? options.interval : 5;

    // Encode broadcast
    const message = MessageParser.encode({data: {devId: this.id, gwId: this.id, ip: 'localhost'}, commandByte: 10});

    // Create and bind socket
    const socket = dgram.createSocket({type: 'udp4', reuseAddr: true});

    socket.bind(options.port);

    // When socket is ready, start broadcasting
    socket.on('listening', () => {
      socket.setBroadcast(true);

      if (!this.broadcastInterval) {
        this.broadcastInterval = setInterval(() => {
          debug('Sending UDP broadcast...');
          socket.send(message, 0, message.length, options.port, '255.255.255.255');
        }, options.interval * 1000);
      }
    });
  }

  /**
   * Handles incoming requests.
   * @private
   * @param {Buffer} data to handle
   */
  _handleRequest(data) {
    const parsedData = MessageParser.parse(data);

    debug('Parsed request:');
    debug(parsedData);

    if (parsedData.commandByte === 10) { // GET request
      // Check device ID
      if (parsedData.data.devId !== this.id) {
        throw new Error('devId of request does not match');
      }

      const response = {
        data: {
          devId: this.id,
          gwId: this.id,
          dps: this.state
        },

        commandByte: 10
      };

      // Write response
      this.socket.write(MessageParser.encode(response));
    } else if (parsedData.commandByte === 7) { // SET request
      // Decrypt data
      const decryptedData = this.cipher.decrypt(parsedData.data);

      debug('Decrypted data:');
      debug(decryptedData);

      // Check device ID
      if (decryptedData.devId !== this.id) {
        throw new Error('devId of request does not match');
      }

      // Check timestamp
      const now = Math.floor(Date.now() / 1000); // Seconds since epoch

      // Timestamp difference must be no more than 10 seconds
      if (Math.abs(now - decryptedData.t) > 10) {
        throw new Error('Bad timestamp.');
      }

      // Set properties
      Object.keys(decryptedData.dps).forEach(property => {
        this.setProperty(property, decryptedData.dps[property]);
      });

      // Write response
      const response = {
        data: {
          devId: this.id,
          gwId: this.id,
          dps: this.state
        },

        commandByte: 10
      };

      this.socket.write(MessageParser.encode(response));
    } else if (parsedData.commandByte === 9) { // Heartbeat packet
      // Send response pong
      debug('Sending pong...');
      const buffer = MessageParser.encode({
        data: Buffer.allocUnsafe(0),
        commandByte: 9 // 0x09
      });

      this.socket.write(buffer);
    }
  }

  /**
   * Sets a property of the mock device.
   * @param {String} property to change
   * @param {any} value to set
   * @returns {any} updated property value
   */
  setProperty(property, value) {
    this.state[property] = value;
    return this.state[property];
  }

  /**
   * Gets a property of the mock device.
   * @param {String} property to get
   * @returns {any} property value
   */
  getProperty(property) {
    return this.state[property];
  }

  /**
   * Gets entire state of the mock device.
   * @returns {Object} device's state
   */
  getState() {
    return this.state;
  }

  /**
   * Sets entire state of the mock device.
   * @param {Object} state new state
   * @returns {Object} updated state
   */
  setState(state) {
    this.state = state;
    return this.state;
  }
}

module.exports = TuyaStub;
