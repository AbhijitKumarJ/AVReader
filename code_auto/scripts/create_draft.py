#!/usr/bin/env python3
"""Create draft/draft.json from input/blog.txt (or a text argument).

    input/blog.txt  ->  draft/draft.json     (structure only - no assets)

Usage:
    python3 create_draft.py [blog.txt|--text "..."]
"""

import argparse
import sys

import pipeline
from llm import LLMError


def main():
    parser = argparse.ArgumentParser(description='Blog -> draft/draft.json')
    parser.add_argument('path', nargs='?', default=None,
                        help='blog file (default: input/blog.txt)')
    parser.add_argument('--text', default=None, help='inline blog text')
    parser.add_argument('--model', default=None,
                        help='override the text model (default: LLM_MODEL)')
    args = parser.parse_args()

    text = args.text
    if text is None and args.path:
        with open(args.path, encoding='utf-8') as f:
            text = f.read()

    try:
        pipeline.prepare_folders()
        source = args.path or ('inline' if args.text else None)
        pipeline.create_draft(text=text, source=source, model=args.model)
    except (pipeline.PipelineError, LLMError) as e:
        sys.exit(str(e))


if __name__ == '__main__':
    main()
