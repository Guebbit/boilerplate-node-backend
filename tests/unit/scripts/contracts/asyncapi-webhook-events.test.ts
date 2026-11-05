import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { REPO_ROOT } from '../../../../scripts/modules-on-disk';
import {
    webhookEventFragments,
    webhookEventNames
} from '../../../../scripts/contracts/asyncapi-webhook-events';

describe('webhookEventFragments', () => {
    it('finds every module that ships a fragment, the shop modules first', () => {
        const owners = webhookEventFragments().map((file) => file.split('/').at(-2));

        expect(owners).toEqual(['orders', 'delivery', 'payments', 'returns', 'example', 'users']);
    });
});

describe('webhookEventNames', () => {
    it('lists the channels of every fragment once, in fragment order', () => {
        const names = webhookEventNames();

        expect(names.slice(0, 3)).toEqual(['order.created', 'order.paid', 'order.canceled']);
        expect(new Set(names).size).toBe(names.length);
        expect(names).toContain('payment.refunded');
    });
});

describe('the money in a webhook payload', () => {
    /** Every payload schema of the public bundle with its properties, however it is named. */
    const payloads = (): [string, Record<string, Record<string, unknown>>][] => {
        const bundle = parseYaml(readFileSync(path.join(REPO_ROOT, 'asyncapi.public.yaml'), 'utf8')) as {
            components: { schemas: Record<string, { properties?: Record<string, Record<string, unknown>> }> };
        };
        return Object.entries(bundle.components.schemas)
            .filter(([name]) => name.endsWith('Payload'))
            .map(([name, schema]) => [name, schema.properties ?? {}]);
    };

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
