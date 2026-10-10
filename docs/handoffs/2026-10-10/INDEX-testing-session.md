# Crikket handoffs: testing session (2026-10-10)

This is the index of every branch the "testing" session touched. The other session (crikket-8f) keeps its own INDEX-crikket-8f.md in this folder.
Repo: C:/Users/Brandon/Documents/Work/Code/crikket (GitHub bmcalapardo/crikket). Version plan: 0.2.0 is the current prerelease, 0.3.0 is the next minor, and 1.0.0 is reserved for the GCP migration (#40).

## Branches

| Branch | SHA | On origin | State | Doc |
|---|---|---|---|---|
| feature/prerelease-branches (#51) | 8ac60b8 | yes (PR head) | Ready, merge FIRST. Fold r2/cifix f795b42 in | [doc](feature__prerelease-branches.md) |
| feature/trim-pr-checks (#47) | dbe3560 | yes (PR head) | Ready, no round-2 items | [doc](feature__trim-pr-checks.md) |
| feature/fix-extension-session-origin (#48) | 0f251d1 | yes (PR head) | Ready. Conflicts with #52 on one import line | [doc](feature__fix-extension-session-origin.md) |
| feature/harden-redaction (#50) | 6e870c3 | yes (PR head) | **BLOCKED**: server redaction-pass CPU DoS (I4). Fold r2/redact in | [doc](feature__harden-redaction.md) |
| feature/annotation-editor (#52) | cbfad73 | yes (PR head) | Ready. Fold 2 r2/ext commits in | [doc](feature__annotation-editor.md) |
| v030-base | 0fab60c | no (local) | Canonical 0.3.0 base, temporary until prerelease/v0.3.0 exists | [doc](v030-base.md) |
| feature/diagnostics-page (#24) | 5e0e058 | no (local) | Done, 1 commit on v030-base | [doc](feature__diagnostics-page.md) |
| feature/pause-resume-recording (#20) | fc23ce3 | no (local) | Done. Fold r2/ext a1bcd68, 461e704 and r2/ingest c39277b in | [doc](feature__pause-resume-recording.md) |
| feature/qa-fixtures (#34) | 323bd5f | no (local) | Done. Apply qa-fixtures-hardening.patch | [doc](feature__qa-fixtures.md) |
| feature/extension-rpc-errors | 9ff9c73 | no (local) | Done. Fold r2/webserver 4b5eeba in | [doc](feature__extension-rpc-errors.md) |
| feature/deflake-crop-step-test | 5ade9eb | no (local) | Done. Commit message needs fixing | [doc](feature__deflake-crop-step-test.md) |
| feature/ci-path-filters | 11d28e2 | no (local) | Done | [doc](feature__ci-path-filters.md) |
| r2/ext | 461e704 | no (local) | Round-2 fixes, 6 commits to route | [doc](r2__ext.md) |
| r2/ingest | c39277b | no (local) | Round-2 fixes, 4 commits to route | [doc](r2__ingest.md) |
| r2/webserver | bbc0594 | no (local) | Round-2 fixes, 3 commits to route. W2 needs a user decision | [doc](r2__webserver.md) |
| r2/cifix | f795b42 | no (local) | Round-2, 1 commit, plus the qa-fixtures patch and the settings list | [doc](r2__cifix.md) |
| r2/redact | 627ae08 | no (local) | Round-2, 2 commits for #50 | [doc](r2__redact.md) |

Not documented and not to be pushed:
- **v030-base2 (0fab60c):** identical to v030-base.
- **r2-int (7c22896):** a throwaway integration used for round-2 testing. It is FLAWED: feature/qa-fixtures was never merged into it (see the caveats below).
- **Local refs of the five 0.2.0 PR branches:** STALE (for example, local feature/harden-redaction is a608846). Origin is the source of truth. Never push those local refs. Work from `origin/<branch>`, or detached worktrees at the PR head.

## Merge plan
1. Merge the 0.2.0 PRs into prerelease/v0.2.0 in this order:
   - #51 first: it adds the CI triggers for `prerelease/**`, so the other PRs then get full CI;
   - then #47, #48, #52;
   - #50 last, and only after I4 is fixed.
   #48 and #52 conflict only on adjacent imports in apps/extension/entrypoints/recorder/App.tsx; keep both. Changelog lines merge cleanly.
2. Create prerelease/v0.3.0 from the merged prerelease/v0.2.0 tip, with a "chore(release): open v0.3.0" commit (`### v0.3.0` heading + apps/extension/package.json 0.3.0).
3. `git rebase --onto prerelease/v0.3.0 v030-base <branch>` for each 0.3.0 branch, then open PRs.
4. Tell crikket-8f the new SHAs; it rebuilds v030-int and its stacks.

## Routing round-2 fixes
Each r2 commit body starts with `Owner: <branch>`. Cherry-pick each commit onto its owner, then squash it into that branch's single commit (one commit per branch rule). For pushed 0.2.0 PRs, force-push with `--force-with-lease=<branch>:<old sha>` and add a line to the PR body's testing section. `new-hardening` commits go to a NEW 0.3.0 branch (suggested name: feature/security-hardening, or split it into rpc-csrf / ingestion-limits / extension-leaks), with one Changelog line under `### v0.3.0`.

## Integration caveats
- **r2-int is missing feature/qa-fixtures.** The merge loop printed "clean" when git refused the merge, most likely because of EOL noise on bun.lock. When rebuilding any integration, run `git merge-base --is-ancestor <branch> HEAD` after EVERY merge.
- **EOL noise.** The Windows pre-commit hook (`.husky/pre-commit`: full turbo build + test + `ultracite fix`) leaves about 500 EOL-only "modified" files. `git diff --ignore-cr-at-eol --name-only` shows they are empty. Clear them with `git add -u`, ONLY in your own worktree, and only after checking that `git diff --cached --stat` is empty afterwards.
- **.env files.** New worktrees need the gitignored apps/web/.env, apps/server/.env, apps/docs/.env and apps/extension/.env (copy .env.example for the extension). Copy them from an existing worktree and never print them. Without them `web#build` and the extension tests fail in the hook.
- **Stale installs.** After merging #50, run `bun install` in any existing worktree, because bug-reports gains a capture-core dependency. Without it the server build fails with "Could not resolve @crikket/capture-core/debugger/redaction", which is a local artefact only.
- **Coordination with crikket-8f.** It owns v030-int (fd2896d) and the crikket-i* worktrees. It does not touch v030-base, the 0.2.0 PR branches, the six 0.3.0 branches or r2/*. Send it old→new SHAs whenever you amend or rebase.
- **Ports.** 4700-4799 are ours; 4800-4899 are crikket-8f's.
- **Killing processes.** Kill by PID only, never by image name. An earlier `taskkill /IM bun.exe` hit the other session.

## Shared references in this folder
- testing-playbook.md: the negative, attack and stress testing playbook with sources. It was written against an old checkout, so re-verify every claim.
- round2-rules.md: the rules the round-2 testers followed.
- qa-fixtures-hardening.patch and qa-fixtures-modified/: the round-2 fixtures hardening, not yet committed.

## Open user decisions (also in the docs)
- **W2 (HIGH, pre-existing on master):** `auth.assignOrganization` is a publicProcedure, so any signed-in user can join any organization. Choose invite-only, a verified-domain check, or removal.
- **GitHub settings** only the user can set: listed in [r2__cifix.md](r2__cifix.md).

## Update: everything pushed (2026-10-10, end of session; the user is leaving this PC)
- **On origin, matching the local SHAs:** v030-base 0fab60c; feature/diagnostics-page 5e0e058, feature/pause-resume-recording fc23ce3, feature/qa-fixtures 323bd5f, feature/extension-rpc-errors 9ff9c73, feature/deflake-crop-step-test 5ade9eb, feature/ci-path-filters 11d28e2; r2/ext 461e704, r2/ingest c39277b, r2/webserver bbc0594, r2/cifix f795b42, r2/redact 627ae08.
- **New `wip/qa-fixtures-hardening` 1da3ab0** (on feature/qa-fixtures). This is the qa-fixtures-hardening.patch from r2/cifix as a real commit: 30 qa-fixtures tests and the full pre-commit hook passed. Squash it into feature/qa-fixtures when that branch is next rebased.
- **New `wip/stash-2026-07-01-fix-console-logs`.** This preserves an old local stash ("On feature/fix-console-logs: pre-commit-stash", dated 2026-07-01). It touches console.ts and releases/v0.1.1.md and deletes openspec files, and is probably obsolete. It is a stash commit (a merge of the index and worktree states), so inspect it with `git show <ref>` and `git diff <ref>^1 <ref>`.
- **The 0.2.0 PR heads are unchanged on origin** (8ac60b8, dbe3560, 0f251d1, 6e870c3, cbfad73). The local refs of those names on the old PC were stale and were deliberately not pushed.
- **Not pushed, all reconstructable:**
  - v030-base2, identical to v030-base;
  - r2-int 7c22896, an ancestor of every r2/* branch (flawed: it is missing qa-fixtures);
  - the local prerelease/v0.1.4 and worktree-agent-* refs, which are stale or empty.
- **These handoff docs** are committed on branch `handoffs/2026-10-10` under docs/handoffs/2026-10-10/.
- **This PC's Claude memory notes are not portable.** Their content is covered by these docs.
