const { PiholeClient } = require('./pihole');
const { PrometheusClient } = require('./prometheus');
const { RouterOSService } = require('./routeros');

class Poller {
    constructor() {
        this.pihole = new PiholeClient(
            process.env.PIHOLE_URL,
            process.env.PIHOLE_PASSWORD
        );
        this.prometheus = new PrometheusClient(
            process.env.PROMETHEUS_URL
        );
        this.routeros = new RouterOSService(
            process.env.ROUTEROS_HOST,
            process.env.ROUTEROS_USER,
            process.env.ROUTEROS_PASSWORD,
            process.env.ROUTEROS_PORT
        );
        this.grafanaUrl = process.env.GRAFANA_URL || 'http://10.40.40.2:3000';

        this.cache = {
            pihole: { data: null, lastPoll: null, status: 'unknown' },
            prometheus: { data: null, lastPoll: null, status: 'unknown' },
            netwatch: { data: null, lastPoll: null, status: 'unknown' },
            grafana: { data: null, lastPoll: null, status: 'unknown' }
        };
    }

    start() {
        var self = this;
        console.log('[HCC] Poller starting...');

        // Initial poll
        setTimeout(function() { self.pollPihole(); }, 1000);
        setTimeout(function() { self.pollPrometheus(); }, 2000);
        setTimeout(function() { self.pollNetwatch(); }, 3000);
        setTimeout(function() { self.pollGrafana(); }, 4000);

        // Recurring polls
        var piholeInterval = (parseInt(process.env.POLL_PIHOLE) || 15) * 1000;
        var promInterval = (parseInt(process.env.POLL_PROMETHEUS) || 30) * 1000;
        var netwatchInterval = (parseInt(process.env.POLL_NETWATCH) || 30) * 1000;
        var grafanaInterval = (parseInt(process.env.POLL_GRAFANA) || 60) * 1000;

        setInterval(function() { self.pollPihole(); }, piholeInterval);
        setInterval(function() { self.pollPrometheus(); }, promInterval);
        setInterval(function() { self.pollNetwatch(); }, netwatchInterval);
        setInterval(function() { self.pollGrafana(); }, grafanaInterval);
    }

    async pollPihole() {
        try {
            var data = await this.pihole.poll();
            if (data) {
                this.cache.pihole = { data: data, lastPoll: Date.now(), status: 'up' };
            } else {
                this.cache.pihole.status = 'down';
            }
        } catch (err) {
            console.error('[HCC] Pi-hole poll error:', err.message);
            this.cache.pihole.status = 'error';
        }
    }

    async pollPrometheus() {
        try {
            var data = await this.prometheus.poll();
            if (data) {
                this.cache.prometheus = { data: data, lastPoll: Date.now(), status: 'up' };
            } else {
                this.cache.prometheus.status = 'down';
            }
        } catch (err) {
            console.error('[HCC] Prometheus poll error:', err.message);
            this.cache.prometheus.status = 'error';
        }
    }

    async pollNetwatch() {
        try {
            var data = await this.routeros.poll();
            if (data) {
                this.cache.netwatch = { data: data, lastPoll: Date.now(), status: 'up' };
            } else {
                this.cache.netwatch.status = 'down';
            }
        } catch (err) {
            console.error('[HCC] Netwatch poll error:', err.message);
            this.cache.netwatch.status = 'error';
        }
    }

    async pollGrafana() {
        try {
            var res = await fetch(this.grafanaUrl + '/api/health');
            if (res.ok) {
                this.cache.grafana = { data: { status: 'ok' }, lastPoll: Date.now(), status: 'up' };
            } else {
                this.cache.grafana.status = 'down';
            }
        } catch (err) {
            this.cache.grafana.status = 'down';
        }
    }

    getOverview() {
        return {
            timestamp: Date.now(),
            services: {
                pihole: { status: this.cache.pihole.status, lastPoll: this.cache.pihole.lastPoll },
                prometheus: { status: this.cache.prometheus.status, lastPoll: this.cache.prometheus.lastPoll },
                router: { status: this.cache.netwatch.status, lastPoll: this.cache.netwatch.lastPoll },
                grafana: { status: this.cache.grafana.status, lastPoll: this.cache.grafana.lastPoll }
            },
            pihole: this.cache.pihole.data,
            prometheus: this.cache.prometheus.data,
            netwatch: this.cache.netwatch.data,
            links: [
                { name: 'Grafana', url: this.grafanaUrl, status: this.cache.grafana.status, icon: 'chart' },
                { name: 'Pi-hole', url: (process.env.PIHOLE_URL || 'http://172.17.0.2') + '/admin', status: this.cache.pihole.status, icon: 'shield' },
                { name: 'iDRAC1', url: 'https://10.30.30.10', status: 'unknown', icon: 'server' },
                { name: 'iDRAC2', url: 'https://10.30.30.11', status: 'unknown', icon: 'server' },
                { name: 'Router', url: 'http://10.10.10.1', status: this.cache.netwatch.status, icon: 'router' },
                { name: 'Portainer', url: 'http://10.40.40.2:9002', status: 'unknown', icon: 'docker' }
            ]
        };
    }
}

module.exports = { Poller };
