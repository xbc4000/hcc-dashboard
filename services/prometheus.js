// Prometheus query client — iDRAC server metrics + RPi node_exporter

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

    async queryValue(promql) {
        var result = await this.query(promql);
        if (!result || !result.length) return null;
        return parseFloat(result[0].value[1]);
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

    findLabel(resultArray, instance, label) {
        if (!resultArray) return null;
        for (var i = 0; i < resultArray.length; i++) {
            if (resultArray[i].metric.instance === instance) {
                return resultArray[i].metric[label] || null;
            }
        }
        return null;
    }

    async getServerHealth() {
        // iDRAC instances
        var idrac1 = process.env.IDRAC1_INSTANCE || '10.30.30.10';
        var idrac2 = process.env.IDRAC2_INSTANCE || '10.30.30.11';
        var rpiInst = process.env.RPI_INSTANCE || '10.40.40.2:9100';

        // Run all queries in parallel
        var queries = {
            power: 'idrac_power_control_consumed_watts',
            powerAvg: 'idrac_power_control_avg_consumed_watts',
            powerMax: 'idrac_power_control_max_consumed_watts',
            powerCap: 'idrac_power_control_capacity_watts',
            temp: 'idrac_sensors_temperature{name=~".*Inlet.*|.*System Board Inlet.*"}',
            fanSpeed: 'avg by(instance) (idrac_sensors_fan_speed)',
            systemHealth: 'idrac_system_health',
            powerOn: 'idrac_system_power_on',
            totalRam: 'idrac_system_memory_size_bytes',
            cpuCores: 'idrac_system_cpu_count',
            driveHealth: 'idrac_storage_drive_health',
            driveCapacity: 'idrac_storage_drive_capacity_bytes',
            driveLife: 'idrac_storage_drive_life_left_percent',
            psuHealth: 'idrac_power_supply_health',
            machineInfo: 'idrac_system_machine_info',
            // RPi node_exporter
            rpiCpu: '100 - (avg(rate(node_cpu_seconds_total{mode="idle",instance="' + rpiInst + '"}[5m])) * 100)',
            rpiRam: '(1 - node_memory_MemAvailable_bytes{instance="' + rpiInst + '"} / node_memory_MemTotal_bytes{instance="' + rpiInst + '"}) * 100',
            rpiDisk: '(1 - node_filesystem_avail_bytes{instance="' + rpiInst + '",mountpoint="/"} / node_filesystem_size_bytes{instance="' + rpiInst + '",mountpoint="/"}) * 100',
            rpiLoad: 'node_load1{instance="' + rpiInst + '"}',
            rpiUptime: 'node_time_seconds{instance="' + rpiInst + '"} - node_boot_time_seconds{instance="' + rpiInst + '"}',
            rpiTemp: 'node_thermal_zone_temp{instance="' + rpiInst + '",type="cpu-thermal"}'
        };

        var keys = Object.keys(queries);
        var promises = keys.map(function(key) { return this.query(queries[key]); }.bind(this));
        var resolved = await Promise.all(promises);
        var r = {};
        keys.forEach(function(key, i) { r[key] = resolved[i]; });

        // Build server objects from iDRAC data
        var servers = {};

        var idracServers = [
            { key: 'per730xd', instance: idrac1, name: 'PER730XD', role: 'Workstation' },
            { key: 'per630', instance: idrac2, name: 'PER630', role: 'Ubuntu Server' }
        ];

        idracServers.forEach(function(srv) {
            var powerOn = this.findValue(r.powerOn, srv.instance);
            var health = this.findValue(r.systemHealth, srv.instance);
            var power = this.findValue(r.power, srv.instance);
            var powerAvg = this.findValue(r.powerAvg, srv.instance);
            var powerMax = this.findValue(r.powerMax, srv.instance);
            var powerCap = this.findValue(r.powerCap, srv.instance);
            var temp = this.findValue(r.temp, srv.instance);
            var fanSpeed = this.findValue(r.fanSpeed, srv.instance);
            var totalRam = this.findValue(r.totalRam, srv.instance);
            var model = this.findLabel(r.machineInfo, srv.instance, 'model');

            // Count drives and their health
            var driveCount = 0;
            var drivesHealthy = 0;
            if (r.driveHealth) {
                r.driveHealth.forEach(function(d) {
                    if (d.metric.instance === srv.instance) {
                        driveCount++;
                        if (parseFloat(d.value[1]) === 1) drivesHealthy++;
                    }
                });
            }

            // PSU health
            var psuCount = 0;
            var psuHealthy = 0;
            if (r.psuHealth) {
                r.psuHealth.forEach(function(d) {
                    if (d.metric.instance === srv.instance) {
                        psuCount++;
                        if (parseFloat(d.value[1]) === 1) psuHealthy++;
                    }
                });
            }

            servers[srv.key] = {
                name: srv.name,
                role: srv.role,
                instance: srv.instance,
                model: model || srv.name,
                status: powerOn === 1 ? 'up' : 'down',
                health: health === 1 ? 'OK' : 'DEGRADED',
                power: power ? Math.floor(power) : null,
                powerAvg: powerAvg ? Math.floor(powerAvg) : null,
                powerMax: powerMax ? Math.floor(powerMax) : null,
                powerCap: powerCap ? Math.floor(powerCap) : null,
                temp: temp ? Math.floor(temp) : null,
                fanSpeed: fanSpeed ? Math.floor(fanSpeed) : null,
                totalRamGB: totalRam ? Math.floor(totalRam / 1073741824) : null,
                drives: driveCount,
                drivesHealthy: drivesHealthy,
                psu: psuCount,
                psuHealthy: psuHealthy
            };
        }.bind(this));

        // RPi from node_exporter
        var rpiCpu = r.rpiCpu && r.rpiCpu[0] ? parseFloat(r.rpiCpu[0].value[1]) : null;
        var rpiRam = r.rpiRam && r.rpiRam[0] ? parseFloat(r.rpiRam[0].value[1]) : null;
        var rpiDisk = r.rpiDisk && r.rpiDisk[0] ? parseFloat(r.rpiDisk[0].value[1]) : null;
        var rpiLoad = r.rpiLoad && r.rpiLoad[0] ? parseFloat(r.rpiLoad[0].value[1]) : null;
        var rpiUptime = r.rpiUptime && r.rpiUptime[0] ? parseFloat(r.rpiUptime[0].value[1]) : null;
        var rpiTemp = r.rpiTemp && r.rpiTemp[0] ? parseFloat(r.rpiTemp[0].value[1]) : null;

        servers.rpi = {
            name: 'Raspberry Pi',
            role: 'Monitoring Stack',
            instance: rpiInst,
            status: rpiCpu !== null ? 'up' : 'down',
            cpu: rpiCpu,
            ram: rpiRam,
            disk: rpiDisk,
            load: rpiLoad,
            uptime: rpiUptime,
            temp: rpiTemp
        };

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

    async poll() {
        try {
            var servers = await this.getServerHealth();
            var targets = await this.getTargets();
            return { servers: servers, targets: targets };
        } catch (err) {
            console.error('[HCC] Prometheus poll error:', err.message);
            return null;
        }
    }
}

module.exports = { PrometheusClient };
