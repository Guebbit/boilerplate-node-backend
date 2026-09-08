# Translating product content

**Status:** proposal, not started. No product code changed for this. Written while adding the
`editor`/`translator`/`moderator` roles, because building the translator revealed a real gap next
to it — recorded here so the decision gets made deliberately, later, rather than folded into an
unrelated change.

## The gap, as measured

The shop's UI copy is already bilingual, in two tiers — see `docs/tools/i18n.md` and
`docs/modules/locales.md`:

- **Tier 1** — deployed files (`src/locales/*.json` + every module's `locales/`), loaded into
  i18next at boot. What `t()` resolves: API messages, validation text, email and PDF copy.
- **Tier 2** — the `localeEntries` collection, runtime-editable rows keyed `(locale, tenant, key)`.
  The `backend` tenant overlays tier 1; `frontend` tenants (one or more) are what a client
  downloads for its own screens.

**Product content has neither tier.** `src/modules/products/model.ts`: `title` and `description`
are single scalar strings; `categories`/`tags` are English slugs that double as facet chip labels.
No product endpoint takes a language parameter. The frontend renders the value verbatim — labels
go through `t()`, the product's own words never do.

The sharpest demonstration is `src/modules/orders/emails.ts:33-57` (`orderConfirmEmail`): every
string in an order-confirmation email is resolved through a locale-bound `t`, except
`item.product.title`, interpolated raw. An Italian customer receives a fully Italian email listing
an English product name. The same applies to the PDF invoice.

`docs/demo-ecommerce/support.md` used to claim "the text customers see" is editable without a
developer — true only of screen copy. Fixed in this change (see the roles work) to say so
explicitly and point at this document.

## The recommendation

**A separate `productTranslations` collection**, one row per `(productId, locale)`, unique compound
index on that pair, resolved server-side so the wire shape stays `title: string` — the frontend
needs no change to consume it.

Chosen over an embedded `translations` map on `Product` for four reasons:

1. **Translation has its own lifecycle.** Who translated it, when, machine-translated or human,
   reviewed, and — the one that matters most — _stale_, when the source changed after the
   translation was made. That is a first-class document with its own fields, not a nested blob
   with none of them.
2. **"Which products lack Italian?" becomes a query.** Against an embedded map it is a `$exists`
   walk over every document; against a collection it is one indexed query.
3. **A read ships one language, not all of them.** An embedded map sends every translated language
   on every request, whatever the caller asked for — the working set grows with the language
   count even for a single-language read.
4. **It is its own subject.** A translator gets a key on `ProductTranslation` and never needs
   `products.update` — so a mistranslation can never become a mischanged price. The
   [`translator` role](docs/demo-ecommerce/translator.md) added alongside this document already
   assumes that separation; an embedded map would have forced `products.manage` on a role this
   change deliberately kept narrow.

**`categories`/`tags` translate by id**, the way `SHIPPING_METHODS` already does in
`src/modules/delivery/domain/rates.ts` — the one place in the repo that already gets this right.
The slugs stay as stored; the words a shopper reads come from the frontend dictionary the
translator already owns (tier 2, `frontend` tenant), keyed by the slug rather than hand-authored
per product.

## The traps, each one found in the code

- **`additionalProperties: false`** on `Product` (`shared/contracts/openapi.root.yaml`) means
  nothing can be bolted onto the response without a contract change — there is no quiet way to add
  a translated field.
- **The response cache must key on locale.** `setCache`/`searchCache`
  (`src/infrastructure/http/middlewares/cache.ts`) do not vary by `Accept-Language` today, because
  the body never has. Once it does, a cached catalogue page for one language will otherwise be
  served to every language.
- **`Content-Language` and `Vary: Accept-Language` are already set globally**
  (`src/infrastructure/http/middlewares/locale.ts:29-30`). On a catalogue read that is currently a
  false promise — the body never varies by language — and it fragments every CDN cache entry per
  language for identical bytes. Worth revisiting either way, and load-bearing once translation
  lands.
- **Orders embed the whole `productSchema`** (`src/modules/orders/model.ts`). What a line freezes
  at checkout has to be decided explicitly: the buyer's own language at the time of purchase is
  the obvious answer, and it is what makes the order-confirmation email fix possible at all.
- **There is no Mongo text index today.** `src/infrastructure/persistence/search.ts`'s
  `addTextFilter` is an unanchored `$regex` scan — no `default_language`, no stemming, no ranking,
  in any language. Multi-language search needs per-language analyzers in a real search engine
  regardless of which storage option wins here; this document does not resolve that, only notes
  that the fork is still ahead, not behind.

## Blast radius

Product model and contract, the response cache's key shape, order line snapshots, order
confirmation emails, PDF invoices, facet chips, and the 132 English demo fixtures in
`demo/products.ts` / `demo/demo-catalog.ts`.
