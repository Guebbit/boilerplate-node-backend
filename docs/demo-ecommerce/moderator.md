# The moderator

Accounts that need action taken against them, orders that need sorting out, and money that needs
to go back.

Log in as `moderator@example.com` — a real, narrower account, not the owner's. The password is
on [Test it yourself](./test-me.md).

::: tip When something goes wrong
Odd cases that land on you: [a refund owed by hand](./when-something-goes-wrong.md#refund-owed-by-hand), [a transfer for a cancelled order](./when-something-goes-wrong.md#late-transfer).
:::

## Key families, three jobs

| Key                                                         | Buys                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| `read:User` / `.create` / `.update` / `.delete`, `ban:User` | Add, edit, erase an account — and ban one.                |
| `display:Order` / `.update`                                 | Read and update any order in the shop, not only your own. |
| `display:Payment` / `create:Payment` / `create:Refund`      | Read any payment, record one, and refund it.              |
| `read:Return` / `.update`                                   | Read any return request, and approve or decline it.       |

## Banning is its own key

Banning an account **is** deactivating it (`POST /users/{id}/deactivate`), and bringing it back is
`activate`. Both need `ban:User`, a key [support](./support.md) does not hold. A role that fixes a
customer's phone number should not, by that alone, be able to lock them out:

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    A["moderator deactivates"] --> B["every session ends<br/><i>defence in depth</i>"]
    A --> C["the history records<br/><i>admin.user.banned</i>"]
    D["moderator activates"] --> E["the history records<br/><i>admin.user.unbanned</i>"]

    classDef act fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef effect fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class A,D act;
    class B,C,E effect;
```

The two moves are recorded under their own names in the action history: `admin.user.banned` and
`admin.user.unbanned`. An ordinary edit never touches `active`. → [`users`](../modules/users.md)

## "Needs review": checking an account the shop flagged

The shop watches for a buyer who keeps cancelling. When someone's **unpaid** orders fall through
three times in a week (cancelled, or left to expire without paying), their next checkout is
**paused** for at most seven days, and their account is **flagged "Needs review"**. When it is
**paid** orders they cancel, nothing is paused: cancelling before dispatch is a legal right, so the
shop only flags the account for a person to look at. Either way you get an email, and the account
shows a "Needs review" chip in the Users list (filter: Review → Needs review).

The flag **stays until you act on it**, even after a pause has ended by itself. Setting or lifting a
hold counts as acting. Both are `ban:User`, so this is your job and not [support's](./support.md).

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart TD
    A["email: account flagged"] --> B["open the account<br/><i>Users → Needs review</i>"]
    B --> C{"a real buyer<br/>or a bot / abuse?"}
    C -->|"real buyer"| D["Lift the hold, or<br/>Mark as reviewed<br/><i>the flag clears</i>"]
    C -->|"bot / abuse"| E["Pause checkout by hand<br/><i>no maximum, with a note<br/>the buyer can read</i>"]

    classDef act fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef effect fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class B,C act;
    class D,E effect;
```

Lifting asks no confirmation: the account page shows the hold's note and when it was set, and the
toast says what happened. Lifted by mistake? Pause checkout again: the buyer gets the pause email
again, and you write a new note.

A **paid** cancellation is never a reason to pause on its own. Place a hold only for abuse, and write
the note as if the buyer reads it, because they do. → [`orders`](../modules/orders.md#the-purchase-hold)

## Recording a transfer, and why a paid order refuses it

`create:Payment` is also what lets this role record money that arrived outside the checkout
flow — cash at the counter, a bank transfer once its reference is matched — through
`POST /payments/orders/{orderId}/offline`. It settles the order exactly as a card payment would: the
order moves to `paid`, stock commits, the confirmation fires.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 55}}}%%
flowchart LR
    A["money arrives<br/><i>cash, or a transfer with its reference</i>"] --> B["you record it<br/><i>POST /payments/orders/{orderId}/offline</i>"]
    B --> C["the order is paid<br/><i>stock commits, the confirmation fires</i>"]

    classDef you fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef done fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class A,B you;
    class C done;
```

An order already `paid` refuses a second recording, the same rule that refuses a second card
intent — `orders` alone decides whether an order still awaits payment, and every door that could
open a new one asks it before doing anything else. → [`payments`](../modules/payments.md)

## What a moderator protects

An account that holds a staff role may be changed only by a holder of `assign:Role`
([the rule](../theory/authorization.md#protecting-people)). A moderator does not hold it: it
can ban, edit and erase a customer, and it cannot touch another staff member or an administrator,
whatever the other keys say; the refusal is `403 ROLE_MANAGEMENT_REQUIRED`. It cannot hand out a
role either. A
moderator holds no `delete:Order` or `create:Order`: sorting an order out is updating it,
and removing or raising one on someone's behalf is [the manager's](./manager.md) job.

::: tip What this role cannot touch
No `products.*` — a moderator cannot change what a thing costs or looks like; that is
[the editor's](./editor.md) job. No `locales.*` — also [the editor's](./editor.md). No
`inventory.*` — a moderator reads an order, never moves stock.
:::

## The words we used

| Word               | In plain terms                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| **Ban**            | Deactivating an account, recorded under its own name in the history.                                 |
| **Refund**         | Money returned on a payment already taken. → [`payments`](../modules/payments.md)                    |
| **Action history** | Who did what, when, to which row; only an admin reads it. → [`audit-logs`](../modules/audit-logs.md) |
