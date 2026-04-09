// RouterOS API client — raw TCP implementation, zero dependencies
// Protocol: length-prefixed words over TCP, MD5 challenge-response auth

const net = require('net');
const crypto = require('crypto');

class RouterOSService {
    constructor(host, user, password, port) {
        this.host = host || '10.10.10.1';
        this.user = user || 'mktxp_user';
        this.password = password || '';
        this.port = parseInt(port) || 8728;
        this.socket = null;
        this.connected = false;
        this.buffer = Buffer.alloc(0);
    }

    // ── Encoding/Decoding ──

    encodeLength(len) {
        if (len < 0x80) return Buffer.from([len]);
        if (len < 0x4000) return Buffer.from([((len >> 8) & 0x3F) | 0x80, len & 0xFF]);
        if (len < 0x200000) return Buffer.from([((len >> 16) & 0x1F) | 0xC0, (len >> 8) & 0xFF, len & 0xFF]);
        if (len < 0x10000000) return Buffer.from([((len >> 24) & 0x0F) | 0xE0, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF]);
        return Buffer.from([0xF0, (len >> 24) & 0xFF, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF]);
    }

    decodeLength(buf, offset) {
        var b = buf[offset];
        if ((b & 0x80) === 0) return { len: b, size: 1 };
        if ((b & 0xC0) === 0x80) return { len: ((b & 0x3F) << 8) | buf[offset + 1], size: 2 };
        if ((b & 0xE0) === 0xC0) return { len: ((b & 0x1F) << 16) | (buf[offset + 1] << 8) | buf[offset + 2], size: 3 };
        if ((b & 0xF0) === 0xE0) return { len: ((b & 0x0F) << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3], size: 4 };
        return { len: (buf[offset + 1] << 24) | (buf[offset + 2] << 16) | (buf[offset + 3] << 8) | buf[offset + 4], size: 5 };
    }

    encodeWord(word) {
        var wordBuf = Buffer.from(word, 'utf8');
        return Buffer.concat([this.encodeLength(wordBuf.length), wordBuf]);
    }

    encodeSentence(words) {
        var parts = words.map(this.encodeWord.bind(this));
        parts.push(Buffer.from([0])); // empty word = end of sentence
        return Buffer.concat(parts);
    }

    // ── Socket ──

    connect() {
        var self = this;
        return new Promise(function(resolve, reject) {
            if (self.socket) {
                try { self.socket.destroy(); } catch(e) {}
            }
            self.buffer = Buffer.alloc(0);
            self.connected = false;

            var timeout = setTimeout(function() {
                if (self.socket) self.socket.destroy();
                reject(new Error('Connection timeout'));
            }, 15000);

            self.socket = new net.Socket();
            self.socket.on('error', function(err) {
                clearTimeout(timeout);
                self.connected = false;
                reject(err);
            });
            self.socket.connect(self.port, self.host, function() {
                clearTimeout(timeout);
                self.connected = true;
                self.login().then(resolve).catch(reject);
            });
        });
    }

    readSentence() {
        var self = this;
        return new Promise(function(resolve, reject) {
            var words = [];
            var timeout = setTimeout(function() {
                reject(new Error('Read timeout'));
            }, 15000);

            function tryParse() {
                while (true) {
                    if (self.buffer.length === 0) return false;
                    var decoded = self.decodeLength(self.buffer, 0);
                    if (self.buffer.length < decoded.size + decoded.len) return false;

                    if (decoded.len === 0) {
                        // End of sentence
                        self.buffer = self.buffer.slice(decoded.size);
                        clearTimeout(timeout);
                        resolve(words);
                        return true;
                    }

                    var word = self.buffer.slice(decoded.size, decoded.size + decoded.len).toString('utf8');
                    self.buffer = self.buffer.slice(decoded.size + decoded.len);
                    words.push(word);
                }
            }

            if (tryParse()) return;

            function onData(chunk) {
                self.buffer = Buffer.concat([self.buffer, chunk]);
                if (tryParse()) {
                    self.socket.removeListener('data', onData);
                    self.socket.removeListener('error', onError);
                }
            }
            function onError(err) {
                clearTimeout(timeout);
                self.socket.removeListener('data', onData);
                reject(err);
            }

            self.socket.on('data', onData);
            self.socket.once('error', onError);
        });
    }

    writeSentence(words) {
        if (!this.socket || !this.connected) throw new Error('Not connected');
        this.socket.write(this.encodeSentence(words));
    }

    async login() {
        // Try new-style login first (RouterOS 6.43+)
        this.writeSentence(['/login', '=name=' + this.user, '=password=' + this.password]);
        var reply = await this.readSentence();

        if (reply[0] === '!done') {
            // Check if challenge-response needed (old style)
            var ret = reply.find(function(w) { return w.startsWith('=ret='); });
            if (ret) {
                var challenge = Buffer.from(ret.substring(5), 'hex');
                var hash = crypto.createHash('md5');
                hash.update(Buffer.from([0]));
                hash.update(Buffer.from(this.password));
                hash.update(challenge);
                var response = '00' + hash.digest('hex');
                this.writeSentence(['/login', '=name=' + this.user, '=response=' + response]);
                var reply2 = await this.readSentence();
                if (reply2[0] !== '!done') throw new Error('Login failed (challenge)');
            }
            console.log('[HCC] RouterOS authenticated to ' + this.host);
            return true;
        }
        if (reply[0] === '!trap') {
            var msg = reply.find(function(w) { return w.startsWith('=message='); });
            throw new Error(msg ? msg.substring(9) : 'Login failed');
        }
        throw new Error('Unexpected login response: ' + reply[0]);
    }

    async command(cmd, params) {
        if (!this.connected) await this.connect();

        var words = [cmd];
        if (params) {
            for (var key in params) {
                words.push('=' + key + '=' + params[key]);
            }
        }

        this.writeSentence(words);

        var results = [];
        while (true) {
            var sentence = await this.readSentence();
            if (sentence[0] === '!done') break;
            if (sentence[0] === '!trap') {
                var msg = sentence.find(function(w) { return w.startsWith('=message='); });
                console.error('[HCC] RouterOS trap:', msg ? msg.substring(9) : 'unknown');
                break;
            }
            if (sentence[0] === '!re') {
                var obj = {};
                sentence.slice(1).forEach(function(w) {
                    if (w.startsWith('=')) {
                        var eq = w.indexOf('=', 1);
                        if (eq > 0) obj[w.substring(1, eq)] = w.substring(eq + 1);
                    }
                });
                results.push(obj);
            }
        }
        return results;
    }

    disconnect() {
        if (this.socket) {
            try { this.socket.destroy(); } catch(e) {}
            this.socket = null;
        }
        this.connected = false;
    }

    // ── API Methods ──

    async getNetwatch() {
        var entries = await this.command('/tool/netwatch/print');
        return entries.map(function(e) {
            return {
                host: e.host || '',
                comment: e.comment || e.host || '',
                status: e.status || 'unknown',
                since: e.since || '',
                type: e.type || 'simple'
            };
        });
    }

    async getSystemResource() {
        var res = await this.command('/system/resource/print');
        if (!res[0]) return null;
        var r = res[0];
        return {
            uptime: r.uptime || '',
            cpuLoad: parseInt(r['cpu-load']) || 0,
            freeMemory: parseInt(r['free-memory']) || 0,
            totalMemory: parseInt(r['total-memory']) || 0,
            freeHdd: parseInt(r['free-hdd-space']) || 0,
            totalHdd: parseInt(r['total-hdd-space']) || 0,
            architecture: r['architecture-name'] || '',
            boardName: r['board-name'] || '',
            version: r.version || ''
        };
    }

    async poll() {
        try {
            var netwatch = await this.getNetwatch();
            var system = await this.getSystemResource();
            return { netwatch: netwatch, system: system };
        } catch (err) {
            console.error('[HCC] RouterOS poll error:', err.message);
            this.disconnect();
            return null;
        }
    }
}

module.exports = { RouterOSService };
