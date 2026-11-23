---
source: shared/cases/ssrf.cases.yaml
source_sha256: 46e1953aad5acadc783b342d9611be94731d0262466676461e4a0bdacfde7ad2
context_sha256: c8d97dc83577c3ea691cf09e3a01765aa63b2e1731719642b52357aed9425a8d
generated_at: 2026-11-22T02:22:27.191881+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/cases/ssrf.cases.yaml

## Purpose
A shared, language-neutral table of test cases for an SSRF (server-side request forgery) guard on outbound calls. It defines what an outbound call may reach: https only, port 443 unless the operator allows more. The address rule is an allowlist of ordinary public unicast space. Every special-purpose range is refused without being listed. All cases use literal IPs, so none needs DNS.

## Key elements
A single top-level `cases:` list. Each entry has `name`, `kind`, and `expect`.

- **`kind: address`** has an `address` field for one resolved or literal IP. `expect` is `allowed` or `refused`. An IPv4-mapped IPv6 address is judged as the IPv4 address it wraps.
- **`kind: url`** has a `url` field for a whole URL. `expect` is `allowed` or one of these refusal reasons:
  - `invalid-url`
  - `insecure-scheme`
  - `credentials-in-url`
  - `unsafe-port`
  - `unsafe-address`

Coverage:
- **Allowed addresses:** public IPv4 and IPv6, and an IPv4-mapped public address. Also `172.32.0.1`, the address just past the `172.16/12` boundary.
- **Refused IPv4:** loopback (including the wider `127/8` block), unspecified, `10/8`, `172.16/12` (including `172.31.255.255`), `192.168/16`, link-local and the cloud metadata address `169.254.169.254`, CGNAT, multicast, broadcast, documentation, benchmarking, and class E.
- **Refused IPv6:** loopback, unspecified, link-local, unique-local (`fc00`/`fd00`), multicast, site-local `fec0`, and the documentation range. Also IPv4-mapped loopback and private addresses, IPv4-compatible, NAT64, 6to4, and Teredo.
- **URL cases:**
  - Allowed: public https, explicit `:443`, and an IPv6 literal.
  - Scheme: `http` and `ftp` are refused.
  - Credentials: `user:pass@` and `user@` are refused.
  - Syntax: non-URL text is refused.
  - Port: `:22` is refused.
  - Address: private and loopback literals are refused.
  - Alternate IPv4 spellings (decimal, hex, octal, short-form `127.1`) are normalised and judged as the real address.
  - Percent-encoded hosts are decoded once. An encoded loopback is refused and an encoded public host is allowed.
  - Double-encoded dots, and an encoded slash after the host (`%2F`), give `invalid-url`.

## Relationships
The only graph neighbor is `shared/contracts/asyncapi.workers.yaml`. Nothing in the case file references it. The file contains no imports, so any link is through whatever consumes both, and nothing visible here shows what that is. Consumers are expected to load this file and run each case against their own SSRF validator, which keeps implementations consistent.

## Notes
- Alternate IPv4 spellings are normalised per the WHATWG URL standard before judging.
- Percent-decoding happens exactly once.
- Order of the refusal reasons matters per case. For example, a bad port on a public IP gives `unsafe-port`, not `unsafe-address`.
- The "port 443 unless the operator allows more" rule is operator configuration, and no case here exercises the override.
