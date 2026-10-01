#!/usr/bin/env python3
"""Assemble draft + assets into the final web app.

    draft/draft.json + draft/assets/**  ->  final/assets/
        master-audio.mp3, driving-data.json, image/, js/, audio/, frontend

Usage:
    python3 assemble_final.py [--format auto|wav|mp3]
"""

import argparse
import sys

import pipeline
from llm import LLMError


def main():
    parser = argparse.ArgumentParser(description='draft + assets -> final/assets/')
    parser.add_argument('--format', choices=['auto', 'wav', 'mp3'], default='auto',
                        help='master audio format (default: mp3 when ffmpeg exists)')
    args = parser.parse_args()

    try:
        pipeline.prepare_folders()
        pipeline.assemble(fmt=args.format)
    except (pipeline.PipelineError, LLMError) as e:
        sys.exit(str(e))


if __name__ == '__main__':
    main()
