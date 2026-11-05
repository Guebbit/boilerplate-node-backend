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

        expect(names.slice(0, 3)).toEqual(['order.created', 'order.paid', 'order.cancelled']);
        expect(new Set(names).size).toBe(names.length);
        expect(names).toContain('payment.refunded');
    });
});
