---
type: task
audience: [developer]
---

# Load testing

Load is generated from **outside** the process, with [k6](https://k6.io/), against a running server.
Real requests through the real stack are what make the three
observability signals line up: the Prometheus histograms, the OpenTelemetry traces and the Loki
logs all describe the same traffic, so a p95 you see on a Grafana panel is a p95 a client
actually experienced.

Nothing about load testing ships in the server, and k6 is not an npm dependency.

## k6 runs in a container, not on the host

k6 has no npm package — it is a Go binary nobody installs by hand, and this repo does not ask you
to. `bench` and `bench:k6` run it through whichever engine `CONTAINER_ENGINE` already names (`podman`
by default), from the image `grafana/k6:1.8.1`. That tag is pinned to an exact version (published
2026-08-12) so a run today and a run in a year use the same tool; move it on purpose.

```
${CONTAINER_ENGINE:-podman} run --rm -i --network=host -e BASE_URL -v ./tests/load:/scripts:Z grafana/k6:1.8.1 run /scripts/browse.js
```

Two kinds of script live in `tests/load/`:

| Command                     | Script        | What it does                                                        |
| --------------------------- | ------------- | ------------------------------------------------------------------- |
| `npm run bench [path]`      | `hit.js`      | one URL at constant virtual users, reports numbers, no verdict      |
| `npm run bench:k6`          | `browse.js`   | ramping read journey with thresholds: passes or fails               |
| `npm run bench:k6 checkout` | `checkout.js` | the write path: log in, fill a cart, check out (throwaway database) |

`-e BASE_URL` passes your shell's `BASE_URL` into k6, so `BASE_URL=https://staging.example npm run bench:k6`
aims it elsewhere. Unset, the scripts use `http://localhost:3000`. `bench` builds its `TARGET` from
`NODE_PORT` and the path argument, and also passes `TOKEN`, `VUS` and `DURATION` through when set.

`--network=host` is what lets the containerized k6 reach the app on the host's own port — the
opposite of most `docker run` traffic, which stays inside the container's network. `tests/load/` is
bind-mounted read-only-in-spirit (`:Z` only relabels for SELinux) so the scripts run straight from
the working tree, unedited by anything in the image.

[autocannon](https://github.com/mcollina/autocannon) is a lighter alternative for a quick check of
one URL when you do not want a container: `npx autocannon -c 20 -d 30 -l http://localhost:3000/products`.
This repo does not depend on it.

## When to run one

Nothing runs load automatically — not the gate, not CI, not a nightly. It needs a running server
and a machine that is otherwise idle, which is a person's decision rather than a runner's.

Run one in the two cases where the number can actually have moved:

- **Before a release**, so the p95 you quote is measured rather than remembered.
- **After changing a hot path** — a route's caching, a repository's query or index, the
  serialisation every response goes through.

There is no recorded baseline to compare against. Take the numbers from a run on the same machine
before the change, not from a previous release on different hardware.

## Running one

Start the stack, then point a run at it:

```bash
npm run compose:restart     # or: npm run dev
npm run bench               # GET /products — cached read path
npm run bench /orders       # any other GET path
TOKEN=<access token> npm run bench /orders   # a route that needs a session
VUS=50 DURATION=60s npm run bench /products/<id>
```

`bench` takes the path as its one argument, `/products` by default. It uses 20 virtual users for
30 seconds unless `VUS` and `DURATION` say otherwise, and reads `NODE_PORT`, defaulting to 3000.
k6 prints its summary at the end: request rate, the latency percentiles and the failed-request rate.

## What `bench` measures on `/products`

`bench` hits `GET /products`, which goes through `cacheProductsSearch` (`searchCache('products', …)`
in `src/modules/products/routes.ts`). After the first request nearly every response is a Redis hit, so it
measures the cache and the HTTP stack. Watch `Cache-Status: api-redis; hit` and expect low, flat latency.
To see database time inside a trace, run it with the cache off, or aim it at a path the cache does
not cover.

## What to look at while it runs

| Where                                        | What it shows                                             |
| -------------------------------------------- | --------------------------------------------------------- |
| Grafana → the API dashboard                  | request rate, error ratio, latency percentiles (RED)      |
| `nodejs_eventloop_lag_seconds` in Prometheus | whether the process is actually saturated or just waiting |
| `http_requests_in_flight`                    | concurrency the server sees, vs. the `VUS` you asked for  |
| Tempo                                        | a single slow request, broken down by span                |
| Loki                                         | the log lines those same requests produced                |

k6's own output is the client's view — throughput, latency percentiles, non-2xx counts.
Where the two disagree, the difference is queueing outside the app: the proxy, the connection
pool, the event loop.

## Reading the result

- **Non-2xx responses** are the first thing to check. A run that reports great latency and 40%
  `429` is measuring the rate limiter (`middlewares/rate-limit.ts`), not the endpoint. Raise the
  limit for the run or expect the noise.
- **p97.5 / p99, not the mean.** The mean hides exactly the requests users complain about.
- **Compare runs, not absolutes.** Numbers from a laptop running Mongo, Redis, RabbitMQ, Grafana
  and the API in containers say nothing about production capacity. They say plenty about whether
  a change made things worse.

## Why load is generated from outside

An in-process "generate load" endpoint cannot do this job:

- it measures whatever the loop happens to call — a logging loop measures Winston, not the API;
- a busy loop that does not yield blocks the worker for its whole duration, so `/health` and
  `/metrics` time out and the dashboards it exists to exercise show a **gap** rather than a spike;
- one synthetic burst in one worker is not a load _pattern_, which is what a dashboard is for;
- it costs a controller, a route, an OpenAPI path and its generated models, to do worse what a
  CLI tool does well.
