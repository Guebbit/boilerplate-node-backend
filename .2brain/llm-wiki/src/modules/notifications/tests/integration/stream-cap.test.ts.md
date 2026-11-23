---
source: src/modules/notifications/tests/integration/stream-cap.test.ts
source_sha256: bf211b1d63fce348f409f79dbef14d61f3084c455a6a270d2b093cdd551a0579
context_sha256: f368e8100227f0323cfd8ed724de1dd736887c77d408d22aa19b6659d039f0e2
generated_at: 2026-11-22T05:58:03.224236+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/integration/stream-cap.test.ts

## Purpose
Integration test for the cap on held live notification streams (`GET /notifications/stream`). It runs against the real route on a real socket and checks that an account past its share is refused with a 429 and a wait, and that a closed stream frees its slot. The module doc says the request limiter counts opens but never holds, so this cap is the only thing that stops one account from holding streams open.

## Key elements
- `held`: the open response streams of the current test. `afterEach` destroys them and waits until `openStreamCount()` is 0, so the module-level count starts empty for the next test.
- `listening`: the app on a real socket, from `listen()` in `beforeAll`. `afterAll` closes all connections and the server.
- `sessionCookie(username)`: creates a `customer` user, logs in through `POST /account/login`, and returns the `__Host-session=...` cookie. A session cookie is the only credential an `EventSource` can carry.
- `Opened`: the status and headers of an open attempt.
- `openStream(cookie)`: opens the stream with `http.get` and resolves once the headers arrive. It pushes the raw response onto `held` and never reads the body.
- Tests:
  - Past `NODE_SSE_MAX_STREAMS_PER_USER=2`, the third open gets 429 with `retry-after` >= 1. Destroying one stream and waiting for the count to drop to 1 lets a new open succeed with 200.
  - With a limit of 1 per user, a second account can still open a stream, so one account is not charged for another's streams.
  - With `NODE_SSE_MAX_STREAMS=1`, a second account's open gets 503 with `retry-after` >= 1.

## Relationships
- `src/modules/notifications/services/stream.ts`: the file under test. The test imports `openStreamCount` to see how many streams the process holds and uses it as the wait condition. The caps are exercised through the HTTP route rather than by calling the service directly.
- `src/modules/users/tests/factories.ts`: supplies `createUser` and `PLAIN_PASSWORD` for seeding accounts and logging in.
- `tests/support/setup-test-db.ts`: `setupTestDb()` prepares the test database.
- `tests/support/http.ts`: `api()` makes the login request and `listen()` starts the real server.
- `tests/support/cookies.ts`: `setCookie` reads the session cookie from the login response.
- `tests/support/environment.ts`: `setEnvironment` sets `NODE_SSE_MAX_STREAMS_PER_USER` and `NODE_SSE_MAX_STREAMS` per test.
- `tests/support/eventually.ts`: `eventually` polls until the stream count reaches the expected value.

## Notes
- Slot release is asynchronous after `destroy()`, so assertions on the count must go through `eventually`.
- A per-account refusal is 429 and a process-wide refusal is 503. Both carry a `retry-after` header.
- Each test uses distinct usernames so accounts do not collide.
