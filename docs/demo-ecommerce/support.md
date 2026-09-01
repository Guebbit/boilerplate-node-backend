# The support desk

Messages from people, accounts that need help, and knowing whether the shop is actually broken.

## The contact form

Anyone can send a message — no account needed. It is the only thing in the whole application a
complete stranger can write to.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    V["anyone fills in<br/>the contact form"] --> N["new"]
    V --> M["the support mailbox<br/>is emailed"]
    N -->|"you pick it up"| I["being handled"]
    I -->|"you finish"| R["resolved"]
    N -.->|"it is junk"| S["spam"]

    classDef pub fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef open fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef done fill:#ccfbf1,stroke:#0f766e,color:#111827;
    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#111827;
    class V,M pub;
    class N,I open;
    class R done;
    class S bad;
```

Four states, and that is the entire workflow. Private notes can be attached to a message; the person
who sent it never sees them.

::: tip It records an email address, not a customer
The form asks for an email rather than requiring a login, because the people most likely to need
help are the ones who cannot get in. A consequence worth knowing: **deleting someone's account does
not delete their messages** — they were never attached to the account in the first place.
:::

→ [`feedback`](../modules/feedback.md)

## "I can't get in"

Most of what a support desk does, and none of it needs staff intervention:

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 50}}}%%
flowchart LR
    A["forgot the password"] --> B["asks for a reset"]
    B --> C["gets an email"]
    C --> D["sets a new one"]
    E["never got<br/>the signup email"] --> F["asks again"]
    G["left themselves<br/>logged in somewhere"] --> H["log out everywhere<br/><i>ends every device at once</i>"]

    classDef prob fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef fix fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class A,E,G prob;
    class B,C,D,F,H fix;
```

A person can see every device currently signed in to their account and end any of them, or all of
them, themselves. → [`account`](../modules/account.md)

::: warning An unverified account still works
Signing up sends a verification email, but nothing in the shop refuses an unverified customer. If
someone says "I never got the email but I can still order" — that is correct, not a bug.
:::

## "Where is my order?"

Everything a customer might ask has an answer they can already see themselves: their order list, its
current step, the tracking code once it ships, and a PDF invoice to download.

If they want to cancel, they can — and a paid order refunds itself when they do. Nobody has to
process it.
→ [The customer](./shopper.md) · [`orders`](../modules/orders.md)

## Languages

The shop speaks more than one language, and **the wording can be changed without a developer**.

Someone with staff access can edit the text customers see, and register or retire a language. The
demo ships with Spanish, Italian, French and Japanese in deliberately different states of
completeness, so a half-translated shop can be seen behaving.

::: tip You can change what a phrase says, not invent new ones
Editing replaces existing wording. A brand-new label still needs a developer — the application
decides _what text exists_, the editor decides _what it says_.
:::

→ [`locales`](../modules/locales.md)

## "Is the shop down?"

There is a health page that answers plainly, plus a live activity view that updates by itself while
you watch it — useful for "is anything happening at all right now".

And there is the **90-day record of every staff action**: who changed that price, who cancelled that
order, when. Most "what happened here?" questions end there.

→ [`observability`](../modules/observability.md) · [`audit-logs`](../modules/audit-logs.md)

## What is pretend here

Worth knowing before promising anything to a customer:

| Thing              | In the demo                                                     |
| ------------------ | --------------------------------------------------------------- |
| Card payments      | Fake. No money moves. One card number always refuses.           |
| The courier        | Fake. A button marks parcels delivered.                         |
| Emails             | Not actually sent — they are collected where you can read them. |
| The whole database | Thrown away when the demo stops.                                |

→ [Demo profile](../tools/demo-profile.md)

## The words we used

| Word             | In plain terms                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| **Triage**       | Deciding what a new message is and who deals with it. → [`feedback`](../modules/feedback.md)   |
| **Verified**     | Confirmed their email. Informational here — nothing is refused without it.                     |
| **Session**      | One signed-in device. → [`account`](../modules/account.md)                                     |
| **Audit log**    | The 90-day record of staff actions. → [`audit-logs`](../modules/audit-logs.md)                 |
| **Health check** | A page that says whether the shop is running. → [`observability`](../modules/observability.md) |
