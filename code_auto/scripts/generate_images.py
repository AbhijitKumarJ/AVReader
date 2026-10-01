#!/usr/bin/env python3
"""Generate the static-section images the draft expects.

    draft.json visual.prompt  ->  draft/assets/image/<visual.file>

Usage:
    python3 generate_images.py [--force] [--dry-run] [--sections 1,3]
"""

import argparse
import sys

import pipeline
from llm import LLMError


def main():
    parser = argparse.ArgumentParser(description='Missing section images -> draft/assets/image/')
    parser.add_argument('--force', action='store_true', help='regenerate existing images')
    parser.add_argument('--dry-run', action='store_true',
                        help='show what would be generated, no API calls')
    parser.add_argument('--sections', default=None,
                        help='comma separated 1-based section numbers')
    args = parser.parse_args()

    try:
        draft = pipeline.load_draft()
        if args.sections:
            wanted = {int(n.strip()) for n in args.sections.split(',') if n.strip()}
            draft = dict(draft)
            draft['sections'] = [s for i, s in enumerate(draft['sections'], start=1)
                                 if i in wanted]
        if args.dry_run:
            report = pipeline.check_assets(pipeline.load_draft())
            for section in report['sections']:
                info = section['assets'].get('image')
                if info and not info['present']:
                    print(f'  would generate {info["file"]} for {section["id"]}')
            return
        pipeline.ensure_images(draft, force=args.force)
    except (pipeline.PipelineError, LLMError) as e:
        sys.exit(str(e))


if __name__ == '__main__':
    main()
