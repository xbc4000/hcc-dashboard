class PiholeClient {
    constructor(baseUrl, password) {
        this.baseUrl = baseUrl || 'http://172.17.0.2';
        this.password = password;
        this.sid = null;
    }

    async authenticate() {
        try {
            const res = await fetch(this.baseUrl + '/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: this.password })
            });
            const data = await res.json();
            if (data.session && data.session.sid) {
                this.sid = data.session.sid;
                console.log('[HCC] Pi-hole authenticated');
                return true;
            }
            console.error('[HCC] Pi-hole auth failed:', JSON.stringify(data));
            return false;
        } catch (err) {
            console.error('[HCC] Pi-hole auth error:', err.message);
            return false;
        }
    }

    async apiFetch(path) {
        if (!this.sid) await this.authenticate();
        if (!this.sid) return null;

        var sep = path.indexOf('?') !== -1 ? '&' : '?';
        var url = this.baseUrl + path + sep + 'sid=' + this.sid;

        try {
            var res = await fetch(url);
            if (res.status === 401) {
                // SID expired, re-auth and retry
                await this.authenticate();
                if (!this.sid) return null;
                url = this.baseUrl + path + sep + 'sid=' + this.sid;
                res = await fetch(url);
            }
            if (!res.ok) return null;
            return await res.json();
        } catch (err) {
            console.error('[HCC] Pi-hole fetch error (' + path + '):', err.message);
            return null;
        }
    }

    async getSummary() {
        return this.apiFetch('/api/stats/summary');
    }

    async getTopDomains() {
        return this.apiFetch('/api/stats/top_domains?count=10');
    }

    async getTopBlocked() {
        return this.apiFetch('/api/stats/top_domains?blocked=true&count=10');
    }

    async poll() {
        var summary = await this.getSummary();
        var topDomains = await this.getTopDomains();
        var topBlocked = await this.getTopBlocked();

        if (!summary) return null;

        return {
            totalQueries: summary.queries ? summary.queries.total : 0,
            blockedQueries: summary.queries ? summary.queries.blocked : 0,
            percentBlocked: summary.queries ? summary.queries.percent_blocked : 0,
            gravitySize: summary.gravity ? summary.gravity.domains_being_blocked : 0,
            status: summary.ftl ? summary.ftl.status : 'unknown',
            topDomains: topDomains ? (topDomains.top_domains || []) : [],
            topBlocked: topBlocked ? (topBlocked.top_domains || []) : []
        };
    }
}

module.exports = { PiholeClient };
