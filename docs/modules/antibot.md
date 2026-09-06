# antibot

::: tip At a glance
**Owns** — rung 4 of the anti-automation ladder: the human-challenge port, and the endpoint that
tells a frontend which provider is active.
**Depends on** — nothing, and nothing depends on it. `account` and `feedback` reach
`infrastructure/adapters/antibot-providers` directly, through `humanChallengeGate` — a
cross-cutting middleware, not an import of this module.
**Breaks if you change** — the wire shape of `AntibotConfig`, which the paired frontend reads to
decide whether to render a widget.
:::

## Its neighbourhood

<!-- module-graph:antibot:start -->

_Nothing reaches `antibot` and it reaches nothing — no imports either way, no events either way. Deleting it takes one folder and this page, and no other page changes._

<!-- module-graph:antibot:end -->

## The story

**Off by default, and the switch is a name rather than a boolean.** `NODE_ANTIBOT_PROVIDER`
selects an implementation from the registry in `infrastructure/adapters/antibot-providers`; the
default `none` passes every caller and publishes nothing to render. The same selection answers two
questions: what `GET /antibot/config` reports, and whether `humanChallengeGate` — mounted in
`account/routes.ts` on `/signup`/`/reset` and in `feedback/routes.ts` on `/contact` — demands a
token. Neither route imports this module; both import the adapter and the middleware directly,
which is why the neighbourhood diagram above shows no edges at all.

**A typo refuses to boot the rung rather than silently disabling it.** An unknown provider name
throws instead of falling back to `none`, on the same reasoning as `NODE_ANTIBOT_EMAIL_POLICY`: a
deployment's misspelling must not read as "protection off".

**The endpoint always answers, on or off.** `GET /antibot/config` reports `provider: "none"` with
an empty parameter map rather than 404 or an empty body, so the frontend can call it
unconditionally and decide what to render from the response alone.

**A provider that cannot answer is a refusal, never a pass.** A non-200, a timeout or a malformed
body from the vendor all resolve to `refused`. The alternative — failing open when the vendor is
down — would make an outage at Cloudflare into an open door here.

## Choosing a provider

`turnstile` ships as the worked example, documented as an example rather than a recommendation.
Adding another is one file and one line in the registry.

| Provider                                       | Licence / cost                 | What it costs you                                                                 |
| ---------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| `none` (default)                               | —                              | nothing; no challenge is asked                                                    |
| Cloudflare Turnstile                           | free, proprietary service      | a third-party script in your pages, and the data-protection question that follows |
| hCaptcha                                       | free tier, proprietary service | same, with a different vendor                                                     |
| [ALTCHA](https://github.com/altcha-org/altcha) | MIT, self-hosted               | you run it; proof-of-work, no third party, no vendor script                       |
| [Cap](https://github.com/tiagozip/cap)         | Apache-2.0, self-hosted        | same shape as ALTCHA, younger project                                             |
| mCaptcha                                       | AGPL, self-hosted              | a separate Rust service to operate                                                |

**Proof-of-work belongs behind this port, not beside it.** An earlier draft of the ladder had it as
its own rung with a hand-rolled hashcash protocol — a challenge format, a difficulty dial, a
single-use store and a browser solver, all maintained here. ALTCHA and Cap already ship that
protocol together with the widget that solves it, under permissive licences and with no third-party
service involved. If this deployment ever wants the no-vendor option, it arrives as another entry
in the registry above, not as a second seam.

## Related pages

- [Modules overview](./index.md) — the whole context map
- [account](./account.md) — mounts the gate on `/signup` and `/reset`
- [feedback](./feedback.md) — mounts the gate on `/contact`
- [Security](../tools/security.md) — the rate-limit budgets this rung sits behind
- [Web attack defences](../theory/web-attack-defences.md) — the whole ladder, and what each rung buys
