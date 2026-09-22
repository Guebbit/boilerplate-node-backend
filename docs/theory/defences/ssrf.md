# Server-side request forgery

The server is made to fetch a URL the attacker chose. It matters because the server sits somewhere
the attacker does not: inside the network, holding cloud credentials, past the firewall. SSRF is
rarely the goal — it is the pivot that turns "I can reach your website" into "I can reach your
database".

**The one thing that has to be true:** a caller's value ends up in the URL an outbound request is
made to. Everything else is variation.

This backend has exactly one path where that is true — outbound [webhooks](../../modules/webhooks.md),
which POST to a URL the subscriber registered — and one guard built for it,
`infrastructure/adapters/ssrf-guard.ts`. Every other outbound `fetch` in `src/` targets a
hard-coded host. The table below is read against that split: the guarded webhook path on one side,
"no surface at all" everywhere else.

A deployment that never sends webhooks removes the module, and that one path goes with it — see
[webhooks](../../modules/webhooks.md#not-wanted-remove-the-module).

## Making the server fetch

| Attack                      | How it works                                                                            | This boilerplate                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSRF — basic                | a webhook URL, image import, PDF renderer or URL preview fetches what it is given       | Two shapes. Every fetch to a HARD-CODED host — the two OAuth providers' token/profile endpoints, the analytics collector, HIBP's breached-password range API, Cloudflare Turnstile's verify endpoint — has no caller-supplied part to steer. The one exception is webhook delivery, whose URL is the subscriber's; it goes through `ssrf-guard.ts` before every request. |
| SSRF — blind                | the fetch happens but the response is not shown; timing or out-of-band DNS reveals it   | For the hard-coded hosts, nothing to steer. For webhooks the guard runs _before_ the request against the resolved IP, so a refused target never connects — there is no timing or out-of-band signal to read off a request that was never made.                                                                                                                           |
| SSRF — via redirect         | an allowed URL 302s to an internal one; the validator checked the first hop only        | `webhook-delivery.ts` never follows a redirect: a 3xx is read as a failed delivery, full stop. There is no "first hop only" because there is no second hop to a validator's blind spot.                                                                                                                                                                                  |
| SSRF — DNS rebinding        | a TTL-0 record resolves publicly at check time and privately at fetch time              | The guard closes the TOCTOU window by construction: it resolves the hostname once, validates that address, then hands delivery a `lookup` pinned to it — the HTTP client is never free to resolve a second time and get a private answer.                                                                                                                                |
| SSRF — parser confusion     | `http://allowed@evil/`, `evil#@allowed`, IPv6 forms, decimal or octal IPs               | The subscriber URL is parsed once with `URL`, and the range checks run on the resolved IP via `ip-address`'s `Address4`/`Address6`, not string matching — including the IPv4-mapped IPv6 literal (`::ffff:127.0.0.1`) a naive check waves through.                                                                                                                       |
| Protocol smuggling via SSRF | `gopher://`, `dict://`, `file://` where the client library allows it                    | The guard requires `https:` (the one dev/test demo host aside), and Node's client speaks HTTP(S) only regardless.                                                                                                                                                                                                                                                        |
| Webhook / callback abuse    | user-registered URLs hit by the server — SSRF as a feature, and port scanning by timing | This IS the surface, and it is the one the guard is for. Private, loopback, link-local and CGNAT ranges are refused before the first request, so a subscription cannot be turned into an internal port scanner — see [The delivery path](../../modules/webhooks.md#the-delivery-path).                                                                                   |

## Ranges refused, and why

RFC 1918 private space, RFC 1122 loopback, RFC 3927 / RFC 4291 link-local (this is what blocks the
cloud metadata endpoint `169.254.169.254`), RFC 4193 IPv6 unique-local, RFC 6598 carrier-grade NAT,
RFC 919 broadcast, and both families' unspecified (`0.0.0.0`, `::`) and multicast ranges — plus
three IPv6 forms that embed an address `ip-address`'s own `embeddedIPv4()` does NOT unwrap: 6to4
(RFC 3056, `2002::/16`), Teredo (RFC 4380, `2001::/32`), and the deprecated IPv4-compatible form
(RFC 4291 §2.5.5.1, `::/96` — `::a.b.c.d`, distinct from the IPv4-_mapped_ `::ffff:a.b.c.d` form
`embeddedIPv4()` already covers). All three carry an IPv4 address in their bits — 6to4 plainly,
Teredo XOR-obfuscated, the compat form plainly again — that would otherwise read as an ordinary
global address to every other check: a literal encoding `169.254.169.254` inside any of the three
is invisible to a check that only unwraps the mapped form. Refused outright rather than decoded: a
legitimate outbound target has no reason to be specified as a transition-mechanism literal, and
native 6to4/Teredo relaying is still enabled on some hosts and networks despite the public relay
infrastructure having mostly been decommissioned.

## What the guard deliberately does not do

- **No redirect handling.** A 3xx must not be followed without re-running this same check on the
  `Location` header — the simplest correct answer, refuse every redirect outright, is the caller's
  job. `webhook-delivery.ts` does exactly that (see the "SSRF — via redirect" row above).
- **No timeout math.** The caller wraps the whole outbound attempt — this resolution included — in
  one `AbortSignal.timeout`, rather than this module owning a second timer that would need to stay
  in sync with the first.

## The PDF renderer, specifically

A headless browser is the classic SSRF-by-accident: hand it a URL and it will fetch anything, and
an `<img src="http://169.254.169.254/…">` inside attacker-controlled HTML does the same job.

Chromium receives HTML through `setContent`, **never a URL**, and every value the invoice template
prints goes through `<%= %>` — `infrastructure/adapters/pdf.ts`,
`shared/templates/documents/orders.invoice.ejs`.

## What an SSRF primitive would reach

Listed because a guard is only as reassuring as what it protects — and because the webhook path is
constrained, not absent.

| Attack                 | How it works                                                                    | This boilerplate                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud metadata access  | credentials from `169.254.169.254` in a cloud VM without IMDSv2                 | The only caller-supplied-URL path refuses link-local addresses before it connects (above). The deployment-side belt — IMDSv2 and blocking link-local egress — is [Egress filtering and cloud metadata](../../tools/deployment-hardening.md#egress-filtering-and-cloud-metadata).             |
| Internal service reach | unauthenticated admin panels, databases and brokers trusted by network position | Neither Mongo, Redis nor RabbitMQ publishes a port in the production compose file; they are reachable on the compose network and nowhere else — `docker-compose.production.yml`. So even a primitive would find authenticated services — see [Data layer](data-layer.md#reaching-the-store). |

## If you add another outbound fetch

Outbound webhooks were the first feature to fetch a caller-supplied URL, and
`infrastructure/adapters/ssrf-guard.ts` is the reference the next one should copy rather than
re-derive. The non-negotiables, all of which it already implements:

- a denylist by **resolved IP** — private, loopback, link-local and CGNAT ranges checked _after_
  DNS resolution, never against the hostname, which says nothing about where it points;
- **pin** the validated address for the actual connection, so a second DNS lookup cannot answer
  differently (the rebinding window);
- **redirects disabled** — a 3xx is a failure, not a new hop to re-validate;
- **`https:` only**, and parsing done by a library (`ip-address`), not by hand.

Reuse the guard rather than writing a fresh check: the IPv6 embedding forms alone — mapped, 6to4,
Teredo — are a class of bug a hand-rolled range test gets wrong. See
[The delivery path](../../modules/webhooks.md#the-delivery-path).

## Related

- [webhooks](../../modules/webhooks.md) — the one outbound path that takes a caller-supplied URL
- [The API surface](api-surface.md) — consuming upstream APIs safely
- [Data layer](data-layer.md) — what sits behind the network boundary
- [Authorization](authorization.md#bypassing-the-check-rather-than-passing-it) — the confused-deputy row
