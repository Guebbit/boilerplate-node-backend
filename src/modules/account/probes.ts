/**
 * Requests the contract cannot describe, for the account module.
 *
 * Emitted into every client collection after this module's contract-derived requests. A contract
 * declares valid calls and their declared answers, so the requests that prove the API REJECTS
 * things have no home in it.
 *
 * Seed facts are referred to as `{{seedToken}}` — never pasted — so a probe cannot drift from the
 * dataset it is probing. The tokens are declared in `scripts/contracts/client-collections-bundle.ts`, and
 * one this module invents fails the generator with the list of known ones.
 */

import type { Probe } from '@guebbit/openapi-runnable-collections';

export const probes: Probe[] = [
    {
        name: 'Probe: log in as the non-admin',
        why: `Every generated login is the admin's, because a non-admin token makes half the collection answer 403. This is the other identity: log in with it to see those 403s deliberately, and to check that role scoping hides what it should.`,
        method: 'POST',
        path: '/account/login',
        body: {
            email: '{{seedUserEmail}}',
            password: '{{seedUserPassword}}'
        }
    },
    {
        name: 'Probe: 401 with a bogus token',
        why: `The contract declares the 401 response but no request that causes one. This sends a token that was never issued, which is the cheapest way to see the real error envelope — and to confirm the API answers 401 rather than 500 when the signature does not verify.`,
        method: 'GET',
        path: '/account',
        headers: {
            Authorization: 'Bearer not.a.real.token'
        }
    },
    {
        name: 'Probe: 409 on a signup that already exists',
        why: `Registers the seeded admin's email a second time. The contract declares 409 for this operation; nothing in it can express the state that produces one.`,
        method: 'POST',
        path: '/account/signup',
        body: {
            username: 'root',
            email: '{{seedAdminEmail}}',
            password: '{{seedAdminPassword}}'
        }
    },
    {
        name: 'Probe: rate limit (send repeatedly)',
        why: `A wrong password on purpose. Send it in a burst — the auth rate limiter answers 429, a status the contract never declares because it belongs to middleware rather than to any operation.`,
        method: 'POST',
        path: '/account/login',
        body: {
            email: '{{seedAdminEmail}}',
            password: 'wrong-on-purpose'
        }
    }
];
