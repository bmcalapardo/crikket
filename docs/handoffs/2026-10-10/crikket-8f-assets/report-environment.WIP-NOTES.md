# WIP notes, hardening #25 (uncommitted; staged: my files only)

Done: server schema hardening (control-char strip, server-side redactUrl/redactText), extension clamping + UA
Client Hints + bounded UA parse + collect never throws, web describeEnvironment module + sidebar wiring +
inferred type, tests (bug-reports, extension, web). Focused tests and tsc pass.

Next: `git commit --amend -F i25-msg.txt` (message prepared, Hardening paragraph added; the amend was denied
by the auto-mode classifier, so the user must run or approve it), check `git log -1 --format=%s` is still the
#25 subject, `git rev-list --count fd2896d..HEAD` = 1, then `git push --force-with-lease origin feature/report-environment`.
Do not commit i25-msg.txt or this file. Run full `bun run build` + `bun run test` (the hook does).
