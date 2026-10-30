---
source: tests/cross-cutting/production-topology.test.ts
sha256: 5874334bd35e0cf994af5807c19843b883ebfe6af28237dcd40d48c7d80ece7f
generated_at: 2026-10-29T06:48:36.140690+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/production-topology.test.ts

## Purpose

Security-posture guard that reads `docker-compose.production.yml` and `docker/Dockerfile.production` on every push and asserts the invariants that no type check, lint rule, or functional test can catch: container hardening, port bindings, log limits, absence of debuggers, absence of package managers, and TLS boot flags. It exists so a human does not have to re-read two config files on every review.

## Key elements

- **`PortMapping`** — union type (`string | { host_ip?, published? }`) covering both Compose port notations.
- **`ComposeFile`** — interface describing the subset of the compose YAML this test reads (services, secrets, per-service keys).
- **`isComposeFile`** — type guard narrowing `yaml.parse` output to `ComposeFile`.
- **`parsedCompose`** — the compose file parsed at module load with `{ merge: true }` so `<<: *hardening` anchors resolve.
- **`dockerfile`** — raw text of `docker/Dockerfile.production`, read at module load.
- **`OWN_CODE_SERVICES`** — `['app', 'cron', 'setup']`; the three services sharing one image and one hardening block.
- **`BACKING_SERVICES`** — data stores (`database`, `cache`, `limits`, `queue`) plus monitoring (`prometheus`, `alertmanager`, `loki`, `alloy`); all must expose no host ports.
- **`hostInterfaceOf`** — extracts the bound host interface from a `PortMapping` (regex for short form, `host_ip` for long form).
- **`describe` blocks** — one per security property: log bounding, own-code hardening, data-service hardening, port binding, Mongo TLS flags, cron pre-flight check, no package manager in the image, no `--inspect`.

## Relationships

- **`tests/support/paths.ts`** — imports `REPO_ROOT` to resolve the absolute paths to `docker-compose.production.yml` and `docker/Dockerfile.production` relative to the repository root.

## Notes

- `{ merge: true }` on `yaml.parse` is **load-bearing**. Without it, YAML 1.1 merge keys (`<<: *hardening`) remain as a literal `<<` key, every service reads as having no hardening, and all hardening assertions fail on a no-op refactor.
- The test is deliberately narrow: it asserts the specific properties that were reasoned about, not a census of every compose key. A full-shape assertion would break on the next legitimate edit and train people to delete it.
- Data services (`database`, `cache`, etc.) have a *different* hardening profile than own-code services: they cannot be `read_only` (entrypoint `chown`s the data dir) and must add back `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID`, `SETUID`.
- All file reads and parsing happen at **module load time** (top-level), not inside `it` blocks. A parse failure throws immediately and fails the entire suite with a clear message.
- The "no package manager" check slices the Dockerfile at `AS runtime` and asserts `rm` targets for npm, npx, and yarn paths, then separately asserts no compose `command` invokes `npm`.
