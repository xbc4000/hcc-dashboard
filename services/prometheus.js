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

        // Run all queries in parallel — full metric set for PER730XD detail page
        var queries = {
            // Power
            power: 'idrac_power_control_consumed_watts',
            powerAvg: 'idrac_power_control_avg_consumed_watts',
            powerMin: 'idrac_power_control_min_consumed_watts',
            powerMax: 'idrac_power_control_max_consumed_watts',
            powerCap: 'idrac_power_control_capacity_watts',
            psuHealth: 'idrac_power_supply_health',
            psuVoltage: 'idrac_power_supply_input_voltage',
            // Thermal — all temperature sensors
            tempAll: 'idrac_sensors_temperature',
            tempInlet: 'idrac_sensors_temperature{name=~".*Inlet.*|.*System Board Inlet.*"}',
            // Fans — all fan sensors
            fanAll: 'idrac_sensors_fan_speed',
            fanSpeed: 'avg by(instance) (idrac_sensors_fan_speed)',
            // System
            systemHealth: 'idrac_system_health',
            powerOn: 'idrac_system_power_on',
            totalRam: 'idrac_system_memory_size_bytes',
            cpuCount: 'idrac_system_cpu_count',
            indicatorLed: 'idrac_system_indicator_led_on',
            machineInfo: 'idrac_system_machine_info',
            // CPU
            cpuInfo: 'idrac_cpu_info',
            cpuCores: 'idrac_cpu_total_cores',
            cpuThreads: 'idrac_cpu_total_threads',
            // Memory (per-DIMM)
            memModuleInfo: 'idrac_memory_module_info',
            memModuleCap: 'idrac_memory_module_capacity_bytes',
            memModuleSpeed: 'idrac_memory_module_speed_mhz',
            memModuleHealth: 'idrac_memory_module_health',
            // Storage
            driveInfo: 'idrac_storage_drive_info',
            driveHealth: 'idrac_storage_drive_health',
            driveCapacity: 'idrac_storage_drive_capacity_bytes',
            driveLife: 'idrac_storage_drive_life_left_percent',
            volumeInfo: 'idrac_storage_volume_info',
            volumeCap: 'idrac_storage_volume_capacity_bytes',
            volumeHealth: 'idrac_storage_volume_health',
            volumeSpan: 'idrac_storage_volume_media_span_count',
            storageHealth: 'idrac_storage_health',
            storageInfo: 'idrac_storage_info',
            // Network
            netLinkUp: 'idrac_network_port_link_up',
            netLinkSpeed: 'idrac_network_port_current_speed_mbps',
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

        // Helper: collect all results for a given instance
        function filterByInstance(arr, instance) {
            if (!arr) return [];
            return arr.filter(function(d) { return d.metric.instance === instance; });
        }

        idracServers.forEach(function(srv) {
            var powerOn = this.findValue(r.powerOn, srv.instance);
            var health = this.findValue(r.systemHealth, srv.instance);
            var power = this.findValue(r.power, srv.instance);
            var powerAvg = this.findValue(r.powerAvg, srv.instance);
            var powerMin = this.findValue(r.powerMin, srv.instance);
            var powerMax = this.findValue(r.powerMax, srv.instance);
            var powerCap = this.findValue(r.powerCap, srv.instance);
            var temp = this.findValue(r.tempInlet, srv.instance);
            var fanSpeed = this.findValue(r.fanSpeed, srv.instance);
            var totalRam = this.findValue(r.totalRam, srv.instance);
            var cpuCount = this.findValue(r.cpuCount, srv.instance);
            var cpuCores = this.findValue(r.cpuCores, srv.instance);
            var cpuThreads = this.findValue(r.cpuThreads, srv.instance);
            var indicatorLed = this.findValue(r.indicatorLed, srv.instance);
            var storageHealth = this.findValue(r.storageHealth, srv.instance);
            var model = this.findLabel(r.machineInfo, srv.instance, 'model');
            var manufacturer = this.findLabel(r.machineInfo, srv.instance, 'manufacturer');
            var serial = this.findLabel(r.machineInfo, srv.instance, 'serial');
            var sku = this.findLabel(r.machineInfo, srv.instance, 'sku');

            // ── Detailed temperature sensors ──
            var temps = filterByInstance(r.tempAll, srv.instance).map(function(d) {
                return { name: d.metric.name || d.metric.id || 'sensor', value: parseFloat(d.value[1]) };
            });

            // ── Detailed fan sensors ──
            var fans = filterByInstance(r.fanAll, srv.instance).map(function(d) {
                return { name: d.metric.name || d.metric.id || 'fan', rpm: parseFloat(d.value[1]) };
            });

            // ── PSUs (with voltage) ──
            var psuHealthRows = filterByInstance(r.psuHealth, srv.instance);
            var psuCount = psuHealthRows.length;
            var psuHealthy = 0;
            psuHealthRows.forEach(function(d) { if (parseFloat(d.value[1]) === 0) psuHealthy++; });
            var psus = psuHealthRows.map(function(d) {
                var psuId = d.metric.id || d.metric.psu || '';
                var voltageRow = filterByInstance(r.psuVoltage, srv.instance).find(function(v) {
                    return (v.metric.id || v.metric.psu) === psuId;
                });
                return {
                    id: psuId,
                    name: d.metric.name || psuId,
                    healthy: parseFloat(d.value[1]) === 0,
                    voltage: voltageRow ? parseFloat(voltageRow.value[1]) : null
                };
            });

            // ── Memory DIMMs ──
            var dimms = filterByInstance(r.memModuleInfo, srv.instance).map(function(d) {
                var slot = d.metric.id || d.metric.slot || d.metric.name || '';
                var capRow = filterByInstance(r.memModuleCap, srv.instance).find(function(x) { return (x.metric.id || x.metric.slot) === slot; });
                var spdRow = filterByInstance(r.memModuleSpeed, srv.instance).find(function(x) { return (x.metric.id || x.metric.slot) === slot; });
                var hltRow = filterByInstance(r.memModuleHealth, srv.instance).find(function(x) { return (x.metric.id || x.metric.slot) === slot; });
                return {
                    slot: slot,
                    name: d.metric.name || slot,
                    type: d.metric.type || d.metric.memory_type || '',
                    vendor: d.metric.manufacturer || d.metric.vendor || '',
                    partNumber: d.metric.part_number || '',
                    capacityGB: capRow ? Math.floor(parseFloat(capRow.value[1]) / 1073741824) : null,
                    speedMHz: spdRow ? parseFloat(spdRow.value[1]) : null,
                    healthy: hltRow ? parseFloat(hltRow.value[1]) === 0 : null
                };
            });

            // ── CPU details ──
            var cpus = filterByInstance(r.cpuInfo, srv.instance).map(function(d) {
                return {
                    id: d.metric.id || d.metric.socket || '',
                    model: d.metric.model || d.metric.name || '',
                    manufacturer: d.metric.manufacturer || ''
                };
            });

            // ── Drives ──
            var driveHealthRows = filterByInstance(r.driveHealth, srv.instance);
            var driveCount = driveHealthRows.length;
            var drivesHealthy = 0;
            driveHealthRows.forEach(function(d) { if (parseFloat(d.value[1]) === 0) drivesHealthy++; });
            var drives = driveHealthRows.map(function(d) {
                var did = d.metric.id || d.metric.drive || '';
                var infoRow = filterByInstance(r.driveInfo, srv.instance).find(function(x) { return (x.metric.id || x.metric.drive) === did; });
                var capRow = filterByInstance(r.driveCapacity, srv.instance).find(function(x) { return (x.metric.id || x.metric.drive) === did; });
                var lifeRow = filterByInstance(r.driveLife, srv.instance).find(function(x) { return (x.metric.id || x.metric.drive) === did; });
                return {
                    id: did,
                    name: (infoRow && infoRow.metric.name) || did,
                    model: (infoRow && infoRow.metric.model) || '',
                    serial: (infoRow && infoRow.metric.serial) || '',
                    firmware: (infoRow && (infoRow.metric.firmware || infoRow.metric.revision)) || '',
                    protocol: (infoRow && infoRow.metric.protocol) || '',
                    healthy: parseFloat(d.value[1]) === 0,
                    capacityGB: capRow ? Math.floor(parseFloat(capRow.value[1]) / 1073741824) : null,
                    lifePercent: lifeRow ? parseFloat(lifeRow.value[1]) : null
                };
            });

            // ── RAID Volumes ──
            var volumes = filterByInstance(r.volumeInfo, srv.instance).map(function(d) {
                var vid = d.metric.id || d.metric.volume || '';
                var capRow = filterByInstance(r.volumeCap, srv.instance).find(function(x) { return (x.metric.id || x.metric.volume) === vid; });
                var hltRow = filterByInstance(r.volumeHealth, srv.instance).find(function(x) { return (x.metric.id || x.metric.volume) === vid; });
                var spnRow = filterByInstance(r.volumeSpan, srv.instance).find(function(x) { return (x.metric.id || x.metric.volume) === vid; });
                return {
                    id: vid,
                    name: d.metric.name || vid,
                    raid: d.metric.raid_type || d.metric.raid || '',
                    capacityGB: capRow ? Math.floor(parseFloat(capRow.value[1]) / 1073741824) : null,
                    healthy: hltRow ? parseFloat(hltRow.value[1]) === 0 : null,
                    spans: spnRow ? parseFloat(spnRow.value[1]) : null
                };
            });

            // ── Network ports ──
            var nics = filterByInstance(r.netLinkUp, srv.instance).map(function(d) {
                var pid = d.metric.id || d.metric.port || '';
                var spdRow = filterByInstance(r.netLinkSpeed, srv.instance).find(function(x) { return (x.metric.id || x.metric.port) === pid; });
                return {
                    id: pid,
                    name: d.metric.name || pid,
                    linkUp: parseFloat(d.value[1]) === 1,
                    speedMbps: spdRow ? parseFloat(spdRow.value[1]) : null
                };
            });

            servers[srv.key] = {
                name: srv.name,
                role: srv.role,
                instance: srv.instance,
                model: model || srv.name,
                manufacturer: manufacturer || 'Dell',
                serial: serial || '',
                sku: sku || '',
                status: powerOn !== null ? 'up' : 'down',
                health: health === 0 ? 'OK' : 'DEGRADED',
                power: power ? Math.floor(power) : null,
                powerAvg: powerAvg ? Math.floor(powerAvg) : null,
                powerMin: powerMin ? Math.floor(powerMin) : null,
                powerMax: powerMax ? Math.floor(powerMax) : null,
                powerCap: powerCap ? Math.floor(powerCap) : null,
                temp: temp ? Math.floor(temp) : null,
                fanSpeed: fanSpeed ? Math.floor(fanSpeed) : null,
                totalRamGB: totalRam ? Math.floor(totalRam / 1073741824) : null,
                cpuCount: cpuCount,
                cpuCores: cpuCores,
                cpuThreads: cpuThreads,
                indicatorLed: indicatorLed === 1,
                storageHealth: storageHealth === 0 ? 'OK' : (storageHealth === null ? null : 'DEGRADED'),
                drives: driveCount,
                drivesHealthy: drivesHealthy,
                psu: psuCount,
                psuHealthy: psuHealthy,
                // Detailed arrays for the dedicated page
                temps: temps,
                fans: fans,
                psus: psus,
                dimms: dimms,
                cpus: cpus,
                drivesDetail: drives,
                volumes: volumes,
                nics: nics
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
