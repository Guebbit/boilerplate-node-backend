import { parseDocument } from 'yaml';
import {
    webhookEventFragments,
    withWebhookEvents
} from '../../../../scripts/contracts/asyncapi-webhook-events';

/** A section document with nothing in it, standing in for any section's parsed file. */
const emptySection = () => parseDocument('asyncapi: 3.0.0\n');

describe('webhookEventFragments', () => {
    it('finds every module that ships a fragment, the shop modules first', () => {
        const owners = webhookEventFragments().map((file) => file.split('/').at(-2));

        expect(owners).toEqual(['orders', 'payments', 'returns', 'example']);
    });
});

describe('withWebhookEvents', () => {
    it('merges one fragment per owner into the webhooks section', () => {
        const merge = jest.fn();
        const document = emptySection();

        const result = withWebhookEvents('webhooks', document, merge);

        expect(result).toBe(document);
        expect(merge.mock.calls.map((call) => call[1])).toEqual([
            'orders',
            'payments',
            'returns',
            'example'
        ]);
    });

    it('leaves every other section alone', () => {
        const merge = jest.fn();

        withWebhookEvents('observability', emptySection(), merge);

        expect(merge).not.toHaveBeenCalled();
    });
});
