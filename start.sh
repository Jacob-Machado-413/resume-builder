#!/usr/bin/env bash
# Builds the React app into the API's wwwroot and serves everything from http://localhost:5180.
set -euo pipefail
cd "$(dirname "$0")"

# Outside a dev shell, re-run this script inside nix-shell, which provides dotnet, node and rendercv.
if ! command -v npm >/dev/null || ! command -v dotnet >/dev/null; then
  if command -v nix-shell >/dev/null && [ -z "${IN_NIX_SHELL:-}" ]; then
    exec nix-shell --run "$(printf '%q ' "./$(basename "$0")" "$@")"
  fi
  echo "error: npm and dotnet are required (or install Nix and run ./$(basename "$0") again)" >&2
  exit 1
fi
(cd frontend && { [ -d node_modules ] || npm install; } && npm run build)
cd backend && exec dotnet run -c Release --no-launch-profile
