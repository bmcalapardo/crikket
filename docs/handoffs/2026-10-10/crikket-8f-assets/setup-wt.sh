#!/bin/sh
# Usage: setup-wt.sh <issue#> <branch> <parent-ref>
# Creates ../crikket-i<issue#> on a new branch from <parent-ref>, copies the
# gitignored .env files, and installs dependencies.
set -e
issue="$1"; branch="$2"; parent="$3"
root=/c/Users/Brandon/Documents/Work/Code
wt="$root/crikket-i$issue"
cd "$root/crikket"
git worktree add -q -b "$branch" "$wt" "$parent"
for f in apps/web/.env apps/server/.env apps/docs/.env; do
  [ -f "$root/crikket/$f" ] && cp "$root/crikket/$f" "$wt/$f"
done
cd "$wt"
bun install > /dev/null 2>&1
echo "ready $wt $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
