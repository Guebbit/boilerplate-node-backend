# The translator

The words on every screen — buttons, labels, messages — in every language the shop speaks.

Log in as `translator@example.com` / `Demo-Translator1!` — a real, narrower account, not the
owner's.

## One key, the whole dictionary

`locales.manage` is the only permission this role holds, and it is enough on its own: register a
language, retire one, edit any phrase in any of them. Nothing else in the shop needs this role at
all, and this role needs nothing else in the shop:

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    T["the translator"] -->|"may"| A["register or retire a language"]
    T -->|"may"| B["edit any phrase, in any language"]
    T -.->|"may NOT"| C["touch a product, an order, an account"]

    classDef staff fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef can fill:#ccfbf1,stroke:#0f766e,color:#111827;
    classDef cannot fill:#fee2e2,stroke:#b91c1c,color:#111827;
    class T staff;
    class A,B can;
    class C cannot;
```

A mistranslation cannot become a mischarge — that is the whole design. → [`locales`](../modules/locales.md)

## What this role edits, exactly

Only the shop's own screen text: what a button says, what a validation message reads, what an
email's subject line is. The demo ships Spanish, Italian, French and Japanese in deliberately
different states of completeness, so a half-translated shop can be seen behaving — that state is
this role's to fix.

::: warning A product's own words are not part of this
A product's `title` and `description` are a single value today, in every language — see
[`products`](../modules/products.md). This role edits the WORDS AROUND a product (its category
chip's label, "Add to basket", the checkout button); it has no way to translate the product's own
name, because the application has nowhere to write one yet.
:::

## Existing wording only

Editing replaces what a phrase says. It never invents a new one — a brand-new label on a screen
still needs a developer, because the application decides which screens have which pieces of text
at all; this role only decides what each one currently says.

## What this role cannot reach

No `products.*`, no `orders.*`, no `users.*`, no `payments.*`, no `audit.read`. Try opening
`/products` while logged in as the translator: not a 403 — signing in only ever WIDENS what the
anonymous baseline already grants, and that baseline includes `products.read`, so the translator
sees exactly the public catalogue a logged-out visitor does, no more. `/orders` is the real
difference: the translator holds no `orders.*` key at all, baseline or otherwise, so that answers
200 with an empty list rather than a refusal — no route has a guard to refuse it with. Neither
narrower account can reach into the other's job; the shapes of "cannot" just differ by route.

## The words we used

| Word                 | In plain terms                                                               |
| -------------------- | ---------------------------------------------------------------------------- |
| **`locales.manage`** | The one key this role holds — every language, every phrase, unconditionally. |
| **Locale**           | One language the shop can speak. → [`locales`](../modules/locales.md)        |
| **Entry**            | One phrase, in one language — what this role actually edits.                 |
