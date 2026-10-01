#!/usr/bin/env python3
"""Generate or ingest the dynamic-section JavaScript the draft expects.

    draft.json script.spec  ->  draft/assets/js/<script.file>
    or chat reply (fenced JS) -> draft/assets/js/   via --ingest chat.md

Usage:
    python3 generate_js.py [--force] [--dry-run] [--ingest chat.md]
"""

import argparse
import os
import sys

import pipeline
from llm import LLMError


def main():
    parser = argparse.ArgumentParser(description='Missing section JS -> draft/assets/js/')
    parser.add_argument('--force', action='store_true', help='regenerate existing files')
    parser.add_argument('--dry-run', action='store_true',
                        help='show what would be generated, no API calls')
    parser.add_argument('--ingest', metavar='FILE',
                        help='pull fenced JS blocks from FILE (chat reply / '
                             'chat export) into draft/assets/js/')
    args = parser.parse_args()

    try:
        draft = pipeline.load_draft()
        if args.ingest:
            with open(args.ingest, encoding='utf-8') as f:
                text = f.read()
            result = pipeline.ingest_js(text, draft=draft)
            print(f'ingested: {", ".join(result["saved"]) or "(none)"}'
                  + (f', {result["unmatched"]} unmatched'
                     if result['unmatched'] else ''))
            if not result['saved']:
                sys.exit('no JS blocks could be matched to a dynamic section')
            return
        if args.dry_run:
            report = pipeline.check_assets(draft)
            for section in report['sections']:
                info = section['assets'].get('js')
                if info and not info['present']:
                    print(f'  would generate {info["file"]} for {section["id"]}')
            return
        pipeline.ensure_js(draft, force=args.force)
    except (pipeline.PipelineError, LLMError, OSError) as e:
        sys.exit(str(e))


if __name__ == '__main__':
    main()
