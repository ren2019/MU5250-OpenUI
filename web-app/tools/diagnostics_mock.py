#!/usr/bin/env python3
"""Deterministic diagnostics HTTP fixture; never accesses a real device.

Start: python3 tools/diagnostics_mock.py
Then: npm run dev -- --host ::1 --port 8090 --strictPort
Open: http://[::1]:8090/?demo=1 (any login password)
Control: curl -g --noproxy '*' -X POST http://[::1]:9090/__diagnostics/control \\
  -H 'Content-Type: application/json' -d '{"scenario":"stale"}'
Counts: curl -g --noproxy '*' http://[::1]:9090/__diagnostics/status

Scenario switch invalidates source caches once; subsequent reads respect TTL.
normal/recovery: down 8 Mbps, up 2 Mbps, CPU 25%, modem 65 C.
zero: valid zero speed/CPU. missing: missing download and LTE RSRP only.
stale: retained radio value with old source time, stale/error metadata.
handover: NR PCC PCI/cell changes. carrier-missing: NR SCC disappears.
thermal-unavailable: other sensors present, modem explicitly unsupported.
thermal-failure: thermal HTTP 503; dashboard remains available.
http-failure: dashboard HTTP 503, other APIs remain available.
Control accepts reset_counts:true, reset_sources:true, and repeat_sources:true
(to freeze successful source times for duplicate-sample checks).
Only IPv6 loopback is bound; the existing IPv4 mock is unaffected.
"""
import argparse
import copy
import socket
import threading
import time
from collections import Counter

import mock_agent as mock

SCENARIOS = {'normal', 'zero', 'missing', 'stale', 'handover', 'carrier-missing',
             'thermal-unavailable', 'thermal-failure', 'recovery', 'http-failure'}
TTLS = {'signal': 1000, 'speed': 3000, 'cpu': 3000, 'thermal': 10000,
        'modem': 10000, 'wan': 30000, 'wan6': 30000, 'data_usage': 30000}
LOCK = threading.RLock()
STATE = {'scenario': 'normal', 'repeat_sources': False}
COUNTS = Counter()
SOURCES = {}


def observe(name):
    now = time.monotonic()
    stamp, sampled = SOURCES.get(name, (0, 0))
    frozen = STATE['repeat_sources'] or (name == 'signal' and STATE['scenario'] == 'stale')
    if not stamp or (not frozen and (now - sampled) * 1000 >= TTLS[name]):
        stamp, sampled = int(time.time() * 1000), now
        SOURCES[name] = stamp, sampled
    age = int((now - sampled) * 1000)
    return {'sampled_at_ms': stamp, 'age_ms': age, 'ttl_ms': TTLS[name],
            'stale': age > TTLS[name], 'error': None}


def radio():
    data = mock.signal_raw()
    data.update(lte_rsrp='-71', nr5g_rsrp='-77')
    if STATE['scenario'] == 'missing':
        data.pop('lte_rsrp', None)
    if STATE['scenario'] == 'handover':
        data.update(nr5g_pci=802, nr5g_cell_id=268566612)
    if STATE['scenario'] == 'carrier-missing':
        data['nrca'] = ''
    return data


def dashboard():
    with LOCK:
        data = mock.dashboard_batch()
        data['speed'].update(rx_speed=1000000, tx_speed=250000)
        data['cpu'] = {'overall': 25, 'cores': [25, 25, 25, 25]}
        data['signal'] = radio()
        data['thermal'] = {'cpuss_temp': 61}
        data['sources'] = {name: observe(name) for name in TTLS if name != 'modem'}
        if STATE['scenario'] == 'zero':
            data['speed'].update(rx_speed=0, tx_speed=0)
            data['cpu'] = {'overall': 0, 'cores': [0, 0, 0, 0]}
        if STATE['scenario'] == 'missing':
            data['speed'].pop('rx_speed', None)
        if STATE['scenario'] == 'stale':
            src = data['sources']['signal']
            src.update(sampled_at_ms=src['sampled_at_ms'] - 60000,
                       age_ms=src['age_ms'] + 60000, stale=True,
                       error='fixture radio refresh failed')
        return data


def thermal():
    with LOCK:
        data = copy.deepcopy(BASE_THERMAL())
        data['source'] = observe('modem')
        if STATE['scenario'] == 'thermal-unavailable':
            data.pop('modem', None)
            data['modem_supported'] = False
        else:
            data['modem'] = 65
            data['modem_supported'] = True
        return data


BASE_THERMAL = mock.ROUTES_GET['/api/device/thermal/all']
mock.ROUTES_GET['/api/dashboard'] = dashboard
mock.ROUTES_GET['/api/device/thermal/all'] = thermal


class Handler(mock.Handler):
    def do_GET(self):
        path = self.path.split('?')[0]
        with LOCK:
            if path == '/__diagnostics/status':
                return self._send({'ok': True, 'data': {**STATE, 'counts': dict(COUNTS)}})
            COUNTS[path] += 1
            if path == '/api/device/thermal/all' and STATE['scenario'] == 'thermal-failure':
                return self._send({'ok': False, 'error': 'fixture thermal unavailable'}, 503)
            if path == '/api/dashboard' and STATE['scenario'] == 'http-failure':
                return self._send({'ok': False, 'error': 'fixture dashboard unavailable'}, 503)
        super().do_GET()

    def do_POST(self):
        if self.path.split('?')[0] != '/__diagnostics/control':
            return super().do_POST()
        body = self._body()
        if not isinstance(body, dict):
            return self._send({'ok': False, 'error': 'expected object'}, 400)
        with LOCK:
            scenario = body.get('scenario', STATE['scenario'])
            if scenario not in SCENARIOS:
                return self._send({'ok': False, 'error': 'unknown scenario',
                                   'scenarios': sorted(SCENARIOS)}, 400)
            if scenario != STATE['scenario'] or body.get('reset_sources'):
                SOURCES.clear()
            STATE['scenario'] = scenario
            if 'repeat_sources' in body:
                STATE['repeat_sources'] = bool(body['repeat_sources'])
            if body.get('reset_counts'):
                COUNTS.clear()
            return self._send({'ok': True, 'data': dict(STATE)})


class LoopbackServer(mock.ThreadingHTTPServer):
    address_family = socket.AF_INET6
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', type=int, default=9090)
    args = parser.parse_args()
    server = LoopbackServer(('::1', args.port), Handler)
    print(f'Diagnostics fixture http://[::1]:{args.port}; simulated data only', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
