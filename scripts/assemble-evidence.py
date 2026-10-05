#!/usr/bin/env python3
"""Bind AI-selected roles and claims to exact renderer spans; never approves quality."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import sys


def require(value, message):
    if not value:
        raise ValueError(message)


def snapshot(path, limit):
    require(path.is_absolute(), 'all paths must be absolute')
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_size <= limit,
            'input must be a bounded regular file: ' + str(path))
    raw = path.read_bytes()
    after = path.lstat()
    require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
            (after.st_dev, after.st_ino, len(raw), after.st_mtime_ns),
            'input changed during read: ' + str(path))
    return raw


def assemble(build, bindings_path, output):
    require(build.is_absolute() and build.is_dir() and not build.is_symlink(),
            '--build-dir must be an absolute directory, not a symlink')
    require(output.is_absolute() and output.parent.is_dir() and not os.path.lexists(output),
            '--out must be a new absolute file with an existing parent')
    inputs = {}

    def read(path, limit):
        raw = snapshot(path, limit)
        inputs[path] = raw
        return raw

    inventory = json.loads(read(build / 'anchors.json', 8 * 1024 * 1024))
    bindings = json.loads(read(bindings_path, 256 * 1024))
    require(isinstance(bindings, dict) and set(bindings) == {'chapters', 'calculations', 'policyClaims'},
            'bindings requires chapters, calculations and policyClaims; no manually copied spans or hashes')
    require(inventory.get('schemaVersion') == 1 and inventory.get('body') == {'htmlId': 'report-body'},
            'unsupported renderer inventory')
    hashes = {}
    for role, limit in [('md', 2), ('html', 2), ('pdf', 20)]:
        hashes[role] = hashlib.sha256(read(build / ('report.' + role), limit * 1024 * 1024)).hexdigest()
    require(inventory.get('reportSha256') == hashes, 'renderer inventory is stale; rebuild before binding')
    anchors = {}
    for item in inventory['anchors']:
        span = item['span']
        require(isinstance(span, dict) and set(span) == {'htmlId', 'markdown'}, 'invalid inventory span')
        require(span['htmlId'] not in anchors, 'duplicate inventory anchor: ' + span['htmlId'])
        anchors[span['htmlId']] = span
    chapters = {c['htmlId']: c for c in inventory['chapters']}
    require(len(chapters) == len(inventory['chapters']), 'duplicate inventory chapter')

    def expand(value, location, depth=0):
        require(depth <= 32, 'binding nesting limit: ' + location)
        if isinstance(value, dict):
            if '$anchor' in value:
                require(set(value) == {'$anchor'} and isinstance(value['$anchor'], str),
                        'anchor reference must contain only $anchor: ' + location)
                require(value['$anchor'] in anchors, 'unknown anchor at ' + location + ': ' + value['$anchor'])
                return anchors[value['$anchor']]
            require('htmlId' not in value and 'markdown' not in value,
                    'use {$anchor: id}, not manually copied spans: ' + location)
            return {key: expand(v, location + '.' + key, depth + 1) for key, v in value.items()}
        if isinstance(value, list):
            return [expand(v, location + '[' + str(i) + ']', depth + 1) for i, v in enumerate(value)]
        return value

    require(isinstance(bindings['chapters'], list) and 0 < len(bindings['chapters']) <= 100,
            'select the report analysis chapters explicitly')
    selected, seen = [], set()
    for i, chapter in enumerate(bindings['chapters']):
        require(isinstance(chapter, dict) and set(chapter) == {'htmlId', 'parts'},
                'chapter requires htmlId and selected parts')
        identifier = chapter['htmlId']
        require(isinstance(identifier, str) and identifier in chapters and identifier not in seen,
                'unknown or repeated chapter: ' + str(identifier))
        seen.add(identifier)
        selected.append({**chapters[identifier], 'parts': expand(chapter['parts'], 'chapters[' + str(i) + '].parts')})
    for key in ['calculations', 'policyClaims']:
        require(isinstance(bindings[key], list), key + ' must be an explicitly supplied array')
    evidence = {'schemaVersion': 2, 'reportSha256': hashes, 'body': inventory['body'],
                'chapters': selected, 'calculations': expand(bindings['calculations'], 'calculations'),
                'policyClaims': expand(bindings['policyClaims'], 'policyClaims')}
    raw = (json.dumps(evidence, ensure_ascii=False, indent=2) + '\n').encode()
    require(len(raw) <= 256 * 1024, 'assembled evidence exceeds checker size limit')
    for path, previous in inputs.items():
        require(snapshot(path, len(previous)) == previous, 'input changed before write: ' + str(path))
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
    return {'status': 'BOUND_DRAFT', 'qualityApproved': False, 'hostReceipt': False,
            'reportSha256': hashes, 'evidenceSha256': hashlib.sha256(raw).hexdigest(),
            'output': str(output), 'notice': 'Only exact span assembly. Run preflight and independent review; semantic selection and calculations remain the author responsibility.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-dir', required=True, type=Path)
    parser.add_argument('--bindings', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(assemble(args.build_dir, args.bindings, args.out), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'status': 'ERROR', 'error': str(error), 'qualityApproved': False}, ensure_ascii=False))
        sys.exit(2)
