/**
 * @module
 * The provider-reference lookup refuses an operator object where the intent id belongs, even when a
 * caller reaches it past the webhook port's parse.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { paymentRepository } from '../../repository';

setupTestDb();

describe('paymentRepository.findByProviderRef', () => {
    it('fails the cast on an operator instead of matching every payment', async () => {
        // `JSON.parse` yields `any`: the single `as string` is the lie this test tells on purpose.
        const operator = JSON.parse('{"$ne": null}') as string;

        await expect(paymentRepository.findByProviderRef(operator)).rejects.toThrow(
            /Cast to string failed/u
        );
    });
});
