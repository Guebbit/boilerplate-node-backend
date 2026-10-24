/**
 * A draft language's product text is written, stored and listed for the editor, and never reaches
 * a customer.
 *
 * The storefront reads already drop it (`locales/tests/integration/translations.test.ts`). These
 * are the other doors: a message that OUTLIVES the product copies its names in (an inbox row, a
 * stream, an export, a mail), and the names it copies are what a customer reads back later. Every
 * door is driven through the real modules, since the leak was two modules and a port apart.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { createProduct } from '@modules/products/tests/factories';
import { userModel } from '@modules/users/model';
import { productService } from '@modules/products';
import { givenLocale } from '@modules/locales/tests/factories';
import { localeService } from '@modules/locales/services';
import { inventoryService } from '@modules/inventory';
import { resolveTranslatables, registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { STOCK_ALERT_SENT } from '@modules/stock-alerts/events';
import { testCallerContext } from '@tests/callers';
import { enabledModules } from '../../src/modules';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = jest.mocked(enqueueEmail);

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    registerModules(enabledModules);
    localeService.setTranslatables(resolveTranslatables(enabledModules));
});

afterEach(() => jest.clearAllMocks());

afterAll(() => {
    localeService.setTranslatables({});
});

/** The title nobody but an editor may read. */
const DRAFT_TITLE = 'Tazza segreta';

/**
 * A product with an English column title, a live Italian row and a DRAFT French row.
 *
 * @param overrides - product fields beyond the title, e.g. `onHand`
 */
const productWithDraftFrench = async (overrides: { onHand?: number } = {}) => {
    await givenLocale('en');
    await givenLocale('it');
    await givenLocale('fr', { active: false });
    const product = await createProduct({ title: 'Blue mug', ...overrides });
    const id = String(product._id);
    await localeService.upsertEntityTranslations('product', id, {
        it: { fields: { title: 'Tazza blu' } },
        fr: { fields: { title: DRAFT_TITLE } }
    });
    return id;
};

describe('the names a message outlives its product with', () => {
    it('leave a draft language out, and take it in once the language goes live', async () => {
        const id = await productWithDraftFrench();

        await expect(productService.titlesById(id)).resolves.toEqual({
            en: 'Blue mug',
            it: 'Tazza blu'
        });

        await localeService.updateLanguage('fr', { active: true });

        await expect(productService.titlesById(id)).resolves.toEqual({
            en: 'Blue mug',
            it: 'Tazza blu',
            fr: DRAFT_TITLE
        });
    });
});

describe('a back-in-stock mail and its event', () => {
    it('never carry a draft title, even for a buyer whose stored language is the draft one', async () => {
        const id = await productWithDraftFrench({ onHand: 0 });
        const { bearer, user } = await authenticateAsRole('customer');
        // Not validated against the supported list: a profile may name any language.
        await userModel.updateOne({ _id: user._id }, { locale: 'fr' });
        await api().post(`/stock-alerts/${id}`).set('Authorization', bearer);

        await inventoryService.receive(id, 3, undefined, testCallerContext);
        await settleOutboxNudges();

        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(mockEnqueueEmail.mock.calls[0])).not.toContain(DRAFT_TITLE);
        expect(mockEnqueueEmail.mock.calls[0]?.[2]).toMatchObject({
            body: expect.stringContaining('Blue mug')
        });
        const sent = await outboxEventModel.find({ name: STOCK_ALERT_SENT }).lean().exec();
        expect(JSON.stringify(sent)).not.toContain(DRAFT_TITLE);
    });
});

describe('the editor', () => {
    it('still lists the draft row on the admin read', async () => {
        const id = await productWithDraftFrench();
        const { bearer } = await authenticateAs('admin');

        const response = await api().get(`/products/${id}/admin`).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.translations.fr).toMatchObject({ title: DRAFT_TITLE });
    });
});
