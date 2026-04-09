// RouterOS API client — netwatch + system resource polling
// Uses node-routeros with aggressive error handling to prevent process crashes

const { RouterOSAPI } = require('node-routeros');

class RouterOSService {
    constructor(host, user, password, port) {
        this.host = host || '10.10.10.1';
        this.user = user || 'mktxp_user';
        this.password = password || '';
        this.port = parseInt(port) || 8728;
        this.api = null;
        this.connected = false;
    }

    async connect() {
        // Clean up old connection
        if (this.api) {
            try { await this.api.close(); } catch(e) {}
            this.api = null;
            this.connected = false;
        }

        try {
            this.api = new RouterOSAPI({
                host: this.host,
                user: this.user,
                password: this.password,
                port: this.port,
                timeout: 15
            });

            // Catch ALL error events to prevent process crash
            this.api.on('error', function(err) {
                console.error('[HCC] RouterOS event error:', err.message || err);
            });

            if (this.api.rawSocket) {
                this.api.rawSocket.on('error', function(err) {
                    console.error('[HCC] RouterOS socket error:', err.message || err);
                });
            }

            await this.api.connect();
            this.connected = true;

            // Catch errors on the connected socket too
            if (this.api.rawSocket) {
                this.api.rawSocket.on('error', function(err) {
                    console.error('[HCC] RouterOS socket error (post-connect):', err.message || err);
                });
            }

            console.log('[HCC] RouterOS connected to ' + this.host);
            return true;
        } catch (err) {
            console.error('[HCC] RouterOS connect error:', err.message);
            this.api = null;
            this.connected = false;
            return false;
        }
    }

    async safeWrite(command) {
        if (!this.api || !this.connected) {
            var ok = await this.connect();
            if (!ok) return null;
        }
        try {
            return await this.api.write(command);
        } catch (err) {
            console.error('[HCC] RouterOS command error (' + command + '):', err.message);
            this.api = null;
            this.connected = false;
            return null;
        }
    }

    async getNetwatch() {
        var entries = await this.safeWrite('/tool/netwatch/print');
        if (!entries) return null;
        return entries.map(function(e) {
            return {
                host: e.host,
                comment: e.comment || e.host,
                status: e.status || 'unknown',
                since: e.since || '',
                type: e.type || 'simple'
            };
        });
    }

    async getSystemResource() {
        var res = await this.safeWrite('/system/resource/print');
        if (!res || !res[0]) return null;
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

    async getInterfaces() {
        var entries = await this.safeWrite('/interface/print');
        if (!entries) return null;
        return entries.filter(function(e) {
            return e.type !== 'bridge' && e.running === 'true';
        }).map(function(e) {
            return {
                name: e.name,
                type: e.type,
                running: e.running === 'true',
                rxBytes: parseInt(e['rx-byte']) || 0,
                txBytes: parseInt(e['tx-byte']) || 0
            };
        }).slice(0, 12);
    }

    async poll() {
        try {
            var netwatch = await this.getNetwatch();
            var sysResource = await this.getSystemResource();
            var interfaces = await this.getInterfaces();
            return {
                netwatch: netwatch,
                system: sysResource,
                interfaces: interfaces
            };
        } catch (err) {
            console.error('[HCC] RouterOS poll error:', err.message);
            return null;
        }
    }
}

module.exports = { RouterOSService };
