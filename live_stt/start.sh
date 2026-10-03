#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec uv run --locked --no-dev run.py start
