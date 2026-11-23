---
source: shared/cases/outbox-backoff.cases.yaml
source_sha256: a3309ec76ddde7f812c3907979db928753b80cf11b1adefd38a402060a884b40
context_sha256: c8d97dc83577c3ea691cf09e3a01765aa63b2e1731719642b52357aed9425a8d
generated_at: 2026-11-22T02:21:54.434363+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/cases/outbox-backoff.cases.yaml

## Purpose
A shared, data-only table of test cases for the outbox retry backoff. Each case gives the number of failed dispatch attempts and the delay in milliseconds to wait before the next try. The delay starts at 5 s, doubles with each failure, and is capped at 1 h. The file is language-neutral, so any implementation of the backoff can be checked against the same expectations.

## Key elements
- `cases` is the top-level list. Each entry has three fields:
  - `name`: a human-readable description.
  - `failedAttempts`: the 1-based count of failures so far.
  - `delayMs`: the expected wait in milliseconds.
- Covered scenarios:
  - Attempts 1, 2 and 3 give 5000, 10000 and 20000 ms.
  - Attempt 10 gives 2,560,000 ms, which is still under the cap.
  - Attempt 11 would be 5,120,000 ms and is clamped to 3,600,000 ms (one hour).
  - Attempt 100 stays at the cap.
  - Attempt 2000 also returns the cap. The case name says this is an exponent large enough to overflow a float.

## Relationships
`shared/contracts/asyncapi.workers.yaml` is the only graph neighbor. This file doesn't reference it, and nothing in this file's content shows how the two connect. They are probably related through the worker/outbox dispatch domain, but that is not stated here.

## Notes
- The formula implied by the header comment is `5000 * 2^(failedAttempts - 1)`, clamped to 3,600,000.
- `failedAttempts` is 1-based, so 0 is not covered.
- There is no jitter, so the delays are deterministic and can be compared exactly.
- An implementation must not let large exponents overflow or produce infinity or NaN. The 2000-attempt case exists to check this.
