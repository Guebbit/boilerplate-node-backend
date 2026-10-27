/**
 * @module
 * The runtime files of a scaffolded module, as plain template literals. The shape is the
 * `example` module's core, cut to an admin collection: a name and optional notes, keyed
 * list / create / replace / patch / delete behind one gate. Each file opens with the header
 * `example` gives its twin: its role in ANY module, then what it does here. Prettier reformats the
 * output, so the templates are written for readability, not for final layout.
 *
 * Generated comments avoid backticks: they would need escaping inside these template literals.
 */

import type { ScaffoldOptions } from './options';
import { RULE_ACTIONS, permissionSetName, type ModuleNames } from './names';

/** The `module.yaml` body. */
export const moduleYaml = (options: ScaffoldOptions): string =>
    [
        `summary: '${options.summary.replaceAll("'", "''")}'`,
        'subdomain: generic',
        `group: ${options.group}`,
        'dependsOn: []',
        ...(options.audit
            ? []
            : [
                  "noAudit: 'TODO: say why this module records no audit action, or drop this line and add an audit.ts.'"
              ]),
        ''
    ].join('\n');

/** The manifest the registry imports. */
export const moduleManifest = (names: ModuleNames): string => `/**
 * @module
 * In any module: the manifest below is everything this module asks the application to do for it.
 * Each optional capability is one entry here plus its own files, and each can be deleted alone.
 * Here: ${names.words}, a keyed collection an admin lists, reads, creates, edits and deletes.
 * Scaffolded from the example module's core; replace this paragraph with what the domain is and
 * what it deliberately does not reach.
 *
 * See: docs/theory/modules.md#the-module-template, docs/modules/${names.kebab}.md
 */

import type { AppModule } from '@kernel/registry';
import { router } from './routes';

/** This module's manifest entry: one admin router, guarded by ${names.entity} permissions. */
export default {
    name: '${names.kebab}',
    mounts: [{ basePath: '${names.basePath}', routes: router }],
    // 'none' is the reviewed answer for a collection with no user-linked field. Change it to a
    // section the moment a record names a person.
    personalData: 'none'
} satisfies AppModule;
`;

/** The convenience barrel. */
export const barrel = (names: ModuleNames): string => `/**
 * @module
 * In any module: the public barrel, the only surface a sibling may import. It exports services,
 * domain rules, events and emails, and the model's TYPES. Never a repository, the model's runtime
 * value, a wiring file or factories.ts.
 * Here: the ${names.entityCamel} service and its domain rules.
 *
 * See: docs/theory/strategic-ddd.md, docs/modules/${names.kebab}.md
 */

export * from './services';

export * from './domain';

export type * from './model';
`;

/** The four actions a scaffolded module audits, as `rules.yaml` lists them. */
export const auditEntries = (names: ModuleNames): { value: string; description: string }[] =>
    [
        ['viewed', 'was read'],
        ['created', 'was created'],
        ['updated', 'was edited'],
        ['deleted', 'was deleted']
    ].map(([verb, what]) => ({
        value: `admin.${names.entitySnake}.${verb}`,
        description: `A ${names.words.replace(/s$/, '')} ${what}.`
    }));

/** The audit names as data; present unless the module opted out. */
export const rulesYaml = (names: ModuleNames): string =>
    [
        '# This module audit names, as data the PHP twin copies.',
        '#',
        '# Not read at boot. npm run regenerate writes rules.generated.ts from it, because the strings',
        '# type the app-wide AuditActionMap union. The constant key is derived from value: uppercase,',
        '# dot to underscore.',
        'audit:',
        ...auditEntries(names).flatMap((entry) => [
            `    - value: ${entry.value}`,
            `      description: ${entry.description}`
        ]),
        ''
    ].join('\n');

/** The schema of rules.yaml and what regenerate writes from it. */
export const rulesSchemaFile = (names: ModuleNames): string => String.raw`/**
 * @module
 * In any module: the schema of rules.yaml (the audit and analytics names, as data the PHP twin
 * copies) and what npm run regenerate writes from it.
 * Here: the audit names of a ${names.entityCamel}.
 *
 * See: docs/theory/shared-rules.md
 */

import { z } from 'zod';
import {
    keyedListSchema,
    type GenerateSpec
} from '../../infrastructure/config/shared-rules/generate-spec';

/** Shape of rules.yaml. */
export const rulesSchema = z.strictObject({
    /** Dotted noun.verb strings, unique across modules. */
    audit: keyedListSchema(/^[a-z_]+(\.[a-z_]+)+$/)
});

/** What rules.yaml generates: rules.generated.ts. */
export const rulesGenerate: GenerateSpec = {
    out: 'src/modules/${names.kebab}/rules.generated.ts',
    exports: [
        {
            exportName: '${names.pluralCamel}AuditActions',
            shape: 'keyed-list',
            field: 'audit',
            description: 'The audit action vocabulary this module owns.'
        }
    ]
};
`;

/** The audit vocabulary, present unless the module opted out. */
export const auditFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: the audit actions it emits, declared by augmentation so the app-wide union grows
 * with the modules that are enabled - see modules/account/audit.ts for why.
 * Here: view, create, update and delete of a ${names.entityCamel}, listed in rules.yaml. Reads are
 * audited too: who looked at the records is a question the log should answer.
 *
 * See: docs/tools/winston.md, docs/modules/${names.kebab}.md
 */

import { ${names.pluralCamel}AuditActions } from './rules.generated';

/** The audit action vocabulary this module owns, generated from rules.yaml. */
export { ${names.pluralCamel}AuditActions };

/** Registers this module's actions into the app-wide AuditActionMap union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        ${names.pluralCamel}: (typeof ${names.pluralCamel}AuditActions)[keyof typeof ${names.pluralCamel}AuditActions];
    }
}
`;

/** The permission rules and the one set this module introduces. */
export const authorizationYaml = (names: ModuleNames): string =>
    [
        'rules:',
        ...RULE_ACTIONS.flatMap((action) => [
            `    - action: ${action}`,
            `      subject: ${names.entity}`,
            `      module: ${names.kebab}`,
            '      scope: tenant',
            `      description: ${describeAction(action)} ${names.words}.`
        ]),
        '',
        'sets:',
        `    - name: ${permissionSetName(names)}`,
        `      module: ${names.kebab}`,
        `      description: Read, add, edit and remove ${names.words}.`,
        '      rules:',
        ...RULE_ACTIONS.map((action) => `          - ${action}:${names.entity}`),
        ''
    ].join('\n');

/**
 * The verb phrase a rule's description opens with.
 * @param action - the rule's action
 * @returns the phrase
 */
const describeAction = (action: string): string =>
    ({ read: 'List and read', create: 'Create', update: 'Edit', delete: 'Delete' })[action] ??
    action;

/** The Mongoose schema and model. */
export const modelFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: the Mongoose schema, one collection, and the wire-shape transform the repository
 * and presenter share. Here: ${names.entity} schema, a leaf in both directions (see ./module).
 *
 * ${names.entity}Row is the wire type without actions: actions are decided per caller, so a stored
 * row never carries them. createdAt and updatedAt are overridden from the generated ${names.entity} type (string to Date):
 * Mongoose holds native dates, and serialization narrows them back to the wire's ISO strings.
 *
 * See: docs/modules/${names.kebab}.md
 */

import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import type { ${names.entity} } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';

/** A ${names.entityCamel} as stored and as a repository read returns it: the wire shape minus actions. */
export type ${names.entity}Row = Omit<${names.entity}, 'actions'>;

/** Mongoose document type for a ${names.entityCamel}. */
export interface ${names.entity}Document
    extends Omit<${names.entity}Row, 'id' | 'createdAt' | 'updatedAt'>, Document {
    createdAt?: Date;
    updatedAt?: Date;
}

/** Mongoose model type for {@link ${names.entity}Document}. */
export type ${names.entity}Model = Model<${names.entity}Document>;

/** The ${names.words} collection schema. */
export const ${names.entityCamel}Schema = new Schema<${names.entity}Document, ${names.entity}Model>(
    {
        name: {
            type: String,
            required: true
        },
        notes: {
            type: String
        }
    },
    {
        timestamps: true
    }
);

/** The list sorts newest-first, which is exactly this key. */
${names.entityCamel}Schema.index({ createdAt: -1 });

/**
 * Normalizes a serialized ${names.entityCamel}: _id to id, drops __v. Exported so lean results
 * (which bypass toJSON) can be mapped through the same logic.
 */
export const apply${names.entity}Transform = applySerialization(${names.entityCamel}Schema);

/** The ${names.entity} model entrypoint. */
export const ${names.entityCamel}Model = model<${names.entity}Document, ${names.entity}Model>(
    '${names.entity}',
    ${names.entityCamel}Schema
);
`;

/** The repository, built on the shared factory. */
export const repositoryFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: the only door to the collection. CRUD and search come from the shared factory;
 * what is added here is what this collection alone needs. Nothing outside the module imports it -
 * the service is the door. Here: nothing added, the plain CRUD and a search over name and notes.
 *
 * See: docs/theory/layers.md, docs/modules/${names.kebab}.md
 */

import { ${names.entityCamel}Model, apply${names.entity}Transform } from './model';
import type { ${names.entity}Document, ${names.entity}Row } from './model';
import { createRepository } from '@infrastructure/persistence/create-repository';

/** Search over name, sortable by creation time or name. */
export const ${names.entityCamel}Repository = createRepository<${names.entity}Document, ${names.entity}Row>(
    ${names.entityCamel}Model,
    {
        transform: apply${names.entity}Transform,
        searchable: {
            objectIds: { id: '_id' },
            text: ['name', 'notes'],
            sortable: { createdAt: 'createdAt', name: 'name' }
        }
    }
);
`;

/**
 * One audit call for the service, or nothing when the module opted out.
 * @param names - the module's spellings
 * @param options - the scaffold options
 * @param action - the action key suffix, e.g. CREATED
 * @param extra - extra audit fields, already indented
 * @returns the statement, or an empty string
 */
const auditCall = (
    names: ModuleNames,
    options: ScaffoldOptions,
    action: string,
    extra: string
): string =>
    options.audit
        ? `recordAudit(context, {
                action: ${names.pluralCamel}AuditActions.ADMIN_${names.entitySnake.toUpperCase()}_${action},
                outcome: 'success'${extra}
            });`
        : '';

/** The service folder's door: the one object controllers call and the barrel publishes. */
export const servicesIndexFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: the service layer, the one door. A folder rather than one file because each
 * optional capability keeps its own file; the service object is what controllers call and what the
 * barrel publishes: every operation once, on the object, and nowhere by name.
 * Here: CRUD, and the actions a caller is told they have.
 *
 * See: docs/theory/layers.md, docs/modules/${names.kebab}.md
 */

import { create, getById, removeById, search, updateById } from './crud';

/** The service's public surface - controllers call through this, never the bare functions. */
export const ${names.entityCamel}Service = { create, getById, search, updateById, removeById };
`;

/** What the caller may do to a record: the kernel's answer, handed to the domain. */
export const actionsFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: what the caller may do to a record is decided here, once, so no client re-derives
 * it. Here: the keys authorization.yaml states (update, delete) are asked of the kernel for the
 * caller, and the domain turns the answer into the ${names.entity}Actions the contract declares.
 *
 * Delete it if: the module has nothing a client must grey out per row.
 *
 * See: docs/theory/tactical-ddd.md#2-capabilities-the-server-answers-what-a-client-may-do
 */

import type { CallerContext, ${names.entity}Actions } from '@types';
import { permitsOnRows } from '@kernel/ability';
import { ${names.entityCamel}ActionsFor } from '../domain';

/**
 * The actions this caller has on a ${names.entityCamel}. The records belong to the tenant, not to
 * a person, so one answer holds for every row and is asked once per request.
 * @param context - the caller
 * @returns what they may do
 */
export const actionsFor = (context: CallerContext): ${names.entity}Actions =>
    // permitsOnRows takes a row to test own-row conditions against; this subject has none, so an
    // empty row asks the tenant-wide question. Nothing to repeat per row.
    ${names.entityCamel}ActionsFor(permitsOnRows(context.caller, '${names.entity}', ['update', 'delete'])({}));
`;

/** The domain folder's door. */
export const domainIndexFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: the domain layer - pure rules only, lint-guaranteed free of Express, Mongoose
 * and every tier. A module gets a domain/ folder once it has a closed vocabulary with rules of its
 * own.
 * Here: the actions a caller has on a ${names.entityCamel}. The first status, limit or state machine
 * this module grows is written beside it: a state machine as an as const event table through
 * defineLifecycle (see the example module), never as a contract extension.
 *
 * See: docs/theory/domain-layer.md, docs/modules/${names.kebab}.md
 */

export { ${names.entityCamel}ActionsFor } from './rules';
`;

/** The module's first domain rule. */
export const domainRulesFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: the rules that decide, with no I/O.
 * Here: what a caller may do to a ${names.entityCamel}. Today that is just their keys; a lifecycle
 * (an event table built with defineLifecycle, see the example module) would add one flag per
 * event here, so the client never re-derives it.
 *
 * See: docs/theory/domain-layer.md, docs/modules/${names.kebab}.md
 */

import type { ${names.entity}Actions } from '@types';

/**
 * What a caller may do to a ${names.entityCamel}, given what their keys allow.
 * @param permits - the caller's keys on this record, answered by the kernel
 */
export const ${names.entityCamel}ActionsFor = (permits: {
    update: boolean;
    delete: boolean;
}): ${names.entity}Actions => ({
    update: permits.update,
    delete: permits.delete
});
`;

/** The service: the write path around the repository. */
export const crudFile = (names: ModuleNames, options: ScaffoldOptions): string => `/**
 * @module
 * In any module: the service is the one door (./index.ts composes it). Controllers and sibling
 * modules call it; it applies the domain rules, talks to the repository and to other modules'
 * barrels, and announces what happened (audit, metric, event).
 * Here: ${names.entity} read, list, create, replace/patch and delete.${
     options.audit ? ' Every operation records an audit row, so the controllers stay thin.' : ''
 }
 *
 * See: docs/theory/layers.md, docs/modules/${names.kebab}.md
 */

import type {
    CallerContext,
    ${names.entity},
    Create${names.entity}Request,
    Update${names.entity}Request
} from '@types';
import type { ${names.entity}Document } from '../model';
import { ${names.entityCamel}Repository } from '../repository';
import { present${names.entity}, present${names.entity}Row } from '../presenter';
import { actionsFor } from './actions';
import {
    generateReject,
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import { clearedOrValue } from '@infrastructure/persistence/changes';${
    options.audit
        ? `
import { recordAudit } from '@infrastructure/observability/audit';
import { ${names.pluralCamel}AuditActions } from '../audit';`
        : ''
}

/**
 * Create a ${names.entityCamel}.
 * @param payload - the validated body
 * @param context - who acted
 * @returns the saved ${names.entityCamel}, as the contract shapes it
 */
export const create = (
    payload: Create${names.entity}Request,
    context: CallerContext
): Promise<${names.entity}> =>
    ${names.entityCamel}Repository
        .create({ name: payload.name.trim(), notes: payload.notes?.trim() })
        .then((created) => {
            ${auditCall(
                names,
                options,
                'CREATED',
                `,
                targetType: '${names.entitySnake}',
                targetId: String(created._id)`
            )}
            return present${names.entity}(created, actionsFor(context));
        });

/**
 * One ${names.entityCamel} by id.
 * @param id - the record id
 * @param context - who asked
 * @returns the ${names.entityCamel}, or null when the id names nothing
 */
export const getById = (id: string, context: CallerContext): Promise<${names.entity} | null> =>
    ${names.entityCamel}Repository.findById(id).then((found) => {
        if (!found) return null;
        ${auditCall(
            names,
            options,
            'VIEWED',
            `,
                targetType: '${names.entitySnake}',
                targetId: id`
        )}
        return present${names.entity}(found, actionsFor(context));
    });

/**
 * A page of ${names.words}, newest first unless a sort is given.
 * @param filters - page, pageSize and sort as they arrive from a query string
 * @param context - who asked
 * @returns the page and its pagination meta
 */
export const search = (
    // page and pageSize accept strings: they arrive as query text, and normalizePagination
    // coerces and bounds them.
    filters: Omit<Record<string, unknown>, 'page' | 'pageSize'> & {
        page?: string | number;
        pageSize?: string | number;
        sort?: string[];
        text?: string;
    },
    context: CallerContext
): Promise<{ items: ${names.entity}[]; meta: PaginatedMeta }> =>
    ${names.entityCamel}Repository.search(filters).then(({ items, meta }) => {
        ${auditCall(names, options, 'VIEWED', '')}
        const actions = actionsFor(context);
        return { items: items.map((row) => present${names.entity}Row(row, actions)), meta };
    });

/**
 * Apply a replace or patch to a loaded ${names.entityCamel} and persist it. A null in the payload
 * clears the field.
 * @param ${names.entityCamel} - the loaded document
 * @param payload - the changes
 * @returns the saved document
 */
const applyUpdate = (
    ${names.entityCamel}: ${names.entity}Document,
    payload: Update${names.entity}Request
): Promise<${names.entity}Document> => {
    if (payload.name !== undefined) ${names.entityCamel}.name = payload.name.trim();
    // null clears the notes: an undefined value is unset on save, via clearedOrValue.
    if (payload.notes !== undefined) ${names.entityCamel}.notes = clearedOrValue(payload.notes);
    return ${names.entityCamel}Repository.save(${names.entityCamel});
};

/**
 * Load by id, apply {@link applyUpdate}, audit on success.
 * @param id - the record id
 * @param payload - the changes
 * @param context - who acted
 * @returns a 404 reject when the id names nothing, otherwise the saved ${names.entityCamel}
 */
export const updateById = (
    id: string,
    payload: Update${names.entity}Request,
    context: CallerContext
): Promise<ResponseSuccess<${names.entity}> | ResponseReject> =>
    ${names.entityCamel}Repository.findById(id).then<ResponseSuccess<${names.entity}> | ResponseReject>((found) => {
        if (!found) return generateReject(404, [t('generic.error-item-gone')]);
        return applyUpdate(found, payload).then((saved) => {
            ${auditCall(
                names,
                options,
                'UPDATED',
                `,
                targetType: '${names.entitySnake}',
                targetId: id`
            )}
            return generateSuccess(present${names.entity}(saved, actionsFor(context)));
        });
    });

/**
 * Load by id and remove it permanently, audit on success.
 * @param id - the record id
 * @param ${options.audit ? 'context' : '_context'} - who acted${options.audit ? '' : ' (unused: this module records no audit row)'}
 * @returns a 404 reject when the id names nothing, otherwise success
 */
export const removeById = (
    id: string,
    ${options.audit ? 'context' : '_context'}: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    ${names.entityCamel}Repository.findById(id).then((found) => {
        if (!found) return generateReject(404, [t('generic.error-item-gone')]);
        return ${names.entityCamel}Repository.deleteOne(found).then(() => {
            ${auditCall(
                names,
                options,
                'DELETED',
                `,
                targetType: '${names.entitySnake}',
                targetId: id`
            )}
            return generateSuccess(undefined);
        });
    });
`;

/** The one place a document becomes the wire shape. */
export const presenterFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: the one place a stored row becomes the wire shape openapi.yaml declares, so
 * every read and write answers with the same thing.
 * Here: a ${names.entityCamel} gains one field, actions, which is decided per caller by the service
 * and handed in, never asked for here.
 *
 * See: docs/theory/layers.md, docs/modules/${names.kebab}.md
 */

import type { ${names.entity}, ${names.entity}Actions } from '@types';
import type { ${names.entity}Document, ${names.entity}Row } from './model';

/**
 * A document as the contract's ${names.entity}.
 *
 * toJSON applies the model's transform (_id to id); Mongoose types its result any, and the single
 * cast below is what makes it a ${names.entity}Row. Dates stay Date until the response is
 * serialized, which is what turns them into ISO strings.
 *
 * @param document - the stored ${names.entityCamel}
 * @param actions - what the caller may do to it
 */
export const present${names.entity} = (
    document: ${names.entity}Document,
    actions: ${names.entity}Actions
): ${names.entity} => ({ ...(document.toJSON() as ${names.entity}Row), actions });

/**
 * A search row (already in wire shape) as the contract's ${names.entity}.
 *
 * @param row - one row of a repository search
 * @param actions - what the caller may do to it
 */
export const present${names.entity}Row = (
    row: ${names.entity}Row,
    actions: ${names.entity}Actions
): ${names.entity} => ({ ...row, actions });
`;

/** The route table. */
export const routesFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: the route table. Public routes sit ABOVE one router.use(getAuth, isAuth) and
 * everything below it is signed-in, so which half a route is in is decided by where it is typed.
 * Each mount states the one key its own action needs.
 * Here: nothing is public; everything sits below one router.use(getAuth, isAuthOrCredential) gate.
 *
 * See: docs/theory/request-flow.md, docs/modules/${names.kebab}.md
 */

import { Router } from 'express';
import { getAuth, isAuthOrCredential, requirePermission } from '@kernel/middlewares/authorizations';
import { privateNoCache } from '@infrastructure/http/middlewares/cache';
import { get${names.plural} } from './controllers/get-${names.kebab}';
import { get${names.entity} } from './controllers/get-${names.kebab}-item';
import { post${names.entity} } from './controllers/post-${names.kebab}';
import { replace${names.entity}, update${names.entity} } from './controllers/update-${names.kebab}';
import { delete${names.entity} } from './controllers/delete-${names.kebab}';

/** Express router for ${names.kebab} endpoints (admin only). */
export const router = Router();

// Positional: guards every route below it, none above.
router.use(getAuth, isAuthOrCredential);

// privateNoCache: the browser may keep its own copy, revalidated every time. Never Redis-cached,
// because this is one admin's view, not a shared answer.
router.get('/', requirePermission('read', '${names.entity}'), privateNoCache, get${names.plural});

// GET /${names.kebab}/:id - one record. Declared after the list so the two never shadow each other.
router.get('/:id', requirePermission('read', '${names.entity}'), privateNoCache, get${names.entity});

router.post('/', requirePermission('create', '${names.entity}'), post${names.entity});

// PUT replaces, PATCH merges.
router.put('/:id', requirePermission('update', '${names.entity}'), replace${names.entity});
router.patch('/:id', requirePermission('update', '${names.entity}'), update${names.entity});

router.delete('/:id', requirePermission('delete', '${names.entity}'), delete${names.entity});
`;

/** The list controller. */
export const getController = (names: ModuleNames): string => `/**
 * @module
 * In any module: a controller is thin wiring - decode the request, call the service, shape the
 * answer.
 * Here: GET ${names.basePath}, one page of ${names.words}, built on the shared list-controller
 * factory.
 *
 * See: docs/theory/request-flow.md, docs/modules/${names.kebab}.md
 */

import { List${names.plural}QueryParams } from '@api/schemas.zod';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { callerContextOf } from '@infrastructure/http/request';
import { createListController } from '@infrastructure/surfaces/create-list-controller';
import { ${names.entityCamel}Service } from '../services';

/**
 * GET ${names.basePath} (admin). page and pageSize are coerced from query text; partial() keeps an
 * absent value absent so the pagination defaults stay in one place.
 */
export const get${names.plural} = createListController({
    entity: '${names.pluralCamel}',
    schema: List${names.plural}QueryParams.extend({
        page: pageSchema,
        pageSize: pageSizeSchema
    }).partial(),
    runList: (parsed, request) => ${names.entityCamel}Service.search(parsed, callerContextOf(request))
});
`;

/** The read-one controller. */
export const getItemController = (names: ModuleNames): string => `/**
 * @module
 * In any module: a read-one controller is one call to the shared item factory, which owns the
 * 404 (an unknown id and a malformed one answer the same).
 * Here: GET ${names.basePath}/:id, behind the same gate and the read key as the list.
 *
 * See: docs/theory/request-flow.md, docs/modules/${names.kebab}.md
 */

import { callerContextOf } from '@infrastructure/http/request';
import { createItemController } from '@infrastructure/surfaces/create-item-controller';
import { ${names.entityCamel}Service } from '../services';

/** GET ${names.basePath}/:id (admin). */
export const get${names.entity} = createItemController({
    entity: '${names.entityCamel}',
    notFoundKey: 'generic.error-item-gone',
    fetch: (id, request) => ${names.entityCamel}Service.getById(id, callerContextOf(request))
});
`;

/** The create controller. */
export const postController = (names: ModuleNames): string => `/**
 * @module
 * In any module: a create controller validates the body against the generated schema, calls the
 * service, and answers 201 with a Location.
 * Here: POST ${names.basePath}, create one ${names.entityCamel}.
 *
 * See: docs/theory/request-flow.md, docs/modules/${names.kebab}.md
 */

import type { Request, Response } from 'express';
import { Create${names.entity}Body } from '@api/schemas.zod';
import { createdResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody } from '@infrastructure/http/controller';
import type { ${names.entity} } from '@types';
import { ${names.entityCamel}Service } from '../services';

/**
 * POST ${names.basePath} (admin)
 * Validates the body against the generated schema, then creates the record.
 */
export const post${names.entity} = (request: Request, response: Response) => {
    const body = parseBody(Create${names.entity}Body, request.body, response);
    if (!body) return;

    return ${names.entityCamel}Service
        .create(body, callerContextOf(request))
        .then((created) => {
            createdResponse<${names.entity}>(response, created, \`${names.basePath}/\${created.id}\`);
        })
        .catch(catchAs(response, 'post${names.entity}'));
};
`;

/** The PUT/PATCH controller pair. */
export const updateController = (names: ModuleNames): string => `/**
 * @module
 * In any module: PUT (replace) and PATCH (merge) share one pipeline, built by the shared update
 * factory, which also owns the id check, If-Match and the ETag. What differs per module is the
 * two schemas and the service call.
 * Here: PUT and PATCH ${names.basePath}/:id.
 *
 * See: docs/api/write-methods.md, docs/modules/${names.kebab}.md
 */

import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { Replace${names.entity}ByIdBody, Update${names.entity}ByIdBody } from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { ${names.entityCamel}Service } from '../services';

/** PUT and PATCH ${names.basePath}/:id - one handler pair over updateById, which audits itself. */
export const { replace: replace${names.entity}, update: update${names.entity} } =
    createUpdateController({
        // The scaffolded contract declares no If-Match: add the header there, then flip this.
        versioned: false,
        entity: '${names.entityCamel}',
        notFoundKey: 'generic.error-item-gone',
        replaceSchema: Replace${names.entity}ByIdBody,
        patchSchema: Update${names.entity}ByIdBody,
        update: (id, changes, request) =>
            ${names.entityCamel}Service.updateById(id, changes, callerContextOf(request)),
        // The service already answers in the contract's shape.
        present: (row) => row
    });
`;

/** The delete controller. */
export const deleteController = (names: ModuleNames): string => `/**
 * @module
 * In any module: a delete controller. Hand-written here because the shared delete factory serves
 * the soft/hard delete triplet, and this module has no soft-delete tier to flag.
 * Here: DELETE ${names.basePath}/:id - permanent.
 *
 * See: docs/theory/request-flow.md, docs/modules/${names.kebab}.md
 */

import type { Request, Response } from 'express';
import { noContentResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { ${names.entityCamel}Service } from '../services';

/**
 * DELETE ${names.basePath}/:id (admin)
 * A malformed or unknown id both answer 404.
 */
export const delete${names.entity} = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return Promise.resolve();

    return ${names.entityCamel}Service
        .removeById(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            noContentResponse(response);
        })
        .catch(catchAs(response, 'delete${names.entity}'));
};
`;

/** The fixture builder. */
export const factoriesFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: how a row is built for a test or a seed. Reachable at @modules/<name>/factories
 * and never from the barrel - it writes past the rules a service enforces.
 * Here: a ${names.entityCamel} row, through the model's own shape, so a fixture cannot carry a
 * field the schema would drop.
 */

import type { ${names.entity}Document } from './model';

/** What a caller may vary; everything else takes a default. */
export interface ${names.entity}Overrides {
    /** The record's name. */
    name?: string;
    /** Free-text notes; absent by default. */
    notes?: string;
}

/** A ${names.entityCamel} ready for the repository's create. */
export type ${names.entity}Fixture = Pick<${names.entity}Document, 'name'> &
    Partial<Pick<${names.entity}Document, 'notes'>>;

/**
 * Build a ${names.entityCamel} fixture.
 * @param overrides - the fields to set
 * @returns a fixture ready for ${names.entityCamel}Repository.create
 */
export const make${names.entity} = ({
    name = 'Example ${names.entityCamel}',
    notes
}: ${names.entity}Overrides = {}): ${names.entity}Fixture => ({
    name,
    ...(notes === undefined ? {} : { notes })
});
`;
