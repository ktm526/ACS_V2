// services/robotJackService.js
const net = require('net');

let serial = 0;
function buildPacket(code, obj = null) {
    const body = obj ? Buffer.from(JSON.stringify(obj), 'utf8') : Buffer.alloc(0);
    const head = Buffer.alloc(16);
    head.writeUInt8(0x5A, 0);
    head.writeUInt8(0x01, 1);
    head.writeUInt16BE(++serial & 0xffff, 2);
    head.writeUInt32BE(body.length, 4);
    head.writeUInt16BE(code, 8);
    // bytes 10-15 are zeros
    return Buffer.concat([head, body]);
}

/**
 * Send a jack command to robot
 * @param {string} ip
 * @param {number} apiReqCode 16-bit request code (e.g. 0x17B9)
 * @param {object|null} payload JSON body or null
 * @returns {Promise<object>} parsed response JSON
 */
function sendJackCommand(ip, apiReqCode, payload = null) {
    const PORT = 19205;
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(PORT, ip, () => {
            const pkt = buildPacket(apiReqCode, payload);
            socket.write(pkt);
        });

        let buf = Buffer.alloc(0);
        socket.on('data', chunk => {
            buf = Buffer.concat([buf, chunk]);
        });

        socket.once('close', () => {
            if (buf.length <= 16) return reject(new Error('Empty response from robot'));
            try {
                const json = JSON.parse(buf.slice(16).toString());
                resolve(json);
            } catch (err) {
                reject(new Error('Invalid JSON response'));
            }
        });

        socket.on('error', err => reject(err));
        socket.setTimeout(5000, () => {
            socket.destroy();
            reject(new Error('TCP timeout'));
        });
    });
}

module.exports = { sendJackCommand };
