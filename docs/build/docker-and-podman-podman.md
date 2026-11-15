---
type: concept
audience: [developer]
---

# Docker & Podman: Podman and log collection

Part of [Docker & Podman](./docker-and-podman.md): choosing the engine, the compose provider, and log shipping on Podman.

## Podman and log collection

Docker writes container logs as `json-file` under `/var/lib/docker/containers`. Podman can write
the same kind of thing with its `k8s-file` driver (CRI format) under its own storage path — but
**it does not do so by default.** Podman's default driver is `journald`, which puts log lines in
the systemd journal and writes no file at all. Alloy tails files, so with the default it tails a
glob matching nothing, Loki stays empty, and Grafana's log panels are blank with no error anywhere
to explain it.

That is the entire difference between the two runtimes, and it is two values in `.env`, which
compose reads by itself:

```dotenv
CONTAINER_LOGS_PATH=/home/youruser/.local/share/containers/storage/overlay-containers
CONTAINER_LOG_DRIVER=k8s-file
```

The defaults in `docker-compose.yml` are docker's, so on docker you set neither of them. The driver is
applied to every service through a YAML anchor rather than per service, because Alloy scrapes
the whole directory and any service left on the default would simply be missing from the logs.
Whichever path you give is mounted at `/var/log/host-containers`, so one config reads both: `alloy.logs.config.alloy`
has a glob and parser stage for each engine — JSON envelope for docker, CRI for podman. It is the file the production stack loads too.

The cost on podman: the log driver and path are no longer hidden by engine discovery, so both values are required.

There is no override file and no `-f` list.

### Choosing the engine

```bash
npm run compose:restart                          # podman
CONTAINER_ENGINE=docker npm run compose:restart  # docker
```

`npm run compose` expands `${CONTAINER_ENGINE:-podman} compose`. Export the variable in your shell
profile if you use docker — and note it is a **shell** variable, not a `.env` one. Compose reads
`.env`; npm does not, so the one thing `.env` cannot decide is which binary npm invokes. That suits
it: your engine is a property of your machine, not of this repo.

> **Do not set `COMPOSE_FILE` in `.env`.** Docker Compose honours it there, but podman-compose
> ignores it (verified 2026-08-05 against podman-compose 1.6.0), so anything built on it works on
> one runtime and silently does nothing on the other. Plain variables like the two above are
> substituted by both.

### The compose provider behind `podman compose`

`podman compose` does not run compose itself: it hands the file to an external **provider**, and
prints which one (`>>>> Executing external compose provider …`). Use **Docker Compose**, not
podman-compose, on every machine that runs this repo: your laptop, staging, production.

| podman-compose 1.6 (latest), run whole on the production file            | Docker Compose behind `podman compose` |
| ------------------------------------------------------------------------ | -------------------------------------- |
| managed mode (`COMPOSE_PROFILES=`) crashes: `required: false` is ignored | starts                                 |
| a failed `setup` still starts `app` and `cron`                           | `up` fails, `app` and `cron` stay down |
| `setup` and `mongo-rs-init` re-run on every dependent start              | run once                               |

Set it up once per host:

```bash
sudo pacman -S docker-compose     # or your distro's package; the binary alone works too
systemctl --user enable --now podman.socket   # Docker Compose talks to Podman through this socket
podman compose version            # the banner must name docker-compose
```

Podman tries `docker-compose` before `podman-compose`, so installing it is the whole switch; you keep
typing `podman compose`. To pin it, set `compose_providers` in your user's containers.conf
([containers.conf](https://github.com/containers/common/blob/main/docs/containers.conf.5.md)).
The podman-compose workarounds still in the compose files are valid Compose, so they stay.

## Read next

- [Docker & Podman](./docker-and-podman.md)
