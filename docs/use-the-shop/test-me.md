---
type: task
audience: [staff, owner]
---

# Test it yourself

**Every kind of person the shop knows about has an account you can sign into.** Pick one, sign in,
and see the shop the way that person sees it.

## Before you start

- Node installed, and the two repositories (the shop's engine and its screens) side by side.
- The passwords below are public on purpose: they exist only on a demo database on your own
  machine, and the tool that creates them refuses to run against a production server.

## Steps

1. **Start the shop.** Set-up, and the one command that starts it, are on
   [the demo page](../build/demo-profile.md). The screens open at `http://localhost:8080`.
2. **Pick who you are** from the tables below and sign in.
3. **Try something** from [Things to try](#things-to-try).
4. **Want a walk-through?** Sign in, then add `?tour=welcome` to any page's address.
5. **Broke something?** Stop the demo and start it again. It builds a fresh shop every time, so
   nothing you click is permanent.

::: details Keeping your changes between restarts
The demo throws everything away when you close it. To keep a shop between restarts, fill your own
local database once instead: the steps are in [the demo page](../build/demo-profile.md) and the
developer set-up in [Getting started](../build/run-locally.md).
:::

## Who you can be

### The staff

Each staff account has **exactly one job**, so you see what that job sees and nothing more. Try
something outside the job and you get refused, which is what's being shown.

| Log in as         | Email                   | Password           | Their page                       |
| ----------------- | ----------------------- | ------------------ | -------------------------------- |
| **The admin**     | `root@root.it`          | `Demo-Admin1!`     | everything in this section       |
| **The manager**   | `manager@example.com`   | `Demo-Manager1!`   | [The shop manager](./manager.md) |
| **The warehouse** | `warehouse@example.com` | `Demo-Warehouse1!` | [The warehouse](./warehouse.md)  |
| **The support**   | `support@example.com`   | `Demo-Support1!`   | [The support desk](./support.md) |
| **The editor**    | `editor@example.com`    | `Demo-Editor1!`    | [The editor](./editor.md)        |
| **The moderator** | `moderator@example.com` | `Demo-Moderator1!` | [The moderator](./moderator.md)  |
| **The operator**  | `operator@example.com`  | `Demo-Operator1!`  | [What each role may do][roles]   |

Every staff sign-in then asks for a 6-digit code from an authenticator app. Add this key once, as
a manual "setup key" entry under any name: `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP`. It is the same for
all seven accounts and survives a restart. [Changing it](../build/demo-profile.md#the-named-accounts).

The admin can do anything **inside the shop**. The same account is also the operator, the person
who keeps the installation running. The operator account has only that second job: it can see
the system's health but not a single order. [Why the two jobs are kept apart][roles].

### The customers

| Log in as                | Email                        | Password               | What's special about them                                          |
| ------------------------ | ---------------------------- | ---------------------- | ------------------------------------------------------------------ |
| **A customer**           | `customer@example.com`       | `Demo-User1!`          | nothing, just a normal shopper                                     |
| **A second customer**    | `second-shopper@example.com` | `Demo-SecondShopper1!` | nothing either. Use it when two people need to want the same thing |
| **A new signup**         | `unverified@example.com`     | `Demo-Unverified1!`    | never confirmed their email, so they can look around but can't buy |
| **Two-step login**       | `two-factor@example.com`     | `Demo-TwoFactor1!`     | asks for a code after the password (see below)                     |
| **Changing their email** | `pending-email@example.com`  | `Demo-PendingEmail1!`  | asked to move to a new address and hasn't confirmed it yet         |
| **Banned**               | `banned@example.com`         | `Demo-Banned1!`        | switched off by the shop, so every login is refused                |

For the **two-step login**, type one of these instead of the emailed code: `a1b2c3d4e5`,
`f6a7b8c9d0`, `0a1b2c3d4e`. Each one works once. Restart the demo and they all work again.

You'll also see ten more customers in the staff screens: `amelia.clarke`, `benjamin.hughes` and
so on. They're there so the shop has an order history to look at. Nobody logs in as them.

## Things to try {#things-to-try}

Each line points to the page that explains what you're seeing.

| As               | Try this                                                                      | Explained in                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| a customer       | buy something, then follow the order until it arrives                         | [The journey](./shopper.md#the-journey)                                                                       |
| a customer       | pay with `pm_card_declined`                                                   | [Paying](./shopper.md#paying)                                                                                 |
| two customers    | both try to buy the **Limited-Edition Brass Pet Bowl**, the last one in stock | [The 15-minute hold](./shopper.md#the-15-minute-hold)                                                         |
| a customer       | try express delivery with the 12 kg cat tree in the basket                    | [Why can't I pick express?](./shopper.md#why-can-t-i-pick-express)                                            |
| the manager      | take a paid order and start packing it                                        | [An order's life](./manager.md#an-order-s-life)                                                               |
| the warehouse    | record the parcel leaving, then arriving                                      | [Getting parcels out of the door](./warehouse.md#getting-parcels-out-of-the-door)                             |
| the warehouse    | try to type a stock number in directly                                        | [The one rule](./warehouse.md#the-one-rule)                                                                   |
| the support desk | read the contact form's messages, and help someone who can't log in           | [The support desk](./support.md#i-can-t-get-in)                                                               |
| the editor       | change a product's price, then try to open the list of users                  | [What the editor can't reach](./editor.md#what-this-role-cannot-reach-and-why-each-one-is-a-different-reason) |
| the moderator    | ban a customer, then refund an order                                          | [Banning is its own key](./moderator.md#banning-is-its-own-key)                                               |
| anyone           | log in as `banned@example.com`                                                | [Banning is its own key](./moderator.md#banning-is-its-own-key)                                               |

## Emails

The demo never sends a real email. Every message the shop "sends" (order confirmations, reset
links, two-step codes) is kept so you can read it at `http://localhost:3000/__test/emails`. That
page exists only in the demo, so use the demo when you need to read one.

## If something looks wrong

| You see                   | Because                                             | Do this                                   |
| ------------------------- | --------------------------------------------------- | ----------------------------------------- |
| Too many attempts         | The shop limits how often anyone can try a password | Restart the demo                          |
| An order you need is gone | Somebody (maybe you) already moved it along         | Restart the demo                          |
| Something is missing      | Some things are left out on purpose                 | Check [What this demo models](./scope.md) |

## Read next

- [The demo shop](./start.md): what it sells, and what each role may do.
- [When something goes wrong](./when-something-goes-wrong.md): the fixes for a stuck order, refund or parcel.

[roles]: ./start.md#what-each-role-may-do
