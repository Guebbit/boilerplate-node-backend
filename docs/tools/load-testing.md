# Load testing

Load is generated from **outside** the process, with [autocannon](https://github.com/mcollina/autocannon),
against a running server. Real requests through the real stack are what make the three
observability signals line up: the Prometheus histograms, the OpenTelemetry traces and the Loki
logs all describe the same traffic, so a p95 you see on a Grafana panel is a p95 a client
actually experienced.

`autocannon` is a devDependency. Nothing about load testing ships in the server.

## k6 (`bench:k6`, `bench:k6:checkout`) runs in a container, not on the host

Unlike `autocannon`, [k6](https://k6.io/) has no npm package — it is a Go binary nobody installs by
hand, and this repo does not ask you to. `bench:k6` and `bench:k6:checkout` instead run it through
whichever engine `CONTAINER_ENGINE` already names (`podman` by default):

```
${CONTAINER_ENGINE:-podman} run --rm -i --network=host -v ./tests/load:/scripts:Z grafana/k6 run /scripts/browse.js
```

`--network=host` is what lets the containerized k6 reach the app on the host's own port — the
opposite of most `docker run` traffic, which stays inside the container's network. `tests/load/` is
bind-mounted read-only-in-spirit (`:Z` only relabels for SELinux) so both scripts run straight from
the working tree, unedited by anything in the image.

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
npm run bench          # GET /products      — cached read path
npm run bench:search   # POST /products/search — uncached, database-backed
```

Both use 20 connections for 30 seconds and print a latency histogram (`-l`). They read
`NODE_PORT`, defaulting to 3000.

Anything else is a direct invocation — the npm scripts are starting points, not a wrapper:

```bash
npx autocannon -c 50 -d 60 -l http://localhost:3000/products/<id>
npx autocannon -c 10 -d 20 -H 'Authorization: Bearer <token>' http://localhost:3000/orders
```

## The two scripts are deliberately different paths

`bench` hits `GET /products`, which is cached (`setCache(3600, { tags: ['products'] })` in
`src/modules/products/routes.ts`). After the first request nearly every response is a Redis hit, so it
measures the cache and the HTTP stack. Watch `x-cache: HIT` and expect low, flat latency.

`bench:search` hits `POST /products/search`, which is **not** cached and runs a regex query
against Mongo. This is the one that moves `http_request_duration_milliseconds` in an interesting
way, and the one that shows database time inside a trace.

Running both back to back is the demo: the same service, two shapes.

## What to look at while it runs

| Where                                        | What it shows                                             |
| -------------------------------------------- | --------------------------------------------------------- |
| Grafana → the API dashboard                  | request rate, error ratio, latency percentiles (RED)      |
| `nodejs_eventloop_lag_seconds` in Prometheus | whether the process is actually saturated or just waiting |
| `http_requests_in_flight`                    | concurrency the server sees, vs. the `-c` you asked for   |
| Tempo                                        | a single slow request, broken down by span                |
| Loki                                         | the log lines those same requests produced                |

autocannon's own output is the client's view — throughput, latency percentiles, non-2xx counts.
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
