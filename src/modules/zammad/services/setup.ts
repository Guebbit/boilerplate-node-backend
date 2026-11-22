/**
 * @module
 * `zammad:setup`: create or update our ticket fields in Zammad, idempotently. Zammad drops a field
 * it does not know silently, so without these the category, order number and dedup stamp would
 * never be stored. Run once by the technician with an ADMIN token used only here; the runtime
 * token has no `admin.object` and needs none, because setting a field at create is plain data.
 *
 * Creating a field forces one Zammad restart (its own `auto_shutdown`; compose brings it back).
 * Changing a select's options later is configuration only: no migration, no restart.
 *
 * @see docs/modules/zammad.md#setup
 */

import { z } from 'zod';
import { TaskCategory } from '@types';
import { callZammad } from '../client';
import { zammadSettings, type ZammadSettings } from '../config';

/** One of our ticket fields, as the object manager takes it. */
interface FieldSpec {
    name: string;
    display: string;
    data_type: 'select' | 'input' | 'boolean';
    data_option: Record<string, unknown>;
}

/**
 * The fields, from the bundled enum. `shop_category` lists every `TaskCategory` the build has, so
 * the options cannot drift from the code.
 */
const fieldSpecs = (): FieldSpec[] => [
    {
        name: 'shop_category',
        display: 'Shop category',
        data_type: 'select',
        data_option: {
            options: Object.fromEntries(Object.values(TaskCategory).map((value) => [value, value])),
            default: '',
            null: true,
            nulloption: true,
            translate: false
        }
    },
    {
        name: 'order_number',
        display: 'Order number',
        data_type: 'input',
        data_option: { type: 'text', maxlength: 120, null: true }
    },
    {
        name: 'request_ref',
        display: 'Request reference',
        data_type: 'input',
        data_option: { type: 'text', maxlength: 64, null: true }
    },
    {
        name: 'shop_sender_verified',
        display: 'Sender verified',
        data_type: 'boolean',
        data_option: {
            default: false,
            options: { true: 'yes', false: 'no' },
            null: true,
            translate: true
        }
    },
    {
        name: 'shop_account',
        display: 'Shop account',
        data_type: 'input',
        data_option: { type: 'url', maxlength: 250, null: true }
    }
];

/** The attributes Zammad already holds, narrowed to what we compare. */
const existingAttributes = z.array(
    z.object({ id: z.number(), name: z.string(), object: z.string() })
);

/** What Zammad answers to a save: the saved attribute. */
const savedAttribute = z.object({ id: z.number() });

/** What a run did. */
export interface SetupReport {
    /** Fields that did not exist and were created: a Zammad restart follows. */
    created: string[];
    /** Fields that existed and were brought up to date. */
    updated: string[];
}

/**
 * Create or update every field, then run the pending migration when a field was created.
 *
 * @param settings - Zammad's address and an ADMIN token
 * @returns what changed
 * @throws {ZammadRequestError} when Zammad refuses a call
 */
export const ensureTicketFields = async (settings: ZammadSettings): Promise<SetupReport> => {
    const attributes = await callZammad(
        settings,
        'GET',
        '/object_manager_attributes',
        undefined,
        existingAttributes
    );
    const report: SetupReport = { created: [], updated: [] };

    // Sequential: one object-manager write at a time, as Zammad's own admin screen does.
    for (const spec of fieldSpecs()) {
        const existing = attributes.find(
            (attribute) => attribute.object === 'Ticket' && attribute.name === spec.name
        );
        const body = {
            object: 'Ticket',
            name: spec.name,
            display: spec.display,
            data_type: spec.data_type,
            data_option: spec.data_option,
            active: true,
            screens: {
                create_middle: { 'ticket.agent': { shown: true, required: false } },
                edit: { 'ticket.agent': { shown: true, required: false } }
            }
        };
        await (existing
            ? callZammad(
                  settings,
                  'PUT',
                  `/object_manager_attributes/${String(existing.id)}`,
                  body,
                  savedAttribute
              )
            : callZammad(settings, 'POST', '/object_manager_attributes', body, savedAttribute));
        (existing ? report.updated : report.created).push(spec.name);
    }

    if (report.created.length > 0)
        await callZammad(
            settings,
            'POST',
            '/object_manager_attributes_execute_migrations',
            {},
            z.unknown()
        );

    return report;
};

/**
 * Run the setup against the configured Zammad with an admin token.
 *
 * @param adminToken - an Admin user's token, used for this run only and never stored
 * @throws {Error} when `NODE_ZAMMAD_URL` is unset
 * @throws {ZammadRequestError} when Zammad refuses a call
 */
export const setupTicketFields = (adminToken: string): Promise<SetupReport> => {
    const settings = zammadSettings();
    if (!settings)
        return Promise.reject(new Error('NODE_ZAMMAD_URL is not set: nothing to set up.'));
    return ensureTicketFields({ ...settings, token: adminToken });
};
