### v0.1.0
- [BC] app(create): Initial version of Crikket

### v0.1.1
- [BC] app(fix): Console logs not showing
- [BC] app(update): make bug reports default public
- [BC] app(update): allow middleware to set bug reports to public
- [BC] app(fix): bug reports to be default public
- [BC] app(update): let users join an existing organization or create one during sign up

### v0.1.2
- [BC] app(update): add visiblity field to report generation
- [BC] app(update): upgrade extension to default public and surface visibility
- [BC] app(update): removed always on content scripts
- [BC] app(update): adding grilling session + prd for upgrades
- [BC] app(update): stricter payload schemas
- [BC] app(update): add turbo test

### v0.1.3
- [BC] app(fix): keep debugger sessions under the chrome.storage quota
- [BC] feat(extension): add screenshot crop stage before submit
- [BC] ci: gate pull requests on typecheck, extension build, and tests
- [BC] app(update): add mark pocock skills to repo
- [BC] ci(extension): ship tester-ready extension builds from an extension-v* tag
- [BC] docs(repo): document changelog and versioning, and check the changelog in CI

### v0.2.0
- [BC] ci(release): merge features through prerelease/vX.Y.Z branches with changelog checks
- [BC] ci: run docker and package publish checks only when relevant, and typecheck only the extension on release
- [BC] app(fix): route extension RPC through the web app so sign-in authorizes it
- [BC] app(fix): harden redaction of secrets in captured debugger data
- [BC] feat(extension): annotate screenshots with pen, undo/redo and click-to-delete (#13)

### v0.3.0
- [BC] feat(extension): add a diagnostics page that reports named checks and exports a redacted bundle (#24)
