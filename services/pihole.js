// Pi-hole stats via Prometheus pihole-exporter (10.40.40.2:9617)
// RPi can't reach 172.17.0.2 directly (Docker bridge collision)
// So we pull stats from pihole-exporter's Prometheus metrics instead

class PiholeClient {
    constructor(prometheusUrl) {
        this.prometheusUrl = (prometheusUrl || 'http://127.0.0.1:9090').replace(/\/+$/, '');
    }

    async query(promql) {
        try {
            var url = this.prometheusUrl + '/api/v1/query?query=' + encodeURIComponent(promql);
            var res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) return null;
            var data = await res.json();
            if (data.status !== 'success' || !data.data.result.length) return null;
            return parseFloat(data.data.result[0].value[1]);
        } catch (err) {
            console.error('[HCC] Pi-hole query error:', err.message);
            return null;
        }
    }

    async poll() {
        try {
            var results = await Promise.all([
                this.query('pihole_dns_queries_today'),
                this.query('pihole_ads_blocked_today'),
                this.query('pihole_ads_percentage_today'),
                this.query('pihole_domains_being_blocked'),
                this.query('pihole_unique_clients'),
                this.query('pihole_dns_queries_all_types'),
                this.query('pihole_status')
            ]);

            var totalQueries = results[0];
            if (totalQueries === null) return null;

            return {
                totalQueries: Math.floor(results[0] || 0),
                blockedQueries: Math.floor(results[1] || 0),
                percentBlocked: results[2] || 0,
                gravitySize: Math.floor(results[3] || 0),
                clients: Math.floor(results[4] || 0),
                allTypes: Math.floor(results[5] || 0),
                status: results[6] === 1 ? 'enabled' : 'disabled',
                topDomains: [],
                topBlocked: [],
                recentQueries: []
            };
        } catch (err) {
            console.error('[HCC] Pi-hole poll error:', err.message);
            return null;
        }
    }
}

module.exports = { PiholeClient };
