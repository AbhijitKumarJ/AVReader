#!/usr/bin/env python3
"""Generate the per-section narration audio the draft expects.

    draft.json audio.text  ->  draft/assets/audio/<audio.file>   (NN_<id>.wav)

Usage:
    python3 generate_audio.py [--force] [--dry-run] [--sections 1,3]
                              [--voice Kore] [--style "..."]
"""

import argparse
import sys

import pipeline
from llm import LLMError


def main():
    parser = argparse.ArgumentParser(description='Missing section audio -> draft/assets/audio/')
    parser.add_argument('--force', action='store_true', help='regenerate existing files')
    parser.add_argument('--dry-run', action='store_true',
                        help='show what would be synthesized, no API calls')
    parser.add_argument('--sections', default=None,
                        help='comma separated 1-based section numbers')
    parser.add_argument('--voice', default=None, help='override AUDIO_VOICE')
    parser.add_argument('--style', default=None, help='override AUDIO_STYLE')
    args = parser.parse_args()

    try:
        draft = pipeline.load_draft()
        if args.sections:
            wanted = {int(n.strip()) for n in args.sections.split(',') if n.strip()}
            draft = dict(draft)
            draft['sections'] = [s for i, s in enumerate(draft['sections'], start=1)
                                 if i in wanted]
        if args.dry_run:
            for index, section in enumerate(draft['sections'], start=1):
                path = pipeline.ASSET_DIRS['audio'] + '/' + section['audio']['file']
                import os
                if not os.path.isfile(path):
                    print(f'  {index:02d} {section["id"]}: would synthesize '
                          f'{section["audio"]["file"]} ({len(section["audio"]["text"])} chars)')
            return
        if args.voice or args.style:
            import os
            if args.voice:
                os.environ['AUDIO_VOICE'] = args.voice
            if args.style:
                os.environ['AUDIO_STYLE'] = args.style
        pipeline.ensure_audio(draft, force=args.force)
    except (pipeline.PipelineError, LLMError) as e:
        sys.exit(str(e))


if __name__ == '__main__':
    main()
