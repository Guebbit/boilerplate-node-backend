/**
 * @module
 * What the locale updates say about an edit: a language's display fields by value, an entry's text
 * never (the key and the fact that the `value` moved are enough; the trail is not a second copy of
 * the dictionary).
 */

import { FRONTEND } from '../unit/apps.fixture';
import { setupTestDb } from '@tests/setup-test-db';
import { observePort } from '@tests/ports';
import { testCallerContext } from '@tests/callers';
import { makeLocale, makeLocaleEntry } from '@modules/locales/factories';
import { localeRepository, localeEntryRepository } from '@modules/locales/repository';
import { localeService } from '@modules/locales/services';
import { localeAuditActions } from '@modules/locales/audit';
import * as auditPort from '@infrastructure/observability/audit';

/* The audit port is replaced, not spied on — see `tests/support/ports.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** The `metadata` of the row written under `action`. */
const metadataOf = (
    spy: jest.SpiedFunction<typeof auditPort.emitAuditEvent>,
    action: string
): unknown =>
    spy.mock.calls.map(([entry]) => entry).find((entry) => entry.action === action)?.metadata;

describe('localeService.updateLanguage — the audit row', () => {
    it('carries each display field that moved, old and new', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        await localeRepository.create(makeLocale({ tag: 'es', name: 'es', nativeName: 'es' }));

        await localeService.updateLanguage(
            'es',
            { name: ' Spanish ', direction: 'rtl' },
            testCallerContext
        );

        expect(metadataOf(auditSpy, localeAuditActions.ADMIN_LOCALE_UPDATED)).toEqual({
            changes: {
                name: { from: 'es', to: 'Spanish' },
                direction: { from: 'ltr', to: 'rtl' }
            }
        });
    });
});

describe('localeService.deactivateLanguage — the audit row', () => {
    it('carries the active flag, old and new', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        await localeRepository.create(makeLocale({ tag: 'es', name: 'es', nativeName: 'es' }));

        await localeService.deactivateLanguage('es', testCallerContext);

        expect(metadataOf(auditSpy, localeAuditActions.ADMIN_LOCALE_DEACTIVATED)).toEqual({
            changes: { active: { from: true, to: false } }
        });
    });
});

describe('localeService.updateEntry — the audit row', () => {
    it('names the value as moved and keeps the key, never the text', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        await localeRepository.create(makeLocale({ tag: 'es', name: 'es', nativeName: 'es' }));
        const entry = await localeEntryRepository.create(
            makeLocaleEntry({ locale: 'es', app: FRONTEND, key: 'cart.title', value: 'Carrito' })
        );

        await localeService.updateEntry(
            'es',
            FRONTEND,
            String(entry._id),
            { value: 'Cesta' },
            testCallerContext
        );

        expect(metadataOf(auditSpy, localeAuditActions.ADMIN_LOCALE_ENTRY_UPDATED)).toEqual({
            locale: 'es',
            app: FRONTEND,
            key: 'cart.title',
            changedFields: ['value']
        });
    });
});
