# locales

::: tip At a glance
**Owns** — which languages this deployment speaks, and the runtime overrides layered over the bundled copy.
**Depends on** — nothing. It has no barrel either: nothing may import it.
**Breaks if you change** — the `scope` field. It decides which of two dictionaries a row patches.
:::

## Its neighbourhood

<!-- module-graph:locales:start -->

_Nothing reaches `locales` and it reaches nothing — no imports either way, no events either way. Deleting it takes one folder and this page, and no other page changes._

<!-- module-graph:locales:end -->

## The story

This is the subtlest module in the repo, and almost all of the subtlety is one distinction.

**There are two tiers, and they never merge.**

_Tier 1 is the API's own copy_ — `src/locales/*.json` plus every module's `locales/` folder, loaded
into i18next at boot. It is what `t()` resolves, what decides `Content-Language`, and it stays on
the filesystem permanently. It exists so a client can render copy _when no response arrives_, and
putting it behind a database would make it unavailable in exactly the outage it was created for.

_Tier 2 is the overrides_ — the two collections this module owns, edited at runtime by people who do
not open a code editor. One row per `(locale, scope, key)`, and `scope` says which dictionary it
patches:

| `scope` | Served by                           | Merged where                                                         |
| ------- | ----------------------------------- | -------------------------------------------------------------------- |
| `app`   | `GET /locales/:locale/messages`     | the frontend, over what it bundles, key by key                       |
| `api`   | nothing — never leaves this service | layered over tier 1 at boot, on a timer, and after every admin write |

::: warning Both halves are overrides, never dictionaries
Neither side may introduce a key its files do not already define and expect it to render. **The
files decide what exists; the rows decide what it says.**
:::

::: warning A language in the database does not mean the API can answer in it
`GET /locales` reports `scopes` per language rather than a bare list of tags, so "may I send
`Accept-Language: es`" and "may I download a Spanish dictionary" stay two questions. The demo
dataset registers `es` with no `src/locales/es.json` behind it precisely so the answers really are
_no_ and _yes_.
:::

Nothing here is awaited on the request path. Mongo down, a language half-translated, a malformed
key — the worst outcome is one endpoint failing and the overlay going stale, while every other
response still resolves its copy from the files.

## The pipeline

The two tiers, and the two sinks they never share. Follow `scope` and the whole module falls out.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 28, 'rankSpacing': 60}}}%%
flowchart LR
    F["src/locales/*.json<br/><i>+ every module's locales/ — the files decide what EXISTS</i>"] --> I["i18next at boot<br/><i>tier 1 · what t() resolves</i>"]
    AD["admin<br/><i>never opens a code editor</i>"] --> DB[("override rows<br/><i>tier 2 · one per locale·scope·key</i>")]
    DB -->|"scope: api<br/><i>re-layered at boot · on a timer · after every write</i>"| I
    DB -->|"scope: app"| HT["GET /locales/:locale/messages"]
    HT --> FE["the frontend<br/><i>merges over what it bundles</i>"]
    I --> RS["every response<br/><i>copy · Content-Language</i>"]

    classDef files fill:#ccfbf1,stroke:#0f766e,color:#111827;
    classDef rows fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef sink fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef ui fill:#fce7f3,stroke:#db2777,color:#111827;
    class F,I files;
    class AD,DB rows;
    class HT,RS sink;
    class FE ui;
```

Nothing on that diagram is awaited on the request path. Mongo down and the overlay goes stale while
every response still resolves its copy from the files.

## Related pages

- [Internationalisation](../tools/i18n.md) — the mechanism both tiers run on
- [Modules overview](./index.md) — the whole context map
- [Demo profile](../tools/demo-profile.md) — the seeded languages and which square of the grid each covers
- [Request Input](../theory/request-input.md) — how a locale is negotiated
