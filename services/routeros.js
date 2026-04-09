const { RouterOSAPI } = require('node-routeros');

class RouterOSService {
    constructor(host, user, password, port) {
        this.host = host || '10.10.10.1';
        this.user = user || 'mktxp_user';
        this.password = password || '';
        this.port = parseInt(port) || 8728;
        this.api = null;
    }

    async connect() {
        try {
            this.api = new RouterOSAPI({
                host: this.host,
                user: this.user,
                password: this.password,
                port: this.port,
                timeout: 10
            });
            // Catch unhandled error events to prevent process crash
            this.api.on('error', function(err) {
                console.error('[HCC] RouterOS event error:', err.message);
            });
            await this.api.connect();
            console.log('[HCC] RouterOS connected');
            return true;
        } catch (err) {
            console.error('[HCC] RouterOS connect error:', err.message);
            this.api = null;
            return false;
        }
    }

    async getNetwatch() {
        if (!this.api) {
            var connected = await this.connect();
            if (!connected) return null;
        }

        try {
            var entries = await this.api.write('/tool/netwatch/print');
            return entries.map(function(e) {
                return {
                    host: e.host,
                    comment: e.comment || e.host,
                    status: e.status || 'unknown',
                    since: e.since || '',
                    type: e.type || 'simple'
                };
            });
        } catch (err) {
            console.error('[HCC] RouterOS netwatch error:', err.message);
            this.api = null;
            return null;
        }
    }

    async poll() {
        return this.getNetwatch();
    }
}

module.exports = { RouterOSService };
