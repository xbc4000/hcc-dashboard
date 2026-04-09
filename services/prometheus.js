// Prometheus query client — server health + RPi metrics

class PrometheusClient {
    constructor(baseUrl) {
        this.baseUrl = (baseUrl || 'http://127.0.0.1:9090').replace(/\/+$/, '');
    }

    async query(promql) {
        try {
            var url = this.baseUrl + '/api/v1/query?query=' + encodeURIComponent(promql);
            var res = await fetch(url, { signal: AbortSignal.timeout(10000) });
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
        var instances = {};
        if (process.env.SERVER1_INSTANCE) instances.per730xd = process.env.SERVER1_INSTANCE;
        if (process.env.SERVER2_INSTANCE) instances.per630 = process.env.SERVER2_INSTANCE;
        if (process.env.RPI_INSTANCE) instances.rpi = process.env.RPI_INSTANCE;
        // Default: at least show RPi
        if (Object.keys(instances).length === 0) instances.rpi = '10.40.40.2:9100';

        var queries = {
            cpu: '100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
            ram: '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100',
            disk: '(1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100',
            load: 'node_load1',
            uptime: 'node_time_seconds - node_boot_time_seconds',
            totalRam: 'node_memory_MemTotal_bytes',
            totalDisk: 'node_filesystem_size_bytes{mountpoint="/"}'
        };

        var results = {};
        // Run queries in parallel
        var keys = Object.keys(queries);
        var promises = keys.map(function(key) {
            return this.query(queries[key]);
        }.bind(this));

        var resolved = await Promise.all(promises);
        keys.forEach(function(key, i) {
            results[key] = resolved[i];
        });

        var servers = {};
        for (var name in instances) {
            var inst = instances[name];
            var totalRam = this.findValue(results.totalRam, inst);
            var totalDisk = this.findValue(results.totalDisk, inst);
            servers[name] = {
                instance: inst,
                cpu: this.findValue(results.cpu, inst),
                ram: this.findValue(results.ram, inst),
                disk: this.findValue(results.disk, inst),
                load: this.findValue(results.load, inst),
                uptime: this.findValue(results.uptime, inst),
                totalRamGB: totalRam ? (totalRam / 1073741824).toFixed(0) : null,
                totalDiskGB: totalDisk ? (totalDisk / 1073741824).toFixed(0) : null,
                status: 'down'
            };
            if (servers[name].cpu !== null || servers[name].ram !== null) {
                servers[name].status = 'up';
            }
        }

        return servers;
    }

    async getTargets() {
        try {
            var url = this.baseUrl + '/api/v1/targets?state=active';
            var res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) return null;
            var data = await res.json();
            if (data.status !== 'success') return null;
            var active = data.data.activeTargets || [];
            return {
                total: active.length,
                up: active.filter(function(t) { return t.health === 'up'; }).length,
                down: active.filter(function(t) { return t.health === 'down'; }).length,
                targets: active.map(function(t) {
                    return {
                        job: t.labels.job || '',
                        instance: t.labels.instance || '',
                        health: t.health,
                        lastScrape: t.lastScrape
                    };
                })
            };
        } catch (err) {
            console.error('[HCC] Prometheus targets error:', err.message);
            return null;
        }
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
        try {
            var health = await this.getServerHealth();
            var targets = await this.getTargets();
            return { servers: health, targets: targets };
        } catch (err) {
            console.error('[HCC] Prometheus poll error:', err.message);
            return null;
        }
    }
}

module.exports = { PrometheusClient };
