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

    async queryAll(promql) {
        try {
            var url = this.prometheusUrl + '/api/v1/query?query=' + encodeURIComponent(promql);
            var res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) return [];
            var data = await res.json();
            if (data.status !== 'success') return [];
            return data.data.result || [];
        } catch (err) {
            console.error('[HCC] Pi-hole queryAll error:', err.message);
            return [];
        }
    }

    async poll() {
        try {
            var results = await Promise.all([
                this.query('pihole_dns_queries_today'),          // 0
                this.query('pihole_ads_blocked_today'),           // 1
                this.query('pihole_ads_percentage_today'),        // 2
                this.query('pihole_domains_being_blocked'),       // 3
                this.query('pihole_unique_clients'),              // 4
                this.query('pihole_dns_queries_all_types'),       // 5
                this.query('pihole_status'),                      // 6
                this.query('pihole_queries_cached'),              // 7
                this.query('pihole_queries_forwarded'),           // 8
                this.query('pihole_unique_domains'),              // 9
                this.queryAll('pihole_querytypes'),               // 10
                this.queryAll('pihole_forward_destinations'),     // 11
                this.queryAll('sort_desc(pihole_top_ads)'),       // 12
                this.queryAll('sort_desc(pihole_top_queries)'),   // 13
                this.queryAll('sort_desc(pihole_top_sources)'),   // 14
                this.queryAll('pihole_reply')                     // 15
            ]);

            var totalQueries = results[0];
            if (totalQueries === null) return null;

            // Parse query types — label: "type"
            var queryTypes = results[10].map(function(r) {
                return { type: r.metric.type || r.metric.name || 'unknown', count: parseFloat(r.value[1]) };
            }).filter(function(q) { return q.count > 0; }).sort(function(a, b) { return b.count - a.count; });

            // Parse forward destinations — label: "destination"
            var upstreams = results[11].map(function(r) {
                return { name: r.metric.destination || r.metric.dst || 'unknown', pct: parseFloat(r.value[1]) };
            }).sort(function(a, b) { return b.pct - a.pct; });

            // Parse top blocked — label: "domain"
            var topBlocked = results[12].map(function(r) {
                return { domain: r.metric.domain || 'unknown', count: Math.floor(parseFloat(r.value[1])) };
            }).slice(0, 8);

            // Parse top queries — label: "domain"
            var topQueries = results[13].map(function(r) {
                return { domain: r.metric.domain || 'unknown', count: Math.floor(parseFloat(r.value[1])) };
            }).slice(0, 5);

            // Parse top sources — label: "client"
            var topSources = results[14].map(function(r) {
                return { client: r.metric.client || 'unknown', count: Math.floor(parseFloat(r.value[1])) };
            }).slice(0, 5);

            // Parse reply types — label: "type"
            var replyTypes = results[15].map(function(r) {
                return { type: r.metric.type || 'unknown', count: parseFloat(r.value[1]) };
            }).filter(function(q) { return q.count > 0; }).sort(function(a, b) { return b.count - a.count; });

            return {
                totalQueries: Math.floor(results[0] || 0),
                blockedQueries: Math.floor(results[1] || 0),
                percentBlocked: results[2] || 0,
                gravitySize: Math.floor(results[3] || 0),
                clients: Math.floor(results[4] || 0),
                allTypes: Math.floor(results[5] || 0),
                status: results[6] === 1 ? 'enabled' : 'disabled',
                cached: Math.floor(results[7] || 0),
                forwarded: Math.floor(results[8] || 0),
                uniqueDomains: Math.floor(results[9] || 0),
                queryTypes: queryTypes,
                upstreams: upstreams,
                topBlocked: topBlocked,
                topQueries: topQueries,
                topSources: topSources,
                replyTypes: replyTypes
            };
        } catch (err) {
            console.error('[HCC] Pi-hole poll error:', err.message);
            return null;
        }
    }
}

module.exports = { PiholeClient };
