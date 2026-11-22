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
 * It also sets the one Zammad system setting our retention clock rests on (`LAST_CONTACT_SETTING`).
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

/** The one Zammad system setting we need: its key. */
const LAST_CONTACT_SETTING = 'ticket_last_contact_behaviour';

/**
 * Its wanted value. Zammad's default (`check_if_agent_already_replied`) ignores a customer's
 * second message, so the retention clock would not move on it. `based_on_customer_reaction` moves
 * it on every customer message and not on an internal note.
 */
const LAST_CONTACT_VALUE = 'based_on_customer_reaction';

/**
 * The settings Zammad lists: key, id and the value held now. Zammad lists ~300 and some hold a
 * `state_current` with no `value`, so `value` is optional: only our own key is ever read.
 */
const settingRows = z.array(
    z.object({
        id: z.number(),
        name: z.string(),
        state_current: z.object({ value: z.unknown().optional() }).optional()
    })
);

/** What a run did. */
export interface SetupReport {
    /** Fields that did not exist and were created: a Zammad restart follows. */
    created: string[];
    /** Fields that existed and were brought up to date. */
    updated: string[];
    /** System settings that held another value and were changed; one already right is left alone. */
    settingsChanged: string[];
}

/**
 * Set the last-contact setting, writing only when Zammad holds another value.
 *
 * @param settings - Zammad's address and an ADMIN token
 * @returns the key when it was changed, nothing when it was already right
 * @throws {Error} when Zammad does not list the setting
 * @throws {ZammadRequestError} when Zammad refuses a call
 */
const ensureLastContactSetting = async (settings: ZammadSettings): Promise<string[]> => {
    const rows = await callZammad(settings, 'GET', '/settings', undefined, settingRows);
    const row = rows.find((setting) => setting.name === LAST_CONTACT_SETTING);
    if (!row) throw new Error(`Zammad has no setting ${LAST_CONTACT_SETTING}.`);
    if (row.state_current?.value === LAST_CONTACT_VALUE) return [];

    // `state_current.value` is the whole write: Zammad's admin screen sends the same body.
    await callZammad(
        settings,
        'PUT',
        `/settings/${String(row.id)}`,
        { state_current: { value: LAST_CONTACT_VALUE } },
        z.unknown()
    );
    return [LAST_CONTACT_SETTING];
};

/**
 * Create or update every field, run the pending migration when a field was created, then set the
 * system settings.
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
    const report: SetupReport = { created: [], updated: [], settingsChanged: [] };

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

    report.settingsChanged = await ensureLastContactSetting(settings);

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
