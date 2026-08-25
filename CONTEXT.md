# Crikket

Crikket is a browser-extension-based bug reporting tool. A tester captures visual/technical evidence of a bug (screenshots, video, debugger data) and submits it as a report for developers to reproduce and fix.

## Language

### Evidence pipeline

**Capture**:
The raw artifact produced by a capture action — a screenshot image or a video recording — before any editing, form data, or submission has been attached to it.
_Avoid_: Recording (use only for the video-specific case), asset, media

**Draft**:
A Capture plus its in-progress edits (crop, annotations, trim, markers) and in-progress form fields (title, description, expected/actual, priority, visibility), held locally and not yet sent to the backend. How much of a Draft survives closing the extension depends on the capture type.
_Avoid_: Report (only once submitted), unsaved capture

**Report**:
A Draft that has been successfully submitted to the backend, including its structured environment/version metadata. Once a Report exists, its source Draft is considered consumed.
_Avoid_: Capture, submission (submission is the act, Report is the resulting entity), bug (ambiguous — a Report describes a bug but isn't the bug itself)

**Annotation**:
A single visual element a tester adds on top of a Capture — a stroke, shape, arrow, text label, highlight, or obscured region — to explain the bug. Annotations belong to a Draft, not to a Capture: the Capture underneath is never altered.
_Avoid_: Drawing, markup, edit, overlay

**Marker**:
A moment within a video Capture that the tester flagged as when the bug occurred. Every Marker carries both its position in the video and the wall-clock instant it happened, so it can be scrubbed to during playback and correlated with console/network entries.
_Avoid_: Timestamp (a Marker has timestamps, it isn't one), bookmark, flag, annotation (Annotations are visual, Markers are temporal)

**Obscuring**:
An Annotation that destructively hides part of an image, such as a blur or pixelation over a sensitive region. Because it is baked into the submitted image, the hidden pixels never leave the tester's machine.
_Avoid_: Redaction (reserved for debugger data — see below), masking, censoring

### Privacy

**Redaction**:
The removal of sensitive values — auth headers, cookies, tokens, passwords — from captured debugger and network data before it is submitted. Operates on structured data by matching field names and value shapes, and is deliberately conservative rather than guaranteed complete.
_Avoid_: Obscuring (Obscuring is destructive image editing; Redaction is data filtering), sanitizing, scrubbing

### People

**Reporter**:
The authenticated account (`session.user.id`) a Report is attributed to on the backend. Every Report has exactly one Reporter, assigned server-side at submission time.
_Avoid_: Tester (see below — related but distinct)

**Tester**:
An optional, self-chosen local label a person sets in their own extension to distinguish themselves from others sharing the same Reporter account (e.g. one shared alpha-test login used by several people). Independent of authentication; purely descriptive metadata attached to Reports.
_Avoid_: Reporter (Reporter is the authenticated account; Tester is an unauthenticated human-readable label layered on top of it), user

### Distribution

**Channel**:
The audience tier a given extension build is released to — Alpha (internal QA), Beta (pilot users), or Stable (production). A build's Channel determines which backend it targets, and must always be specified explicitly.
_Avoid_: Environment, stage, track, tier
