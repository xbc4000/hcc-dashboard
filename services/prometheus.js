class PrometheusClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl || 'http://10.40.40.2:9090';
    }

    async query(promql) {
        try {
            var url = this.baseUrl + '/api/v1/query?query=' + encodeURIComponent(promql);
            var res = await fetch(url);
            if (!res.ok) return null;
            var data = await res.json();
            if (data.status !== 'success') return null;
            return data.data.result;
        } catch (err) {
            console.error('[HCC] Prometheus query error:', err.message);
            return null;
        }
    }

    async getServerHealth() {
        var instances = {
            per730xd: process.env.SERVER1_INSTANCE || '10.10.10.2:9100',
            per630: process.env.SERVER2_INSTANCE || '10.20.20.2:9100'
        };

        var queries = {
            cpu: '100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
            ram: '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100',
            disk: '(1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100',
            load: 'node_load1',
            uptime: 'node_time_seconds - node_boot_time_seconds'
        };

        var results = {};
        for (var key in queries) {
            results[key] = await this.query(queries[key]);
        }

        var servers = {};
        for (var name in instances) {
            var inst = instances[name];
            servers[name] = {
                instance: inst,
                cpu: this.findValue(results.cpu, inst),
                ram: this.findValue(results.ram, inst),
                disk: this.findValue(results.disk, inst),
                load: this.findValue(results.load, inst),
                uptime: this.findValue(results.uptime, inst),
                status: 'unknown'
            };
            // If we got any metric, server is up
            if (servers[name].cpu !== null || servers[name].ram !== null) {
                servers[name].status = 'up';
            }
        }

        return servers;
    }

    findValue(resultArray, instance) {
        if (!resultArray) return null;
        for (var i = 0; i < resultArray.length; i++) {
            if (resultArray[i].metric.instance === instance) {
                return parseFloat(resultArray[i].value[1]);
            }
        }
        return null;
    }

    async poll() {
        return this.getServerHealth();
    }
}

module.exports = { PrometheusClient };
