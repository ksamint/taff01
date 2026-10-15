"""Compare sanitized Docker snapshots with independently verified rollout receipts.

The caller collects receipts from the other project's publisher (not from Docker
labels alone), verifies their hashes and exact effects, and retains the originals
privately. No container environment is needed. Unknown drift blocks acceptance.
"""
import json
import sys

FIELDS = ('name', 'project', 'service', 'image', 'reference', 'created', 'startedAt', 'finishedAt', 'running', 'health')


def identity(container_id, row):
    return dict(id=container_id, **{key: row.get(key) for key in FIELDS})


def compare(before, current, receipts=(), taff_effects=()):
    """Return attributable failures separately from unknown drift and rollouts.

    Receipts bind exact before/after snapshots; never waive a whole project or a
    time interval. taff_effects are container IDs from the publisher mutation
    journal. Missing attribution remains blocking, without claiming Taff caused it.
    """
    result = {'unchanged': 0, 'informational': [], 'taffCaused': [], 'unexplained': []}
    matched = set()
    for old_id, old in before.items():
        new = current.get(old_id)
        if new is None:
            replacements = [(i, r) for i, r in current.items() if r['name'] == old['name']]
            new_id, new = replacements[0] if len(replacements) == 1 else (None, None)
        else:
            new_id = old_id
        if new_id is not None:
            matched.add(new_id)
        previous = identity(old_id, old)
        actual = identity(new_id, new) if new is not None else None
        if actual == previous:
            result['unchanged'] += 1
            continue
        change = {'name': old['name'], 'before': previous, 'after': actual}
        if old_id in taff_effects or new_id in taff_effects:
            result['taffCaused'].append(change)
            continue
        proof = next((r for r in receipts if r.get('project') == old.get('project')
                      and r.get('project') not in (None, 'taff')
                      and r.get('source') and r.get('verifiedAt')
                      and len(r.get('sha256', '')) == 64
                      and r.get('before') == previous and r.get('after') == actual), None)
        if proof:
            result['informational'].append(dict(change, evidence=proof))
        else:
            result['unexplained'].append(change)
    # Include additions, including unexpected project renames. They also require
    # an exact independent receipt; labels are not evidence of the initiator.
    for new_id, new in current.items():
        if new_id in matched or new_id in before:
            continue
        actual = identity(new_id, new)
        change = {'name': new['name'], 'before': None, 'after': actual}
        proof = next((r for r in receipts if r.get('project') == new.get('project')
                      and r.get('project') not in (None, 'taff') and r.get('source')
                      and r.get('verifiedAt') and len(r.get('sha256', '')) == 64
                      and r.get('before') is None and r.get('after') == actual), None)
        if new_id in taff_effects:
            result['taffCaused'].append(change)
        elif proof:
            result['informational'].append(dict(change, evidence=proof))
        else:
            result['unexplained'].append(change)
    result['status'] = 'failed' if result['taffCaused'] else ('blocked' if result['unexplained'] else 'passed')
    return result




def load_receipts(path):
    """Load operator-verified exact effects and recheck original publisher bytes."""
    import hashlib
    from pathlib import Path
    if not Path(path).exists():
        return []
    receipts = json.loads(Path(path).read_text())
    for receipt in receipts:
        source = Path(receipt['source'])
        if not source.is_absolute() or str(source).startswith('/srv/taff/'):
            raise ValueError('independent publisher source required')
        if hashlib.sha256(source.read_bytes()).hexdigest() != receipt['sha256']:
            raise ValueError('independent publisher receipt changed')
    return receipts


def load_taff_effects(path):
    """Read confirmed Taff effects, corroborated by a private mutation journal.

    Simultaneous Docker changes alone are insufficient attribution. The operator
    confirms the explicit command targets from the publisher log before writing
    this file; unexplained changes block until that investigation is complete.
    """
    import hashlib
    from pathlib import Path
    if not Path(path).exists():
        return []
    receipt = json.loads(Path(path).read_text())
    if hashlib.sha256(Path(receipt['source']).read_bytes()).hexdigest() != receipt['sha256']:
        raise ValueError('Taff mutation journal changed')
    if not receipt['verifiedAt'] or not receipt['containerIds']:
        raise ValueError('confirmed Taff effects required')
    return receipt['containerIds']


if __name__ == '__main__':
    with open(sys.argv[1]) as source:
        inputs = json.load(source)
    # CLI accepts receipt paths so an unverified JSON array cannot bypass hashes.
    report = compare(inputs['before'], inputs['current'],
                     load_receipts(inputs['independentReceipts']),
                     load_taff_effects(inputs['taffEffects']))
    print(json.dumps(report, indent=2))
    sys.exit(0 if report['status'] == 'passed' else 1)
