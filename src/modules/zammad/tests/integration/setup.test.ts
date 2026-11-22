/**
 * @module
 * `zammad:setup` creates our ticket fields once, updates them on a second run, and runs the
 * migration only when a field was created (the one case that restarts Zammad). It also sets the
 * last-contact setting the retention clock rests on, only when Zammad holds another value.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { TaskCategory } from '@types';
import { zammadService } from '../../services';
import { useZammad } from '../harness';

setupTestDb();

/** The stub of the case that is running, a Zammad whose setup never ran. */
const zammad = useZammad({ fieldsExist: false });

describe('setupTicketFields', () => {
    it('creates every field, with one option per task category, then migrates once', async () => {
        const report = await zammadService.setupTicketFields(zammad().token);

        expect(report.created.toSorted()).toEqual([
            'order_number',
            'request_ref',
            'shop_account',
            'shop_category',
            'shop_sender_verified'
        ]);
        expect(report.updated).toEqual([]);
        expect(zammad().migrations()).toBe(1);

        const category = zammad().attributes.get('shop_category');
        expect(category?.body).toMatchObject({
            object: 'Ticket',
            data_type: 'select',
            data_option: {
                options: Object.fromEntries(Object.values(TaskCategory).map((v) => [v, v]))
            }
        });
    });

    it('is idempotent: a second run updates what exists and migrates nothing', async () => {
        await zammadService.setupTicketFields(zammad().token);
        const second = await zammadService.setupTicketFields(zammad().token);

        expect(second.created).toEqual([]);
        expect(second.updated).toHaveLength(5);
        expect(zammad().migrations()).toBe(1);
        expect(zammad().attributes.size).toBe(5);
    });

    it('sets the last-contact behaviour to the customer reaction when Zammad holds its default', async () => {
        const report = await zammadService.setupTicketFields(zammad().token);

        expect(report.settingsChanged).toEqual(['ticket_last_contact_behaviour']);
        expect(zammad().settings.get('ticket_last_contact_behaviour')?.value).toBe(
            'based_on_customer_reaction'
        );
    });

    it('leaves the setting alone when it is already right, writing nothing', async () => {
        await zammadService.setupTicketFields(zammad().token);
        const writesBefore = zammad().requests.filter(
            ({ method, path }) => method === 'PUT' && path.startsWith('/settings/')
        ).length;

        const second = await zammadService.setupTicketFields(zammad().token);
        const writesAfter = zammad().requests.filter(
            ({ method, path }) => method === 'PUT' && path.startsWith('/settings/')
        ).length;

        expect(second.settingsChanged).toEqual([]);
        expect(writesAfter).toBe(writesBefore);
    });

    it('refuses a Zammad that does not list the setting, rather than carrying on without it', async () => {
        zammad().settings.delete('ticket_last_contact_behaviour');

        await expect(zammadService.setupTicketFields(zammad().token)).rejects.toThrow(
            /has no setting ticket_last_contact_behaviour/
        );
    });

    it('lets a Zammad that has the fields keep request_ref on a ticket', async () => {
        await zammadService.setupTicketFields(zammad().token);

        expect(zammad().attributes.has('request_ref')).toBe(true);
    });

    it('refuses a token Zammad does not accept', async () => {
        await expect(zammadService.setupTicketFields('wrong')).rejects.toMatchObject({
            status: 401
        });
    });
});
