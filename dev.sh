#!/usr/bin/env bash
# Hot-reloading development: API on :5180 (dotnet watch) and Vite on :5173 (proxies /api).
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
[ -d frontend/node_modules ] || (cd frontend && npm install)
trap 'kill 0' EXIT
(cd backend && dotnet watch run --no-launch-profile --non-interactive) &
(cd frontend && npm run dev) &
wait
