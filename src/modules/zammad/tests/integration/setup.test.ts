/**
 * @module
 * `zammad:setup` creates our ticket fields once, updates them on a second run, and runs the
 * migration only when a field was created (the one case that restarts Zammad). It also sets the
 * last-contact setting the retention clock rests on, only when Zammad holds another value.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { TaskCategory } from '@types';
import { zammadService } from '../../services';
import { groupsVerified } from '../../repository';
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

/** The writes the stub saw for the integration role. */
const roleWrites = () =>
    zammad().requests.filter(({ method, path }) => method === 'PUT' && path === '/roles/9');

describe('the integration role', () => {
    it('is given read on every group, and create and change on the intake group only, then marks the groups verified', async () => {
        const report = await zammadService.setupTicketFields(zammad().token);

        expect(report.roleGranted).toEqual([
            'Support: +read',
            'Support: +create',
            'Support: +change',
            'Billing: +read'
        ]);
        expect(zammad().roles.get(9)?.group_ids).toEqual({
            '1': ['read', 'create', 'change'],
            '2': ['read']
        });
        expect(await groupsVerified()).toBe(true);
    });

    it('adds only what is missing: a second run writes nothing, and `full` counts as every access', async () => {
        await zammadService.setupTicketFields(zammad().token);
        const writesAfterFirst = roleWrites().length;

        const second = await zammadService.setupTicketFields(zammad().token);
        expect(second.roleGranted).toEqual([]);
        expect(roleWrites()).toHaveLength(writesAfterFirst);

        // A role that holds `full` on a group needs nothing more there.
        zammad().roles.set(9, { id: 9, name: 'Shop integration', group_ids: { '1': ['full'] } });
        const third = await zammadService.setupTicketFields(zammad().token);
        expect(third.roleGranted).toEqual(['Billing: +read']);
        expect(zammad().roles.get(9)?.group_ids['1']).toEqual(['full']);
    });

    it('leaves no marker when a later run fails: a new group the role cannot read', async () => {
        await zammadService.setupTicketFields(zammad().token);
        expect(await groupsVerified()).toBe(true);

        zammad().groups.set(3, { id: 3, name: 'Escalations' });
        zammad().ignoreRoleWrites();
        await expect(zammadService.setupTicketFields(zammad().token)).rejects.toThrow(
            /cannot read: Escalations/u
        );

        expect(await groupsVerified()).toBe(false);
    });

    it('fails, with no marker, when the intake group does not exist', async () => {
        setEnvironment({ NODE_ZAMMAD_GROUP: 'No such group' });

        await expect(zammadService.setupTicketFields(zammad().token)).rejects.toThrow(
            /no group named "No such group"/u
        );
        expect(await groupsVerified()).toBe(false);
    });

    it('fails, with no marker, when the role does not exist', async () => {
        zammad().roles.clear();

        await expect(zammadService.setupTicketFields(zammad().token)).rejects.toThrow(
            /no role named "Shop integration"/u
        );
        expect(await groupsVerified()).toBe(false);
    });

    it('fails closed, with no marker, when Zammad leaves a group unreadable after the grant', async () => {
        zammad().ignoreRoleWrites();

        await expect(zammadService.setupTicketFields(zammad().token)).rejects.toThrow(
            /cannot read: Support, Billing/u
        );
        expect(await groupsVerified()).toBe(false);
    });
});
