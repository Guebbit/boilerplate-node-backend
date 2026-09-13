# Server-side request forgery

The server is made to fetch a URL the attacker chose. It matters because the server sits somewhere
the attacker does not: inside the network, holding cloud credentials, past the firewall. SSRF is
rarely the goal — it is the pivot that turns "I can reach your website" into "I can reach your
database".

**The one thing that has to be true:** a caller's value ends up in the URL an outbound request is
made to. Everything else is variation.

## Making the server fetch

| Attack                      | How it works                                                                            | This boilerplate                                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSRF — basic                | a webhook URL, image import, PDF renderer or URL preview fetches what it is given       | Every outbound `fetch` in `src/` has a HARD-CODED host: the two OAuth providers' token and profile endpoints, and the analytics collector at its configured host — `account/oauth/providers/`, `infrastructure/observability/analytics/umami.ts` |
| SSRF — blind                | the fetch happens but the response is not shown; timing or out-of-band DNS reveals it   | Same answer — there is no fetch to steer, so there is nothing to observe out of band.                                                                                                                                                            |
| SSRF — via redirect         | an allowed URL 302s to an internal one; the validator checked the first hop only        | No surface: there is no validator to outrun, because there is no caller-supplied URL. The hard-coded hosts are the allowlist.                                                                                                                    |
| SSRF — DNS rebinding        | a TTL-0 record resolves publicly at check time and privately at fetch time              | Same answer — no check-then-fetch window exists.                                                                                                                                                                                                 |
| SSRF — parser confusion     | `http://allowed@evil/`, `evil#@allowed`, IPv6 forms, decimal or octal IPs               | Same answer — no URL is parsed from input, so no two parsers can disagree about it.                                                                                                                                                              |
| Protocol smuggling via SSRF | `gopher://`, `dict://`, `file://` where the client library allows it                    | Same answer. Node's `fetch` also speaks HTTP(S) only.                                                                                                                                                                                            |
| Webhook / callback abuse    | user-registered URLs hit by the server — SSRF as a feature, and port scanning by timing | No surface: no endpoint accepts a URL to call back, and no field stores one.                                                                                                                                                                     |

## The PDF renderer, specifically

A headless browser is the classic SSRF-by-accident: hand it a URL and it will fetch anything, and
an `<img src="http://169.254.169.254/…">` inside attacker-controlled HTML does the same job.

Chromium receives HTML through `setContent`, **never a URL**, and every value the invoice template
prints goes through `<%= %>` — `infrastructure/adapters/pdf.ts`,
`shared/templates/documents/orders.invoice.ejs`.

## What an SSRF primitive would reach

Listed because "no surface" is only a useful verdict if you know what it is protecting.

| Attack                 | How it works                                                                    | This boilerplate                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud metadata access  | credentials from `169.254.169.254` in a cloud VM without IMDSv2                 | Reachable only through an SSRF primitive, and there is none. The deployment-side belt — IMDSv2 and blocking link-local egress — is [Egress filtering and cloud metadata](../../tools/deployment-hardening.md#egress-filtering-and-cloud-metadata).                                           |
| Internal service reach | unauthenticated admin panels, databases and brokers trusted by network position | Neither Mongo, Redis nor RabbitMQ publishes a port in the production compose file; they are reachable on the compose network and nowhere else — `docker-compose.production.yml`. So even a primitive would find authenticated services — see [Data layer](data-layer.md#reaching-the-store). |

## If you add an outbound fetch

The rule this page rests on is "every outbound host is hard-coded", and it is a property of the
code rather than of a guard. Adding a feature that fetches a caller-supplied URL — an avatar
import, a link preview, a webhook registration — removes it. That feature needs its own allowlist,
resolved-IP checks against private ranges **after** DNS resolution, and redirect following
disabled. None of that exists today because nothing needs it.

## Related

- [The API surface](api-surface.md) — consuming upstream APIs safely
- [Data layer](data-layer.md) — what sits behind the network boundary
- [Authorization](authorization.md#bypassing-the-check-rather-than-passing-it) — the confused-deputy row
