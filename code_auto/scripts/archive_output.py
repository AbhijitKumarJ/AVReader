#!/usr/bin/env python3
"""
Archive a finished blog and reset the workspace for the next one.

    code_auto/input/**  +  code_auto/draft/**  +  code_auto/final/**
        ->  code_auto/out/<n>/     (input files at the root, draft/, assets/)
    then input/, draft/ and final/ are cleared.

<n> is the next free number, starting at 1.  Set OUT_DIR in code_auto/.env to
archive somewhere else.

Usage:
    python3 archive_output.py [--out-dir PATH] [--no-clear] [--force]
"""

import argparse
import sys

import pipeline


def main():
    parser = argparse.ArgumentParser(description='Archive input + draft + final to out/<n>, then reset')
    parser.add_argument('--out-dir', default=None,
                        help='target folder (default: OUT_DIR or out/)')
    parser.add_argument('--no-clear', action='store_true',
                        help='copy only, keep input/ draft/ final/')
    parser.add_argument('--force', action='store_true',
                        help='archive even when driving-data.json is missing')
    args = parser.parse_args()

    try:
        pipeline.archive(out_dir=args.out_dir, clear=not args.no_clear,
                         force=args.force)
    except pipeline.PipelineError as e:
        sys.exit(str(e))


if __name__ == '__main__':
    main()
