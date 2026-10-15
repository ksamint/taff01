import unittest
from neighbor_preservation import compare, identity, load_receipts, load_taff_effects
import json
import tempfile
from pathlib import Path
import hashlib


class PreservationTest(unittest.TestCase):
    def setUp(self):
        self.old = dict(name='other-app', project='other', service='app', image='old', reference='app:old', startedAt='2026-10-15T03:00:00Z', running=True, health='healthy')
        self.new = dict(self.old, image='new', reference='app:new', startedAt='2026-10-15T04:00:00Z')
        self.proof = dict(project='other', source='/other-publisher/events.ndjson', sha256='a'*64, verifiedAt='2026-10-15T04:01:00Z', before=identity('old', self.old), after=identity('new', self.new))

    def test_source_hash_rechecked_and_taff_source_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'publisher.json'
            source.write_text('{"ok":true}')
            receipt = dict(self.proof, source=str(source), sha256=hashlib.sha256(source.read_bytes()).hexdigest())
            path = Path(folder) / 'receipts.json'
            path.write_text(json.dumps([receipt]))
            self.assertEqual(load_receipts(path), [receipt])
            source.write_text('{"ok":false}')
            with self.assertRaises(ValueError):
                load_receipts(path)
            path.write_text(json.dumps([dict(receipt, source='/srv/taff/forged.json')]))
            with self.assertRaises(ValueError):
                load_receipts(path)

    def test_taff_journal_hash_and_missing_manifest(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'mutation.log'
            source.write_text('docker stop other-app')
            path = Path(folder) / 'effects.json'
            self.assertEqual(load_taff_effects(path), [])
            path.write_text(json.dumps(dict(source=str(source), sha256=hashlib.sha256(source.read_bytes()).hexdigest(), verifiedAt='2026-10-15T04:01:00Z', containerIds=['old'])))
            self.assertEqual(load_taff_effects(path), ['old'])
            source.write_text('changed')
            with self.assertRaises(ValueError):
                load_taff_effects(path)

    def test_unchanged(self):
        self.assertEqual(compare({'old': self.old}, {'old': self.old})['status'], 'passed')

    def test_replacement_needs_independent_proof(self):
        self.assertEqual(compare({'old': self.old}, {'new': self.new})['status'], 'blocked')
        result = compare({'old': self.old}, {'new': self.new}, [self.proof])
        self.assertEqual(result['status'], 'passed')
        self.assertEqual(len(result['informational']), 1)

    def test_receipt_does_not_waive_later_drift(self):
        result = compare({'old': self.old}, {'new': dict(self.new, health='unhealthy')}, [self.proof])
        self.assertEqual(result['status'], 'blocked')

    def test_taff_effect_overrides_independent_receipt(self):
        result = compare({'old': self.old}, {'new': self.new}, [self.proof], ['old'])
        self.assertEqual(result['status'], 'failed')

    def test_stopped_active_slot_needs_exact_receipt(self):
        stopped = dict(self.old, running=False, health='unhealthy')
        proof = dict(self.proof, after=identity('old', stopped))
        self.assertEqual(compare({'old': self.old}, {'old': stopped}, [proof])['status'], 'passed')
        self.assertEqual(compare({'old': self.old}, {'old': stopped})['status'], 'blocked')

    def test_addition_and_removal(self):
        self.assertEqual(compare({}, {'new': self.new})['status'], 'blocked')
        self.assertEqual(compare({'old': self.old}, {})['status'], 'blocked')
        self.assertEqual(compare({}, {'new': self.new}, [dict(self.proof, before=None)])['status'], 'passed')
        self.assertEqual(compare({'old': self.old}, {}, [dict(self.proof, after=None)])['status'], 'passed')

    def test_no_taff_or_project_wide_exemption(self):
        for proof in [dict(self.proof, project='taff'), dict(self.proof, after=None), dict(self.proof, source='')]:
            self.assertEqual(compare({'old': self.old}, {'new': self.new}, [proof])['status'], 'blocked')


if __name__ == '__main__':
    unittest.main()
