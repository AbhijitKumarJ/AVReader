#!/usr/bin/env python3
"""Minimal .env loader (no dependencies).

Loads KEY=VALUE lines from code/.env and the repository root .env, without
overriding variables that are already set in the environment.
"""

import os


def _parse(path):
    values = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if line.startswith('export '):
                line = line[7:].strip()
            if '=' not in line:
                continue
            key, _, value = line.partition('=')
            key = key.strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in '\'"':
                value = value[1:-1]
            values[key] = value
    return values


def load_env():
    """Load .env files into os.environ, return the values that came from them."""
    here = os.path.dirname(os.path.abspath(__file__))
    code_dir = os.path.dirname(here)
    loaded = {}
    for path in (os.path.join(code_dir, '.env'),             # code/.env   (wins)
                 os.path.join(code_dir, os.pardir, '.env'),  # repo .env
                 os.path.join(here, '.env')):
        path = os.path.normpath(path)
        if not os.path.isfile(path):
            continue
        for key, value in _parse(path).items():
            if value == '':
                continue
            if key not in loaded:
                loaded[key] = value
            os.environ.setdefault(key, value)
    return loaded


if __name__ == '__main__':
    values = load_env()
    for key, value in sorted(values.items()):
        if 'KEY' in key.upper() and value:
            value = f'{value[:4]}...({len(value)} chars)'
        print(f'{key}={value}')
    if not values:
        print('(no .env values found)')
