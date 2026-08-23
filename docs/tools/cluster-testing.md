# Cluster testing

`npm run test:cluster` — the only suite that boots `src/cluster.ts` and forks real worker
processes. Two clusters, about 25 seconds, and it needs a Redis.

## What it is for, and why nothing else could do it

Every other suite runs the app in **one process**: supertest against a mounted express app, which
is faster and right for almost everything — including
[the in-process race suite](./concurrency-testing.md), whose contention happens inside Mongo and
does not care whether the two callers share an event loop.

One process cannot observe the class of bug this directory exists for: **state that is correct
within a worker and absent across the cluster.** A per-process counter is indistinguishable from a
shared one when there is only one process. Production forks a worker per CPU, so every such bug is
real there and unreachable from the rest of the suite.

The first target is the rate limiter, because it is the one where the gap is a security control:
with per-process counters a budget of 100/minute is really `100 × workers`/minute, and nothing in
the configuration says so.

## The shape of the assertion

Two cases, and the second is what makes the first mean anything:

| Case                                  | Store     | Expected                          |
| ------------------------------------- | --------- | --------------------------------- |
| spends one budget across every worker | Redis     | exactly `LIMIT` allowed           |
| gives each worker its own budget      | in-memory | exactly `LIMIT × WORKERS` allowed |

A single case asserting "the budget is spent once" passes just as well when the harness is broken —
if only one worker ever serves, a per-process counter also spends exactly one budget. The
memory-store case is the control: asserting the allowance **doubles** can only pass if two separate
processes are really each counting.

## Three settings that decide whether it measures anything

Each of these made the suite pass for the wrong reason at some point while it was being written.

| Setting                              | Why                                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENABLE_CLUSTERING=1`           | Clustering is **off** by default. `NODE_CLUSTER_WORKERS` alone does nothing — `src/cluster.ts` gates the fork on this flag — so without it the child is a single process and every cross-worker assertion passes vacuously.    |
| `NODE_ENV=development`, never `test` | `src/app.ts` skips its own `startServer()` under `NODE_ENV=test`. A cluster booted that way forks workers that mount the app and never listen.                                                                                 |
| `agent: false` + `Connection: close` | The cluster balances **connections**. Node's `fetch` keeps the socket alive and reuses it, so a burst over one socket lands entirely on one worker — and the memory-store case then reports exactly the shared-counter result. |

Counters also live under a per-run key prefix. A shared Redis remembers, the window is a minute,
and a second run inside one would start against a budget the first had already spent.

## Redis

`NODE_TEST_REDIS_URL` if set; otherwise the suite starts a container with
`${CONTAINER_ENGINE:-podman}` and stops it afterwards. CI sets the variable, because a service
container is already listening there.

The suite **fails** rather than skips when neither is available. A security control nobody checked
is the thing it exists for, and a green skip reads exactly like a green pass.

[testcontainers](https://testcontainers.com/) is the obvious dependency for this and was not taken:
it talks to a Docker socket, and this repo is podman-first (see
[Docker and Podman](./docker-and-podman.md)). Using it here means exporting a podman socket as
`DOCKER_HOST` everywhere — a new dependency _and_ a workaround for it. Starting a container with
the engine the repo already names is thirty lines and no dependency.

## Why it is not in `complete`

~25 seconds and a container engine, on a gate that otherwise runs in about ninety. It sits in
`complete:manual` — the same category as `test:prism`, which also binds a real port — and runs in
CI on every push, where a Redis service container is already there.

## What it found

On its first run, **nothing was being limited at all**: 30 of 30 requests answered 200 against a
budget of 5.

`RedisStore.init()` loads two Lua scripts back to back. Both saw `isReady` as false — it stays
false for the whole handshake — and each called `connect()` on the same client. node-redis rejected
the second with `Socket already opened`, and that failure path discarded the client the first one
was still using, which then failed with `The client is closed`. Every request afterwards passed
unbudgeted, and the log said Redis was unreachable while Redis was answering fine.

The fix is the shared `connecting` promise in
`src/infrastructure/http/middlewares/rate-limit-store.ts`: one connection needs one `connect()`.
Reverting it turns the first case red with `Expected 5, Received 30`.
