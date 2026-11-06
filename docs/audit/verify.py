#!/usr/bin/env python3
"""Check the audit contracts without a database, credentials, or network."""
import csv
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

def check():
    manifest = json.loads((HERE / 'manifest.json').read_text())
    assert set(manifest['services']) == {'api', 'web', 'worker', 'core', 'db', 'schemas'}
    for name in ('routes', 'models', 'permissions', 'audit_points', 'cross_calls', 'links', 'priorities', 'tree'):
        rows = list(csv.DictReader((HERE / f'{name}.csv').open()))
        for row in rows:
            file = row.get('file', '')
            if file:
                assert not any(part.startswith('.') or part in ('secrets', 'credentials', 'node_modules') for part in Path(file).parts), file
                assert (ROOT / file).is_file(), file
                assert 0 < int(row['line']) <= len((ROOT / file).read_text().splitlines()), row
    models = list(csv.DictReader((HERE / 'models.csv').open()))
    assert sum(r['pattern_id'] == 'taff_drizzle_table' for r in models) == 49
    jobs = [r for r in csv.DictReader((HERE / 'routes.csv').open()) if r['kind'] == 'job']
    assert {r['path'] for r in jobs} == {'taff', 'daily-digest', 'daily-digest-scan'}
    assert any(r['pattern_id'] == 'taff_trigger_registration' for r in csv.DictReader((HERE / 'audit_points.csv').open()))
    html = (HERE / 'index.html').read_text()
    assert 'noindex' in html and 'ADMIN ONLY' in html
    print('PASS: six explicit modules; source lines; exclusions; 49 Drizzle tables; three queue entries; SQL audit triggers; internal HTML')

if __name__ == '__main__':
    check()
