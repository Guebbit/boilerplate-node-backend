---
source: shared/cases/ssrf.cases.yaml
sha256: 946504e560db7476eac005349e14d9aec1de4d1577f0dcf32da100a2789661e5
generated_at: 2026-11-14T17:44:19.563259+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/ssrf.cases.yaml

## Purpose

A declarative test-case catalog that pins down the SSRF (Server-Side Request Forgery) validation policy for outbound calls. It enumerates which literal IP addresses and whole URLs must be **allowed** vs **refused** (and *why*), so that any implementation of the filter can be verified against a single source of truth. The policy is: HTTPS only, port 443 only, and only ordinary public-unicast addresses (every special-purpose range is refused by default).

## Key elements

- **`cases`** — top-level list; each entry is one test scenario.
- **`name`** — human-readable description of the scenario (used in test reports).
- **`kind`** — discriminant: `"address"` (bare IP) or `"url"` (full URL string).
- **`address`** (when `kind: address`) — the literal IP under test; `expect` is `"allowed"` or `"refused"`.
- **`url`** (when `kind: url`) — a full URL string; `expect` is `"allowed"` or one of the refusal reasons: `invalid-url`, `insecure-scheme`, `credentials-in-url`, `unsafe-port`, `unsafe-address`.
- **Coverage areas exercised:**
  - IPv4: public unicast (allowed) vs. loopback, 0.0.0.0, 10/8, 172.16/12, 192.168/16, link-local (incl. `169.254.169.254`), CGN, multicast, broadcast, documentation, benchmarking, class E.
  - IPv6: public (allowed) vs. `::1`, `::`, link-local, ULA (fc00/fd00), multicast, site-local, documentation.
  - IPv4-mapped / compatible / NAT64 / 6to4 / Teredo forms.
  - URL-level: scheme check, credential embedding, non-443 ports, non-URL text, and alternate IPv4 spellings (decimal, hex, octal, short-form) that normalise to a refused address.

## Relationships

No graph neighbors are recorded for this file. It is a leaf test-data document consumed by whatever runner iterates the `cases` list; it has no runtime code dependencies of its own.

## Notes

- The file is **data only** — it defines *expected* outcomes, not the validation logic. The implementation under test is expected to read each case and produce the matching `expect` value.
- IPv4-mapped IPv6 addresses (`::ffff:x.x.x.x`) are judged as the wrapped IPv4; the same applies to IPv4-compatible (`::x.x.x.x`), NAT64, 6to4, and Teredo forms — all are refused.
- The 172.16/12 boundary is explicitly tested on both edges (`172.31.255.255` refused, `172.32.0.1` allowed) to guard against off-by-one range errors.
- WHATWG URL normalisation means `https://2130706433`, `https://0x7f000001`, `https://0177.0.0.1`, and `https://127.1` all resolve to `127.0.0.1` and are refused as `unsafe-address`. An implementation that skips normalisation will fail these cases.
- Literal IPs only; no DNS resolution is involved in any case, so tests are deterministic and offline-safe.
