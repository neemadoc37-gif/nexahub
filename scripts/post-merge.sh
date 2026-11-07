#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
test -s index.html
test -s server.py
python3 -m py_compile server.py
printf 'NexaHub post-merge checks passed.\n'
