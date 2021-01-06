const net = require('net');
const dgram = require('dgram');
const {MessageParser, CommandType} = require('tuyapi/lib/message-parser');
const debug = require('debug')('TuyaStub');

/**
 * A stub implementation of the
 * Tuya protocol for local testing.
 * @class
 * @param {Object} options
 * @param {String} options.id ID of mock device
 * @param {String} options.key key of mock device
 * @param {String} [options.ip=localhost] IP address of mock device
 * @param {Object} options.state inital state of device
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
    this.ip = options.ip ? options.ip : 'localhost';

    this.parser = new MessageParser({key: this.key, version: 3.1});
  }

  /**
   * Starts the mocking server.
   * @param {Number} [port=6668] port to listen on
   */
  startServer(port) {
    port = port ? port : 6668;

    this.server = net.createServer(socket => {
      this.socket = socket;

      socket.on('data', data => {
        this._handleRequest(data);
      });
    }).listen(port);
  }

  /**
   * Call to cleanly exit.
   */
  shutdown() {
    if (this.socket) {
      this.socket.destroy();
    }

    if (this.server) {
      this.server.close();
    }

    if (this.broadcastSocket) {
      this.broadcastSocket.close();
      clearInterval(this.broadcastInterval);
    }
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
    const message = this.parser.encode({data: {devId: this.id, gwId: this.id, ip: this.ip}, commandByte: CommandType.DP_QUERY});

    // Create and bind socket
    this.broadcastSocket = dgram.createSocket({type: 'udp4', reuseAddr: true});

    this.broadcastSocket.bind(options.port);

    // When socket is ready, start broadcasting
    this.broadcastSocket.on('listening', () => {
      this.broadcastSocket.setBroadcast(true);

      if (!this.broadcastInterval) {
        this.broadcastInterval = setInterval(() => {
          debug('Sending UDP broadcast...');
          this.broadcastSocket.send(message, 0, message.length, options.port, '255.255.255.255');
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
    debug('Incoming packet(s):');
    debug(data.toString('hex'));

    const parsedPackets = this.parser.parse(data);

    debug('Parsed request:');
    debug(parsedPackets);

    parsedPackets.forEach(packet => {
      if (packet.commandByte === CommandType.DP_QUERY) { // GET request
        // Check device ID
        if (packet.payload.devId !== this.id) {
          throw new Error('devId of request does not match');
        }

        const response = {
          data: {
            devId: this.id,
            gwId: this.id,
            dps: this.state
          },
          commandByte: 10,
          sequenceN: packet.sequenceN
        };

        // Write response
        this.socket.write(this.parser.encode(response));
      } else if (packet.commandByte === CommandType.CONTROL) { // SET request
        // Decrypt data
        const decryptedData = packet.payload;

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

        // Responses for status updates have two parts
        const confirmChangeResponse = {
          data: {},
          commandByte: 7,
          sequenceN: packet.sequenceN
        };

        this.socket.write(this.parser.encode(confirmChangeResponse));

        const statusUpdateResponse = {
          data: {
            devId: this.id,
            gwId: this.id,
            dps: this.state
          },
          commandByte: 8
        };

        this.socket.write(this.parser.encode(statusUpdateResponse));
      } else if (packet.commandByte === CommandType.HEART_BEAT) { // Heartbeat packet
        // Send response pong
        debug('Sending pong...');
        const buffer = this.parser.encode({
          data: Buffer.allocUnsafe(0),
          commandByte: CommandType.HEART_BEAT,
          sequenceN: packet.sequenceN
        });

        this.socket.write(buffer);
      }
    });
  }

  /**
   * Sets a property of the mock device.
   * @param {String} property to change
   * @param {any} value to set
   * @returns {any} updated property value
   */
  setProperty(property, value) {
    this.state[property] = value;

    if (this.server && this.socket) {
      // Write response
      const response = {
        data: {
          devId: this.id,
          gwId: this.id,
          dps: this.state
        },

        commandByte: CommandType.CONTROL
      };

      this.socket.write(this.parser.encode(response));
    }

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
