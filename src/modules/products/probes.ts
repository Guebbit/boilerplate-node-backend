/**
 * @module
 * Requests the contract cannot describe, for the products module.
 *
 * `scripts/contracts/client-collections-bundle.ts` owns the rest: what a probe is for, where these
 * are emitted, and which `{{seedToken}}` values a probe may refer to.
 */

import type { Probe } from '@guebbit/openapi-runnable-collections';

/** The products module's probe collection — see the module header for what a probe is for. */
export const probes: Probe[] = [
    {
        name: 'Probe: 422 on a body that violates the schema',
        why: `An empty title and a negative price, each breaking one declared constraint. A contract describes valid requests; the one payload that proves the validation envelope works is the one it forbids. Compare the \`errors[]\` entries against the fields sent.`,
        method: 'POST',
        path: '/products',
        auth: 'bearer',
        body: {
            title: '',
            description: '',
            price: -1
        }
    },
    {
        name: 'Probe: the same product in Italian',
        why: `\`Accept-Language\` is deliberately not declared per operation — it applies to all of them and clients set it once in an interceptor — so no generator emits it, yet it changes every user-facing message. Send this beside the generated request and diff \`message\`.`,
        method: 'GET',
        path: '/products/{{seedProductId}}',
        headers: {
            'Accept-Language': 'it'
        }
    },
    {
        name: 'Probe: the optional filters, all at once',
        why: `Generated requests carry only REQUIRED query parameters, so the filters — the half worth testing — appear nowhere. This exercises paging, price bounds and the active flag together, which is also the combination most likely to expose a bad index.`,
        method: 'GET',
        path: '/products?page=1&pageSize=5&minPrice=1&maxPrice=100&active=true'
    },
    {
        name: 'Probe: the soft-deleted product, anonymously',
        why: `The dataset carries exactly one soft-deleted product so the scoping branches have a fixture behind them. An anonymous caller must get 404 here and an admin must get the record — send this one twice, with and without the admin token, and compare.`,
        method: 'GET',
        path: '/products/{{seedSoftDeletedProductId}}'
    },
    {
        name: 'Probe: the inactive product, anonymously',
        why: `The other half of the pair: inactive is not deleted. \`active: false\` and a set \`deletedAt\` are different states with different visibility rules, and the dataset holds one of each so the difference is observable rather than argued about.`,
        method: 'GET',
        path: '/products/{{seedInactiveProductId}}'
    }
];
