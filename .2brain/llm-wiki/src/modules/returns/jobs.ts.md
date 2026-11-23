---
source: src/modules/returns/jobs.ts
source_sha256: 667504586191f7a1dd1906372d9aeecf882aa01817e16a366cd87223f8d91d3d
context_sha256: 5748452f65f752d834581aae3705987a221292178a66e543e5b7b312d27cdd76
generated_at: 2026-11-22T07:25:27.228714+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/jobs.ts

## Purpose
Declares the scheduled jobs owned by the `returns` module. Currently it contains a single job: the free-text scrub, which removes or scrubs free-text data on returns. It exists so the module can hand its job declarations to the kernel's job registry.

## Key elements
- `returnsJobs` (exported, `readonly JobDeclaration[]`): the list of jobs `returns` owns. It has one entry, which spreads `returnsJobData.reapReturns` (generated job metadata) and sets `run` to call `scrubReturnText()`.

## Relationships
- `src/kernel/registry.ts`: provides the `JobDeclaration` type (type-only import) that each entry conforms to.
- `src/modules/returns/services/retention.ts`: provides `scrubReturnText`, which the job's `run` callback invokes.
- `src/modules/returns/module.ts`: a graph neighbor of this file. The file itself does not show how the two interact, but `returnsJobs` is presumably consumed there.

## Notes
- The job's data key is `reapReturns`, but the job runs `scrubReturnText`. The scheduling and metadata come from generated data, so edit the source of the generated job data rather than this file to change them.
- `run` takes no arguments and returns whatever `scrubReturnText()` returns.
- Scheduling details are referenced by the module comment under the "scheduled jobs" section of the ops reference docs.
