#!/usr/bin/env python3
"""Report which assets the draft expects and which are missing.

    draft/draft.json  vs  draft/assets/{image,js,audio}

Usage:
    python3 check_assets.py [--json]
"""

import argparse
import json
import sys

import pipeline


def main():
    parser = argparse.ArgumentParser(description='Draft vs assets gap report')
    parser.add_argument('--json', action='store_true', help='machine readable')
    args = parser.parse_args()

    pipeline.prepare_folders()
    report = pipeline.check_assets()

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
        if not report['draft']['exists']:
            sys.exit(1)
        if pipeline.missing_count(report):
            sys.exit(2)
        return

    draft = report['draft']
    if not draft['exists']:
        print(f'{pipeline.DRAFT_FILE}: MISSING - run create_draft.py first')
        sys.exit(1)
    if not draft['valid']:
        print(f'{pipeline.DRAFT_FILE}: INVALID')
        for error in draft['errors']:
            print(f'  - {error}')
        sys.exit(1)

    print(f'draft.json: {draft["sections"]} sections - "{draft["title"]}"')
    for section in report['sections']:
        parts = []
        for kind, info in section['assets'].items():
            mark = 'ok' if info['present'] else 'MISSING'
            parts.append(f'{kind}:{mark}({info["file"]})')
        print(f'  {section["index"]:02d} {section["id"]:<32} '
              + '  '.join(parts))
    print('totals: ' + ', '.join(f'{k} {v}' for k, v in report['totals'].items()))
    missing = pipeline.missing_count(report)
    if missing:
        print(f'{missing} asset(s) missing - generate with generate_images.py / '
              f'generate_audio.py / generate_js.py')
        sys.exit(2)
    print('all assets present - ready for assemble_final.py')


if __name__ == '__main__':
    main()
