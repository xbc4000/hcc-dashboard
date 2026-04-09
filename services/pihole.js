// Pi-hole v6 API client — handles SID auth, HTTPS with self-signed certs

class PiholeClient {
    constructor(baseUrl, password) {
        this.baseUrl = (baseUrl || 'http://172.17.0.2').replace(/\/+$/, '');
        this.password = password;
        this.sid = null;
    }

    async authenticate() {
        try {
            var res = await fetch(this.baseUrl + '/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: this.password })
            });
            var data = await res.json();
            if (data.session && data.session.sid) {
                this.sid = data.session.sid;
                console.log('[HCC] Pi-hole authenticated (SID obtained)');
                return true;
            }
            console.error('[HCC] Pi-hole auth response:', JSON.stringify(data).substring(0, 200));
            return false;
        } catch (err) {
            console.error('[HCC] Pi-hole auth error:', err.message);
            return false;
        }
    }

    async apiFetch(path) {
        if (!this.sid) {
            var authed = await this.authenticate();
            if (!authed) return null;
        }

        var sep = path.indexOf('?') !== -1 ? '&' : '?';
        var url = this.baseUrl + path + sep + 'sid=' + this.sid;

        try {
            var res = await fetch(url);
            if (res.status === 401) {
                this.sid = null;
                var reauthed = await this.authenticate();
                if (!reauthed) return null;
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

    async poll() {
        try {
            var summary = await this.apiFetch('/api/stats/summary');
            if (!summary) return null;

            var topBlocked = await this.apiFetch('/api/stats/top_domains?blocked=true&count=10');
            var topDomains = await this.apiFetch('/api/stats/top_domains?count=10');
            var recentQueries = await this.apiFetch('/api/queries?length=20');

            return {
                totalQueries: summary.queries ? summary.queries.total : 0,
                blockedQueries: summary.queries ? summary.queries.blocked : 0,
                percentBlocked: summary.queries ? summary.queries.percent_blocked : 0,
                gravitySize: summary.gravity ? summary.gravity.domains_being_blocked : 0,
                status: summary.ftl ? summary.ftl.status : 'unknown',
                clients: summary.clients ? summary.clients.total : 0,
                uniqueDomains: summary.queries ? summary.queries.unique_domains : 0,
                topDomains: topDomains ? (topDomains.top_domains || []) : [],
                topBlocked: topBlocked ? (topBlocked.top_domains || []) : [],
                recentQueries: recentQueries ? (recentQueries.queries || []).slice(0, 10) : []
            };
        } catch (err) {
            console.error('[HCC] Pi-hole poll error:', err.message);
            return null;
        }
    }
}

module.exports = { PiholeClient };
