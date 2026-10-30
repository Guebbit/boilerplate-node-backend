/**
 * Each closed code an AsyncAPI webhook payload names is an inline COPY of an OpenAPI enum (no
 * AsyncAPI fragment can `$ref` an OpenAPI file). This sweep keeps every copy equal to its twin,
 * so a value added on the REST side cannot be left out of what a subscriber is told.
 *
 * See: docs/api/contract-fragmentation.md
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { MODULES_ROOT } from '@tests/paths';

/** A parsed contract file, narrowed to the one corner these tests read. */
interface ContractFile {
    components: { schemas: Record<string, SchemaNode> };
}

/** A schema node, as far as these tests look at it. */
interface SchemaNode {
    enum?: string[];
    properties?: Record<string, SchemaNode>;
}

/** Parses `src/modules/<module>/<file>`. */
const load = (module: string, file: string): ContractFile =>
    parse(readFileSync(path.join(MODULES_ROOT, module, file), 'utf8')) as ContractFile;

/** The enum of a top-level OpenAPI schema (`ReturnReason`, …). */
const restEnum = (module: string, schema: string): string[] =>
    load(module, 'openapi.yaml').components.schemas[schema]?.enum ?? [];

/** The enum of one property of an AsyncAPI payload schema. */
const eventEnum = (module: string, schema: string, property: string): string[] =>
    load(module, 'asyncapi.webhooks.yaml').components.schemas[schema]?.properties?.[property]
        ?.enum ?? [];

/** [label, AsyncAPI copy, OpenAPI twin] — one row per copied enum. */
const PAIRS: [string, () => string[], () => string[]][] = [
    [
        'return.requested reason = ReturnReason',
        () => eventEnum('returns', 'ReturnRequestedPayload', 'reason'),
        () => restEnum('returns', 'ReturnReason')
    ],
    [
        'return.requested statedVia = ReturnStatementChannel',
        () => eventEnum('returns', 'ReturnRequestedPayload', 'statedVia'),
        () => restEnum('returns', 'ReturnStatementChannel')
    ],
    [
        'return.closed remedy = ReturnRemedy',
        () => eventEnum('returns', 'ReturnClosedPayload', 'remedy'),
        () => restEnum('returns', 'ReturnRemedy')
    ],
    [
        'payment.refund_reversed failureReason = RefundFailureReason',
        () => eventEnum('payments', 'PaymentRefundReversedPayload', 'failureReason'),
        () => restEnum('payments', 'RefundFailureReason')
    ],
    [
        'payment.refund_failed failureReason = RefundFailureReason',
        () => eventEnum('payments', 'PaymentRefundFailedPayload', 'failureReason'),
        () => restEnum('payments', 'RefundFailureReason')
    ],
    [
        'payment.dispute reason = DisputeReason',
        () => eventEnum('payments', 'PaymentDisputePayload', 'reason'),
        () => restEnum('payments', 'DisputeReason')
    ],
    [
        'payment.dispute kind = DisputeKind',
        () => eventEnum('payments', 'PaymentDisputePayload', 'kind'),
        () => restEnum('payments', 'DisputeKind')
    ],
    [
        'payment.dispute status = DisputeStatus',
        () => eventEnum('payments', 'PaymentDisputePayload', 'status'),
        () => restEnum('payments', 'DisputeStatus')
    ]
];

describe('AsyncAPI enum copies equal their OpenAPI twins', () => {
    it.each(PAIRS)('%s', (_label, copy, twin) => {
        // An empty twin would make an empty copy "equal": the canary refuses that.
        expect(twin().length).toBeGreaterThan(0);
        expect(copy()).toEqual(twin());
    });

    it('covers every pair the plan names', () => {
        expect(PAIRS).toHaveLength(8);
    });
});
