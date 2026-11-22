/**
 * @module
 * Zammad's half of the account data export: the customer, their tickets, every article (internal
 * notes included, author left out) and the files the customer sent. When Zammad cannot be read the
 * whole export fails, because an incomplete Art. 15 answer must never look like a complete one.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { personalDataSubjectOf } from '@modules/users';
import { zammadService } from '../../services';
import { upsertCustomer } from '../../repository';
import { useZammad } from '../harness';

setupTestDb();

/** The stub of the case that is running. */
const zammad = useZammad();

/** One mebibyte in bytes. */
const MIB = 1_048_576;

/** A customer with one ticket: the customer's mail with a file, a staff reply and an internal note. */
const seedConversation = (customerId: number, email: string) => {
    zammad().addUser({ id: customerId, email, firstname: 'Ada', lastname: 'Lovelace' });
    return zammad().addTicket({
        customerId,
        createdAt: '2026-01-01T10:00:00.000Z',
        title: 'Parcel',
        articles: [
            {
                sender: 'Customer',
                from: `Ada <${email}>`,
                to: 'desk@example.com',
                body: 'Where is it?',
                attachments: [
                    {
                        filename: 'photo.png',
                        contentType: 'image/png',
                        data: Buffer.from('PNGDATA')
                    }
                ]
            },
            { sender: 'Agent', from: 'Grace Hopper <grace@shop.test>', body: 'On its way.' },
            {
                sender: 'Agent',
                internal: true,
                from: 'Grace Hopper <grace@shop.test>',
                body: 'Customer is polite.',
                attachments: [
                    { filename: 'staff.txt', contentType: 'text/plain', data: Buffer.from('NOTE') }
                ]
            }
        ]
    });
};

describe('the zammad section', () => {
    it('carries the customer, the tickets, every article, and the files the customer sent', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await upsertCustomer(user.id, 612);
        seedConversation(612, 'ada@example.com');

        const section = await zammadService.collectPersonalData(personalDataSubjectOf(user));

        expect(section.customers).toHaveLength(1);
        const [customer] = section.customers ?? [];
        expect(customer).toMatchObject({ id: 612, email: 'ada@example.com' });
        const [{ articles }] = customer.tickets;
        expect(articles.map((article) => article.body)).toEqual([
            'Where is it?',
            'On its way.',
            'Customer is polite.'
        ]);
        // The customer's own file travels with the export, byte for byte.
        expect(articles[0].attachments).toEqual([
            {
                filename: 'photo.png',
                contentType: 'image/png',
                size: 7,
                contentBase64: Buffer.from('PNGDATA').toString('base64')
            }
        ]);
    });

    it('leaves the author off everything the customer did not write, and staff files out', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await upsertCustomer(user.id, 612);
        seedConversation(612, 'ada@example.com');

        const section = await zammadService.collectPersonalData(personalDataSubjectOf(user));

        const serialised = JSON.stringify(section);
        expect(serialised).not.toContain('grace@shop.test');
        expect(serialised).not.toContain('Grace Hopper');
        expect(serialised).not.toContain('staff.txt');
        // The customer's own address, on their own message, stays.
        expect(serialised).toContain('Ada <ada@example.com>');
    });

    it('finds a customer who wrote under the verified address before there was an account', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        seedConversation(700, 'ada@example.com');

        const section = await zammadService.collectPersonalData(personalDataSubjectOf(user));

        expect(section.customers?.map(({ id }) => id)).toEqual([700]);
    });

    it('does not answer for an unverified address: anyone can sign up with a stranger’s', async () => {
        const user = await createUser({ email: 'victim@example.com' });
        seedConversation(700, 'victim@example.com');

        const section = await zammadService.collectPersonalData(personalDataSubjectOf(user));

        expect(section.customers).toEqual([]);
    });

    it('carries only this customer’s tickets even when Zammad ignores the search condition', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await upsertCustomer(user.id, 612);
        seedConversation(612, 'ada@example.com');
        const other = zammad().addTicket({
            customerId: 999,
            createdAt: '2026-02-01T00:00:00.000Z',
            title: 'Someone else’s',
            articles: [{ body: 'Private words of another person' }]
        });
        zammad().searchQuirks({ ignoreConditions: true });

        const section = await zammadService.collectPersonalData(personalDataSubjectOf(user));

        expect(JSON.stringify(section)).not.toContain('Private words of another person');
        expect(section.customers?.[0].tickets.map(({ id }) => id)).not.toContain(other.id);
    });

    it('rejects, never returns a part of the list, when Zammad answers the same ticket page for every page', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await upsertCustomer(user.id, 612);
        zammad().addUser({ id: 612, email: 'ada@example.com' });
        for (let index = 0; index < 120; index += 1)
            zammad().addTicket({ customerId: 612, createdAt: '2026-01-01T00:00:00.000Z' });
        zammad().searchQuirks({ ignorePaging: true });

        await expect(
            zammadService.collectPersonalData(personalDataSubjectOf(user))
        ).rejects.toThrow('does not page');
    });

    it('fails the export when one file is over the per-file cap, instead of shrinking it', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await upsertCustomer(user.id, 612);
        zammad().addUser({ id: 612, email: 'ada@example.com' });
        zammad().addTicket({
            customerId: 612,
            createdAt: '2026-01-01T10:00:00.000Z',
            articles: [
                {
                    sender: 'Customer',
                    body: 'Big file',
                    attachments: [
                        {
                            filename: 'big.bin',
                            contentType: 'application/octet-stream',
                            data: Buffer.alloc(51 * MIB)
                        }
                    ]
                }
            ]
        });

        await expect(
            zammadService.collectPersonalData(personalDataSubjectOf(user))
        ).rejects.toThrow('longer than');
    });

    it('fails the export when the files together pass the total cap, though each is under the per-file one', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await upsertCustomer(user.id, 612);
        zammad().addUser({ id: 612, email: 'ada@example.com' });
        zammad().addTicket({
            customerId: 612,
            createdAt: '2026-01-01T10:00:00.000Z',
            articles: [
                {
                    sender: 'Customer',
                    body: 'Two files',
                    attachments: [
                        {
                            filename: 'a.bin',
                            contentType: 'application/octet-stream',
                            data: Buffer.alloc(33 * MIB)
                        },
                        {
                            filename: 'b.bin',
                            contentType: 'application/octet-stream',
                            data: Buffer.alloc(33 * MIB)
                        }
                    ]
                }
            ]
        });

        await expect(
            zammadService.collectPersonalData(personalDataSubjectOf(user))
        ).rejects.toThrow('longer than');
    });

    it('skips a mapped customer Zammad no longer has', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await upsertCustomer(user.id, 612);

        const section = await zammadService.collectPersonalData(personalDataSubjectOf(user));

        expect(section.customers).toEqual([]);
    });
});

describe('Zammad down', () => {
    it('rejects, so the whole export fails and is never a partial answer', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        await upsertCustomer(user.id, 612);
        zammad().goDown();

        await expect(
            zammadService.collectPersonalData(personalDataSubjectOf(user))
        ).rejects.toThrow('Zammad answered 503');
    });
});

describe('the module off', () => {
    it('leaves the section as it was without Zammad: no customers, no call', async () => {
        const user = await createUser({ email: 'ada@example.com', verifiedAt: new Date() });
        setEnvironment({ NODE_ZAMMAD_URL: undefined });
        const before = zammad().requests.length;

        const section = await zammadService.collectPersonalData(personalDataSubjectOf(user));

        expect(section).toEqual({ pendingContacts: [] });
        expect(zammad().requests).toHaveLength(before);
    });
});
