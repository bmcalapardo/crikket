# WIP notes, issue #33 (feature/release-smoke-checks)

Done (staged, NOT committed): GET /health (apps/server/src/health.ts + test), web /server-health rewrite,
env vars, lib/manifest-contract.ts (wxt.config.ts uses it), scripts/verify-release.ts + tests,
workflow step "Verify release", Changelog line, .env.example.

The pre-commit hook ran (20:27-21:05) and failed only on test/pause-command.test.ts, which read
wxt.config.ts as text. Fixed after the hook (now reads lib/manifest-contract.ts); that fix is unstaged
and untested by the full hook.

Next: git add apps/extension/test/pause-command.test.ts, commit with the message in the task
(subject: feat(server): add GET /health and verify the extension release before it is published (#33)),
let the hook pass, push -u origin feature/release-smoke-checks. Do not commit bun.lock or WIP-NOTES.md.
