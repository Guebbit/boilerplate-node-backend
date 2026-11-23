/**
 * @module
 * Money in a public webhook payload travels as a decimal string, never a JSON number, so a
 * receiver's float arithmetic cannot round it. Read off the bundled public AsyncAPI contract, since
 * that is what a subscriber is promised.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { REPO_ROOT } from '../../../../../scripts/modules-on-disk';

/** Every payload schema of the public bundle with its properties, however it is named. */
const payloads = (): [string, Record<string, Record<string, unknown>>][] => {
    const bundle = parseYaml(
        readFileSync(path.join(REPO_ROOT, 'asyncapi.public.yaml'), 'utf8')
    ) as {
        components: {
            schemas: Record<string, { properties?: Record<string, Record<string, unknown>> }>;
        };
    };
    return Object.entries(bundle.components.schemas)
        .filter(([name]) => name.endsWith('Payload'))
        .map(([name, schema]) => [name, schema.properties ?? {}]);
};

describe('the money in a webhook payload', () => {
    it('travels as a decimal string, never a number', () => {
        const money = payloads().flatMap(([name, properties]) =>
            Object.entries(properties)
                .filter(([field]) => field === 'amount' || field === 'refundAmount')
                .map(([field, schema]) => ({ name, field, schema }))
        );

        // The canary: a vacuous pass here would mean the bundle lost its money fields.
        expect(money.length).toBeGreaterThan(0);
        for (const { name, field, schema } of money)
            expect({ name, field, ref: schema.$ref }).toEqual({
                name,
                field,
                ref: '#/components/schemas/NonNegativeDecimalAmount'
            });
    });
});
