const { PiholeClient } = require('./pihole');
const { PrometheusClient } = require('./prometheus');
const { RouterOSService } = require('./routeros');

class Poller {
    constructor() {
        this.pihole = new PiholeClient(process.env.PROMETHEUS_URL);
        this.prometheus = new PrometheusClient(process.env.PROMETHEUS_URL);
        this.routeros = new RouterOSService(
            process.env.ROUTEROS_HOST, process.env.ROUTEROS_USER,
            process.env.ROUTEROS_PASSWORD, process.env.ROUTEROS_PORT
        );
        this.grafanaUrl = process.env.GRAFANA_URL || 'http://127.0.0.1:3000';

        this.cache = {
            pihole: { data: null, lastPoll: null, status: 'unknown' },
            prometheus: { data: null, lastPoll: null, status: 'unknown' },
            router: { data: null, lastPoll: null, status: 'unknown' },
            grafana: { data: null, lastPoll: null, status: 'unknown' }
        };

        // History for sparklines (last 30 data points)
        this.history = {
            queries: [], blocked: [], routerCpu: [], routerRam: [],
            power730: [], power630: [], rpiCpu: [], rpiTemp: []
        };

        this.startTime = Date.now();
    }

    pushHistory(key, value) {
        if (value === null || value === undefined) return;
        if (!this.history[key]) this.history[key] = [];
        this.history[key].push(value);
        if (this.history[key].length > 30) this.history[key].shift();
    }

    start() {
        var self = this;
        console.log('[HCC] Poller starting...');
        setTimeout(function() { self.pollPihole(); }, 2000);
        setTimeout(function() { self.pollPrometheus(); }, 4000);
        setTimeout(function() { self.pollRouter(); }, 6000);
        setTimeout(function() { self.pollGrafana(); }, 8000);

        var pi = (parseInt(process.env.POLL_PIHOLE) || 15) * 1000;
        var pr = (parseInt(process.env.POLL_PROMETHEUS) || 30) * 1000;
        var nw = (parseInt(process.env.POLL_NETWATCH) || 30) * 1000;
        var gr = (parseInt(process.env.POLL_GRAFANA) || 60) * 1000;

        setInterval(function() { self.pollPihole(); }, pi);
        setInterval(function() { self.pollPrometheus(); }, pr);
        setInterval(function() { self.pollRouter(); }, nw);
        setInterval(function() { self.pollGrafana(); }, gr);
    }

    async pollPihole() {
        try {
            var data = await this.pihole.poll();
            if (data) {
                this.cache.pihole = { data: data, lastPoll: Date.now(), status: 'up' };
                this.pushHistory('queries', data.totalQueries);
                this.pushHistory('blocked', data.blockedQueries);
            } else { this.cache.pihole.status = 'down'; this.cache.pihole.lastPoll = Date.now(); }
        } catch (err) { console.error('[HCC] Pi-hole poll error:', err.message); this.cache.pihole.status = 'error'; }
    }

    async pollPrometheus() {
        try {
            var data = await this.prometheus.poll();
            if (data) {
                this.cache.prometheus = { data: data, lastPoll: Date.now(), status: 'up' };
                if (data.servers) {
                    if (data.servers.per730xd) this.pushHistory('power730', data.servers.per730xd.power);
                    if (data.servers.per630) this.pushHistory('power630', data.servers.per630.power);
                    if (data.servers.rpi) {
                        this.pushHistory('rpiCpu', data.servers.rpi.cpu);
                        this.pushHistory('rpiTemp', data.servers.rpi.temp);
                    }
                }
            } else { this.cache.prometheus.status = 'down'; this.cache.prometheus.lastPoll = Date.now(); }
        } catch (err) { console.error('[HCC] Prometheus poll error:', err.message); this.cache.prometheus.status = 'error'; }
    }

    async pollRouter() {
        try {
            var data = await this.routeros.poll();
            if (data) {
                this.cache.router = { data: data, lastPoll: Date.now(), status: 'up' };
                if (data.system) {
                    this.pushHistory('routerCpu', data.system.cpuLoad);
                    this.pushHistory('routerRam', data.system.totalMemory > 0 ?
                        ((1 - data.system.freeMemory / data.system.totalMemory) * 100) : 0);
                }
            } else { this.cache.router.status = 'down'; this.cache.router.lastPoll = Date.now(); }
        } catch (err) { console.error('[HCC] Router poll error:', err.message); this.cache.router.status = 'error'; }
    }

    async pollGrafana() {
        try {
            var res = await fetch(this.grafanaUrl + '/api/health', { signal: AbortSignal.timeout(5000) });
            if (res.ok) { this.cache.grafana = { data: { status: 'ok' }, lastPoll: Date.now(), status: 'up' }; }
            else { this.cache.grafana.status = 'down'; this.cache.grafana.lastPoll = Date.now(); }
        } catch (err) { this.cache.grafana.status = 'down'; this.cache.grafana.lastPoll = Date.now(); }
    }

    getOverview() {
        var rd = this.cache.router.data || {};
        // Calculate threat level
        var threatLevel = 'LOW';
        var threatColor = '#00ff88';
        if (rd.firewall) {
            var dropped = rd.firewall.totalDropped || 0;
            var blacklists = rd.addressLists || {};
            var sshStage = (blacklists['ssh-stage1'] || 0) + (blacklists['ssh-stage2'] || 0) + (blacklists['ssh-stage3'] || 0);
            var scanners = blacklists['port-scanners'] || 0;
            if (sshStage > 0 || scanners > 0 || dropped > 100000) { threatLevel = 'MEDIUM'; threatColor = '#ff6600'; }
            if (sshStage > 5 || scanners > 3 || dropped > 500000) { threatLevel = 'HIGH'; threatColor = '#ff2244'; }
            if (sshStage > 20 || scanners > 10) { threatLevel = 'CRITICAL'; threatColor = '#FF00B2'; }
        }

        // Service down count
        var services = {
            pihole: { status: this.cache.pihole.status, lastPoll: this.cache.pihole.lastPoll },
            prometheus: { status: this.cache.prometheus.status, lastPoll: this.cache.prometheus.lastPoll },
            router: { status: this.cache.router.status, lastPoll: this.cache.router.lastPoll },
            grafana: { status: this.cache.grafana.status, lastPoll: this.cache.grafana.lastPoll }
        };
        var downCount = Object.values(services).filter(function(s) { return s.status !== 'up'; }).length;
        if (downCount >= 2) { threatLevel = 'HIGH'; threatColor = '#ff2244'; }
        if (downCount >= 3) { threatLevel = 'CRITICAL'; threatColor = '#FF00B2'; }

        return {
            timestamp: Date.now(),
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            threat: { level: threatLevel, color: threatColor },
            services: services,
            pihole: this.cache.pihole.data,
            prometheus: this.cache.prometheus.data,
            router: rd.system || null,
            netwatch: rd.netwatch || null,
            interfaces: rd.interfaces || null,
            dhcp: rd.dhcp || null,
            firewall: rd.firewall || null,
            addressLists: rd.addressLists || null,
            logs: rd.logs || null,
            history: this.history,
            links: [
                { name: 'Grafana', url: this.grafanaUrl, status: this.cache.grafana.status },
                { name: 'Pi-hole', url: 'http://pi.hole/admin', status: this.cache.pihole.status },
                { name: 'iDRAC1', url: 'https://10.30.30.10', status: 'unknown' },
                { name: 'iDRAC2', url: 'https://10.30.30.11', status: 'unknown' },
                { name: 'Router', url: 'http://10.10.10.1', status: this.cache.router.status },
                { name: 'Portainer', url: 'http://10.40.40.2:9002', status: 'unknown' },
                { name: 'AMP', url: 'http://10.20.20.3:8080', status: 'unknown' }
            ]
        };
    }
}

module.exports = { Poller };
