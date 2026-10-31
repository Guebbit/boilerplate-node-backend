/**
 * The process is published in exactly one shape.
 *
 * Three payloads describe this process — the SSE frame and the two observability REST endpoints.
 * If each read `process.memoryUsage()` and `process.uptime()` independently, that would not be a
 * tidiness problem: three readings taken at three instants, some converted to megabytes and some
 * not, some rounded with `Math.round` and some with `Math.floor`, would report uptimes a second
 * apart with nothing wrong anywhere — the exact failure `observability/services/process-snapshot.ts` exists to close.
 *
 * This test holds the one property that is silent without it: **one shape, across two documents.**
 * The bytes block is declared in `openapi.yaml` AND in `asyncapi.yaml`, because the two documents
 * cannot `$ref` each other. Nothing compares them on its own, so the REST and SSE views of the
 * same four numbers are free to drift apart field by field.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '@tests/paths';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const readYaml = (relativePath: string): unknown =>
    parse(readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));

/**
 * Walk a parsed YAML document by key path.
 *
 * Returns `undefined` on a missing step rather than throwing, and every caller asserts the result
 * is defined — so a renamed schema fails as a readable expectation instead of as a TypeError
 * pointing at the middle of a property chain.
 */
const at = (root: unknown, ...keys: string[]): Record<string, unknown> | undefined => {
    let node: unknown = root;
    for (const key of keys) {
        if (!isRecord(node)) return undefined;
        node = node[key];
    }
    return isRecord(node) ? node : undefined;
};

/** Property names of a JSON-Schema-ish object node, in declaration order. */
const propertyNames = (node: Record<string, unknown> | undefined): string[] =>
    Object.keys(isRecord(node?.properties) ? node.properties : {});

describe('the process snapshot', () => {
    it('publishes the same memory block in openapi.yaml and asyncapi.yaml', () => {
        const rest = at(
            readYaml('src/modules/observability/openapi.yaml'),
            'components',
            'schemas',
            'ProcessMemory'
        );
        const sse = at(
            readYaml('src/modules/observability/asyncapi.yaml'),
            'components',
            'schemas',
            'ObservabilityMetricsPayload',
            'properties',
            'memory'
        );

        expect(rest).toBeDefined();
        expect(sse).toBeDefined();

        // Order included, not just membership: the two are read side by side by anyone comparing
        // the health card to the live feed, and a field order that disagrees is a false lead.
        expect(propertyNames(rest)).toEqual(['rss', 'heapUsed', 'heapTotal', 'external']);
        expect(propertyNames(sse)).toEqual(propertyNames(rest));

        // Both closed, so a field added to one document cannot quietly become legal in the other.
        expect(rest?.additionalProperties).toBe(false);
        expect(sse?.additionalProperties).toBe(false);
    });

    it('types every published uptime as a non-negative integer', () => {
        // The floor/round split that made two endpoints disagree was invisible precisely because
        // every contract already said `integer`. This pins the claim the shared reader relies on.
        const openapi = readYaml('src/modules/observability/openapi.yaml');
        const asyncapi = readYaml('src/modules/observability/asyncapi.yaml');

        const declarations = [
            at(
                openapi,
                'components',
                'schemas',
                'ObservabilityHealth',
                'properties',
                'uptimeSeconds'
            ),
            at(
                openapi,
                'components',
                'schemas',
                'ObservabilityMetricsSummary',
                'properties',
                'process',
                'properties',
                'uptimeSeconds'
            ),
            at(
                asyncapi,
                'components',
                'schemas',
                'ObservabilityMetricsPayload',
                'properties',
                'uptimeSeconds'
            )
        ];

        for (const declaration of declarations) {
            expect(declaration).toBeDefined();
            expect(declaration?.type).toBe('integer');
            expect(declaration?.minimum).toBe(0);
        }
    });
});
