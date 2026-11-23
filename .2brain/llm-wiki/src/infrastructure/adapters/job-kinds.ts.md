---
source: src/infrastructure/adapters/job-kinds.ts
source_sha256: b84094d66018acfdb830b4dc602f81eae2dc67084bc8d4c59d26cbd0a10ef308
context_sha256: bb3030c187fb016ad140600a3e5a87fbfce603e5fe10427ff7459c56cb96ca0c
generated_at: 2026-11-22T02:38:32.482979+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/job-kinds.ts

## Purpose
Declares what *kind* of work each job channel carries and which worker role processes which kind. It exists because a single process can't be sized for both cheap I/O-bound jobs and CPU/memory-heavy ones: the `standard` worker takes light and external jobs with many in flight, while the `heavy` worker takes heavy jobs one at a time under a memory cap, so a burst of uploads can't starve a mail.

## Key elements
- `JOB_KINDS`: `['light', 'external', 'heavy']`, ordered cheapest first.
- `JobKind`: the union type derived from `JOB_KINDS`.
  - `light`: a quick database or in-memory step. No channel uses it today.
  - `external`: waits on something outside the process, such as SMTP or a subscriber's endpoint.
  - `heavy`: CPU, memory or a large read, such as an image decode or a whole-account export.
- `JOB_KIND_BY_CHANNEL`: `Record<WorkerChannel, JobKind>` mapping each channel to its kind:
  - `EMAIL_SEND`, `EMAIL_URGENT` and `WEBHOOK_DELIVER` map to `external`.
  - `IMAGE_DIGEST` and `ACCOUNT_EXPORT` map to `heavy`.
- `KINDS_OF_ROLE` (module-private): maps `standard` to `light` and `external`, and `heavy` to `heavy`.
- `isServedBy(role, channel)`: returns true if a worker in `role` takes jobs from `channel`. A channel name with no declared kind is served by no role.

## Relationships
- `@types` (`src/types/index.ts`): supplies `WORKER_CHANNELS` and the generated `WorkerChannel` type used to key the mapping.
- `@infrastructure/runtime/config`: supplies the `WorkerRole` type (`standard` | `heavy`) used to key `KINDS_OF_ROLE`.
- `src/app/workers.ts` and `src/infrastructure/adapters/job-drain.ts`: graph neighbors, presumably the consumers that decide which channels a worker process takes. The file itself shows no code that calls them.
- `tests/unit/infrastructure/adapters/job-kinds.test.ts`: unit tests for this module.

## Notes
- The mapping is typed against `WorkerChannel`, so adding a channel is a compile error until it is given a kind.
- The mapping lives in code, not in the contract. The twin backends share channel names, and each decides its own sizing.
- `isServedBy` takes `channel` as a plain `string` and looks it up with `Object.entries(...).find` instead of indexing. This is so an unknown name returns `false` rather than being treated as a key.
