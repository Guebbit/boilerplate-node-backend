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
 * It also sets the one Zammad system setting our retention clock rests on (`LAST_CONTACT_SETTING`),
 * and gives the integration role `read` on every group (retention must see every ticket), failing
 * closed: a group the role still cannot read stops the run, and only a passing run leaves the
 * marker retention asks for.
 *
 * @see docs/modules/zammad.md#setup
 */

import { z } from 'zod';
import { TaskCategory } from '@types';
import { callZammad } from '../client';
import { zammadSettings, type ZammadSettings } from '../config';
import { clearGroupsVerified, markGroupsVerified } from '../repository';

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
    /** Group access the integration role lacked and was given, as `<group>: +<access>`. */
    roleGranted: string[];
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
 * The role the integration user holds. The installer creates it by this exact name and gives it to
 * the integration user (`docs/modules/zammad.md#setup`, step 5); setup finds it by the name.
 */
const INTEGRATION_ROLE = 'Shop integration';

/** A role as Zammad lists it: the group access it grants, by group id. */
const roleRow = z.object({
    id: z.number(),
    name: z.string(),
    group_ids: z.record(z.string(), z.array(z.string())).optional()
});

/** Every group, with the name the intake setting refers to. */
const groupRows = z.array(z.object({ id: z.number(), name: z.string() }));

/**
 * Whether a list of access words includes `access`. `full` stands for every one of them.
 *
 * @param held - what the role holds on one group
 * @param access - `read`, `create` or `change`
 */
const holds = (held: readonly string[], access: string): boolean =>
    held.includes(access) || held.includes('full');

/**
 * Give the integration role `read` on every group and `create` and `change` on the intake group only
 * (a spam ticket is closed and tagged after it is made, which Zammad answers 403 without `change`), adding
 * only what is missing, then read the role back and fail unless it reads every group.
 *
 * @param settings - Zammad's address, the intake group's name and an ADMIN token
 * @returns what was added, as `<group>: +<access>`; empty when the role was already right
 * @throws {Error} when the role or the intake group is missing, or a group is still unreadable
 * @throws {ZammadRequestError} when Zammad refuses a call
 */
const ensureIntegrationRole = async (settings: ZammadSettings): Promise<string[]> => {
    const roles = await callZammad(settings, 'GET', '/roles', undefined, z.array(roleRow));
    const role = roles.find(({ name }) => name === INTEGRATION_ROLE);
    if (!role)
        throw new Error(
            `Zammad has no role named "${INTEGRATION_ROLE}": create it and give it to the integration user (docs/modules/zammad.md#setup, step 5).`
        );
    const groups = await callZammad(settings, 'GET', '/groups', undefined, groupRows);
    const intake = groups.find(({ name }) => name === settings.group);
    if (!intake)
        throw new Error(`Zammad has no group named "${settings.group}" (NODE_ZAMMAD_GROUP).`);

    const wanted: Record<string, string[]> = { ...role.group_ids };
    const granted: string[] = [];
    for (const group of groups) {
        const access = [...(wanted[String(group.id)] ?? [])];
        for (const needed of group.id === intake.id ? ['read', 'create', 'change'] : ['read']) {
            if (holds(access, needed)) continue;
            access.push(needed);
            granted.push(`${group.name}: +${needed}`);
        }
        wanted[String(group.id)] = access;
    }
    if (granted.length > 0)
        await callZammad(
            settings,
            'PUT',
            `/roles/${String(role.id)}`,
            { group_ids: wanted },
            roleRow
        );

    // Fail closed: what Zammad holds now, not what we asked for, decides.
    const after = await callZammad(
        settings,
        'GET',
        `/roles/${String(role.id)}`,
        undefined,
        roleRow
    );
    const unreadable = groups.filter(
        ({ id }) => !holds(after.group_ids?.[String(id)] ?? [], 'read')
    );
    if (unreadable.length > 0)
        throw new Error(
            `The role "${INTEGRATION_ROLE}" cannot read: ${unreadable.map(({ name }) => name).join(', ')}.`
        );
    return granted;
};

/**
 * Create or update every field, run the pending migration when a field was created, set the
 * system settings, then give the integration role its group access.
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
    const report: SetupReport = { created: [], updated: [], settingsChanged: [], roleGranted: [] };

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
    report.roleGranted = await ensureIntegrationRole(settings);

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
    // The old marker goes first: a run that fails (a new group the role cannot read) leaves none.
    return clearGroupsVerified()
        .then(() => ensureTicketFields({ ...settings, token: adminToken }))
        .then((report) =>
            // Only a run that read every group back leaves the marker retention asks for.
            markGroupsVerified(new Date()).then(() => report)
        );
};
