---
source: shared/cases/ssrf.cases.yaml
sha256: c09f3bce02f00a4df5ff8eaef012f67f2521aa96f38df47c21c5fcad6c2a3a0b
generated_at: 2026-11-08T03:06:38.374518+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/ssrf.cases.yaml

## Purpose

Declarative test-case suite for the SSRF (Server-Side Request Forgery) guard. It enumerates literal addresses and full URLs that must be **allowed** or **refused** (with a specific refusal reason), so that the validation logic can be verified against a known set of expectations without running live network calls.

## Key elements

- **`cases`** — flat list of test entries, each with:
  - `name` — human-readable description (also used as the test label).
  - `kind` — either `address` (bare literal IP) or `url` (full URL string).
  - `address` / `url` — the input under test (mutually exclusive by `kind`).
  - `expect` — the required outcome:
    - For `address`: `allowed` | `refused`.
    - For `url`: `allowed` | `invalid-url` | `insecure-scheme` | `credentials-in-url` | `unsafe-port` | `unsafe-address`.
- **IPv4 coverage** — loopback, private ranges (10/8, 172.16/12, 192.168/16), link-local (incl. `169.254.169.254`), CGNAT, multicast, broadcast, documentation, benchmarking, reserved class E, and public unicast.
- **IPv6 coverage** — loopback, unspecified, link-local, unique-local (fc00 & fd00), multicast, site-local, documentation, NAT64, 6to4, Teredo, and public.
- **IPv4-mapped / compatible IPv6** — `::ffff:x.x.x.x` is judged by the wrapped IPv4; `::x.x.x.x` (IPv4-compatible) is always refused.
- **Alternative IPv4 encodings in URLs** — decimal (`2130706433`), hex (`0x7f000001`), octal (`0177.0.0.1`), and short-form (`127.1`) are expected to be normalised (per WHATWG URL) and then judged as the dotted address they encode.
- **URL-level policy** — scheme must be `https`; port must be 443 (or default); no embedded credentials; no DNS names (literal IPs only).

## Relationships

No graph neighbors are recorded for this file. It is a leaf data file consumed by the SSRF-validation test harness.

## Notes

- **Allowlist, not blocklist.** The address rule permits only ordinary public unicast space; every special-purpose range is refused by omission. New special-purpose ranges (e.g., future RFCs) should be added here as refused cases.
- **Literal IPs only.** No case in this file exercises DNS resolution; the guard is expected to reject hostnames before any lookup occurs.
- **IPv4-mapped judgment.** `::ffff:8.8.8.8` is *allowed* (wraps a public address) while `::ffff:127.0.0.1` is *refused* (wraps loopback). The test harness must unwrap mapped addresses before applying the IPv4 rule.
- **Encoding normalisation is a requirement, not an option.** The decimal/hex/octal/short-form cases assert that the parser normalises *before* the allowlist check; a validator that does string-matching on the host will fail them.
- **`kind: address` vs `kind: url`.** Address cases test the IP-level rule in isolation; URL cases test the full pipeline (scheme → credentials → port → address → parse validity). A change to any single stage may need cases in both groups.
