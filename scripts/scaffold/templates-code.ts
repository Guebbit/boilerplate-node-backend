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
import { KEY_ACTIONS, type ModuleNames } from './names';

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
 * ${names.words}: a keyed collection an admin lists, creates, edits and deletes. Scaffolded from the
 * example module's core; replace this paragraph with what the domain is and what it deliberately
 * does not reach.
 *
 * In any module: the manifest below is everything this module asks the application to do for it.
 * Each optional capability is one entry here plus its own files, and each can be deleted alone.
 *
 * See: docs/theory/modules.md#the-module-template, docs/modules/${names.kebab}.md
 */

import type { AppModule } from '@kernel/registry';
import { router } from './routes';

/** This module's manifest entry: one admin router, keyed by ${names.family}.* permissions. */
export default {
    name: '${names.kebab}',
    basePath: '${names.basePath}',
    routes: router,
    // 'none' is the reviewed answer for a collection with no user-linked field. Change it to a
    // section the moment a record names a person.
    personalData: 'none'
} satisfies AppModule;
`;

/** The convenience barrel. */
export const barrel = (names: ModuleNames): string => `/**
 * @module
 * ${names.words} - public barrel; the only surface a sibling may import.
 *
 * In any module: the barrel exports services, domain rules, events and emails, and the model's
 * TYPES. Never a repository, the model's runtime value, a wiring file or factories.ts.
 *
 * See: docs/theory/strategic-ddd.md section 5, docs/modules/${names.kebab}.md
 */

export * from './service';

export type * from './model';
`;

/** The audit vocabulary, present unless the module opted out. */
export const auditFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: the audit actions it emits, declared by augmentation so the app-wide union grows
 * with the modules that are enabled - see modules/account/audit.ts for why. Here, reads are
 * audited too: who looked at the records is a question the log should answer.
 *
 * See: docs/tools/winston.md, docs/modules/${names.kebab}.md
 */

/** The audit action vocabulary this module owns. */
export const ${names.pluralCamel}AuditActions = {
    ADMIN_${names.entitySnake.toUpperCase()}_VIEWED: 'admin.${names.entitySnake}.viewed',
    ADMIN_${names.entitySnake.toUpperCase()}_CREATED: 'admin.${names.entitySnake}.created',
    ADMIN_${names.entitySnake.toUpperCase()}_UPDATED: 'admin.${names.entitySnake}.updated',
    ADMIN_${names.entitySnake.toUpperCase()}_DELETED: 'admin.${names.entitySnake}.deleted'
} as const;

/** Registers this module's actions into the app-wide AuditActionMap union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        ${names.pluralCamel}: (typeof ${names.pluralCamel}AuditActions)[keyof typeof ${names.pluralCamel}AuditActions];
    }
}
`;

/** The permission keys this module introduces. */
export const authorizationYaml = (names: ModuleNames): string =>
    [
        'keys:',
        ...KEY_ACTIONS.flatMap((action) => [
            `    - key: ${names.family}.any.${action}`,
            `      module: ${names.kebab}`,
            `      subject: ${names.entity}`,
            `      action: ${action}`,
            '      scope: tenant',
            `      description: ${describeAction(action)} ${names.words}.`
        ]),
        ''
    ].join('\n');

/**
 * The verb phrase a key's description opens with.
 * @param action - the key's action
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
 * createdAt and updatedAt are overridden from the generated ${names.entity} type (string to Date):
 * Mongoose holds native dates, and serialization narrows them back to the wire's ISO strings.
 *
 * See: docs/modules/${names.kebab}.md
 */

import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import type { ${names.entity} } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';

/** Mongoose document type for a ${names.entityCamel}. */
export interface ${names.entity}Document
    extends Omit<${names.entity}, 'id' | 'createdAt' | 'updatedAt'>, Document {
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
 * In any module: the only door to the collection. Nothing outside the module imports it - the
 * service is the door. Here: ${names.entity} repository, standard CRUD via the shared factory.
 *
 * See: docs/theory/layers.md, docs/modules/${names.kebab}.md
 */

import { ${names.entityCamel}Model, apply${names.entity}Transform } from './model';
import type { ${names.entity}Document } from './model';
import { createRepository } from '@infrastructure/persistence/create-repository';
import type { ${names.entity} } from '@types';

/** Search over name, sortable by creation time or name. */
export const ${names.entityCamel}Repository = createRepository<${names.entity}Document, ${names.entity}>(
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

/**
 * The trailing context parameter of a service function, or nothing when the module opted out of
 * audit (an unused parameter would fail the type check).
 * @param options - the scaffold options
 * @returns the parameter text, leading comma included
 */
const contextParameter = (options: ScaffoldOptions): string =>
    options.audit ? ',\n    context?: CallerContext' : '';

/**
 * A .then that audits and passes the value through, or nothing when the module opted out.
 * @param names - the module's spellings
 * @param options - the scaffold options
 * @param variable - the name the resolved value is bound to
 * @param action - the action key suffix, e.g. CREATED
 * @param extra - extra audit fields
 * @returns the chained call, or an empty string
 */
const thenAudit = (
    names: ModuleNames,
    options: ScaffoldOptions,
    variable: string,
    action: string,
    extra: string
): string =>
    options.audit
        ? `.then((${variable}) => {
            ${auditCall(names, options, action, extra)}
            return ${variable};
        })`
        : '';

/**
 * The @param line for the context parameter, or nothing when the module opted out of audit.
 * @param options - the scaffold options
 * @param description - what the context is for in this function
 * @returns the JSDoc line with its newline, or an empty string
 */
const contextDocument = (options: ScaffoldOptions, description: string): string =>
    options.audit ? ` * @param context - ${description}\n` : '';

/** The service: the write path around the repository. */
export const serviceFile = (names: ModuleNames, options: ScaffoldOptions): string => `/**
 * @module
 * In any module: the service is the one door. Controllers and sibling modules call it; it applies
 * the domain rules, talks to the repository and announces what happened. Here: ${names.entity}
 * list, create, replace/patch and delete. Every write records an audit row (when the module
 * audits) so the controllers stay thin.
 *
 * See: docs/theory/layers.md, docs/modules/${names.kebab}.md
 */

import type {
    ${names.entity},
    Create${names.entity}Request,
    Update${names.entity}Request${options.audit ? ',\n    CallerContext' : ''}
} from '@types';
import type { ${names.entity}Document } from './model';
import { ${names.entityCamel}Repository } from './repository';
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
import { ${names.pluralCamel}AuditActions } from './audit';`
        : ''
}

/**
 * Create a ${names.entityCamel}.
 * @param payload - the validated body
${contextDocument(options, 'who acted; omitted by a caller that is not a request')} * @returns the saved document
 */
export const create = (
    payload: Create${names.entity}Request${contextParameter(options)}
): Promise<${names.entity}Document> =>
    ${names.entityCamel}Repository
        .create({ name: payload.name.trim(), notes: payload.notes?.trim() })${thenAudit(
            names,
            options,
            'created',
            'CREATED',
            `,
                target_type: '${names.entitySnake}',
                target_id: String(created._id)`
        )};

/**
 * A page of ${names.words}, newest first unless a sort is given.
 * @param filters - page, pageSize and sort as they arrive from a query string
${contextDocument(options, 'who asked; omitted by a caller that is not a request')} * @returns the page and its pagination meta
 */
export const search = (
    // page and pageSize accept strings: they arrive as query text, and normalizePagination
    // coerces and bounds them.
    filters: Omit<Record<string, unknown>, 'page' | 'pageSize'> & {
        page?: string | number;
        pageSize?: string | number;
        sort?: string[];
        text?: string;
    } = {}${contextParameter(options)}
): Promise<{ items: ${names.entity}[]; meta: PaginatedMeta }> =>
    ${names.entityCamel}Repository.search(filters)${thenAudit(names, options, 'result', 'VIEWED', '')};

/**
 * Apply a replace or patch to a loaded ${names.entityCamel} and persist it. A null in the payload
 * clears the field.
 * @param ${names.entityCamel} - the loaded document
 * @param payload - the changes
 * @returns the saved document
 */
export const update = (
    ${names.entityCamel}: ${names.entity}Document,
    payload: Update${names.entity}Request
): Promise<ResponseSuccess<${names.entity}Document>> => {
    if (payload.name !== undefined) ${names.entityCamel}.name = payload.name.trim();
    // null clears the notes: an undefined value is unset on save, via clearedOrValue.
    if (payload.notes !== undefined) ${names.entityCamel}.notes = clearedOrValue(payload.notes);
    return ${names.entityCamel}Repository.save(${names.entityCamel}).then((saved) => generateSuccess(saved));
};

/**
 * Load by id, apply {@link update}, audit on success.
 * @param id - the record id
 * @param payload - the changes
${contextDocument(options, 'who acted')} * @returns a 404 reject when the id names nothing, otherwise the saved document
 */
export const updateById = (
    id: string,
    payload: Update${names.entity}Request${contextParameter(options)}
): Promise<ResponseSuccess<${names.entity}Document> | ResponseReject> =>
    ${names.entityCamel}Repository.findById(id).then<ResponseSuccess<${names.entity}Document> | ResponseReject>((found) => {
        if (!found) return generateReject(404, [t('generic.error-not-found')]);
        return update(found, payload)${thenAudit(
            names,
            options,
            'result',
            'UPDATED',
            `,
                target_type: '${names.entitySnake}',
                target_id: id`
        )};
    });

/**
 * Load by id and remove it permanently, audit on success.
 * @param id - the record id
${contextDocument(options, 'who acted')} * @returns a 404 reject when the id names nothing, otherwise success
 */
export const remove = (
    id: string${contextParameter(options)}
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    ${names.entityCamel}Repository.findById(id).then((found) => {
        if (!found) return generateReject(404, [t('generic.error-not-found')]);
        return ${names.entityCamel}Repository.deleteOne(found).then(() => {
            ${auditCall(
                names,
                options,
                'DELETED',
                `,
                target_type: '${names.entitySnake}',
                target_id: id`
            )}
            return generateSuccess(undefined);
        });
    });

/** The module's service object, used by the controllers in ./controllers. */
export const ${names.entityCamel}Service = { create, search, update, updateById, remove };
`;

/** The one place a document becomes the wire shape. */
export const presenterFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: the one place a stored row becomes the wire shape openapi.yaml declares, so every
 * read and write answers with the same thing. Here: a ${names.entityCamel} document.
 */

import type { ${names.entity} } from '@types';
import type { ${names.entity}Document } from './model';

/**
 * toJSON applies the model's _id to id and date-to-ISO-string transform; Mongoose types its result
 * any, and this cast is what makes it a ${names.entity}.
 * @param document - the stored document
 * @returns the wire representation
 */
export const present${names.entity} = (document: ${names.entity}Document): ${names.entity} =>
    document.toJSON() as ${names.entity};
`;

/** The route table. */
export const routesFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: the route table. Public routes sit above one router.use(getAuth, ...) gate and
 * everything below it is signed-in, so which half a route is in is decided by where it is typed.
 * Here: everything sits below one router.use(getAuth, isAuthOrCredential) gate, each mount stating
 * the one key its own action needs.
 *
 * See: docs/theory/request-flow.md, docs/modules/${names.kebab}.md
 */

import { Router } from 'express';
import { getAuth, isAuthOrCredential, requirePermission } from '@kernel/middlewares/authorizations';
import { privateNoCache } from '@infrastructure/http/middlewares/cache';
import { get${names.plural} } from './controllers/get-${names.kebab}';
import { post${names.entity} } from './controllers/post-${names.kebab}';
import { replace${names.entity}, update${names.entity} } from './controllers/update-${names.kebab}';
import { delete${names.entity} } from './controllers/delete-${names.kebab}';

/** Express router for ${names.kebab} endpoints (admin only). */
export const router = Router();

// Positional: guards every route below it, none above.
router.use(getAuth, isAuthOrCredential);

// privateNoCache: the browser may keep its own copy, revalidated every time. Never Redis-cached,
// because this is one admin's view, not a shared answer.
router.get('/', requirePermission('${names.family}.any.read'), privateNoCache, get${names.plural});

router.post('/', requirePermission('${names.family}.any.create'), post${names.entity});

// PUT replaces, PATCH merges.
router.put('/:id', requirePermission('${names.family}.any.update'), replace${names.entity});
router.patch('/:id', requirePermission('${names.family}.any.update'), update${names.entity});

router.delete('/:id', requirePermission('${names.family}.any.delete'), delete${names.entity});
`;

/**
 * The import line for callerContextOf, or nothing when the module does not audit.
 * @param options - the scaffold options
 * @returns the import statement with its newline, or an empty string
 */
const callerImport = (options: ScaffoldOptions): string =>
    options.audit ? "import { callerContextOf } from '@infrastructure/http/request';\n" : '';

/**
 * The trailing context argument of a service call, or nothing when the module does not audit.
 * @param options - the scaffold options
 * @returns the argument text, leading comma included
 */
const contextArgument = (options: ScaffoldOptions): string =>
    options.audit ? ', callerContextOf(request)' : '';

/** The list controller. */
export const getController = (names: ModuleNames, options: ScaffoldOptions): string => `/**
 * @module
 * In any module: a controller is thin wiring - decode the request, call the service, shape the
 * answer. Here: GET ${names.basePath}, one page of ${names.words}, built on the shared
 * list-controller factory.
 *
 * See: docs/theory/request-flow.md, docs/modules/${names.kebab}.md
 */

import { List${names.plural}QueryParams } from '@api/schemas.zod';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
${callerImport(options)}import { createListController } from '@infrastructure/surfaces/create-list-controller';
import { ${names.entityCamel}Service } from '../service';

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
    runList: (parsed${options.audit ? ', request' : ''}) => ${names.entityCamel}Service.search(parsed${contextArgument(options)})
});
`;

/** The create controller. */
export const postController = (names: ModuleNames, options: ScaffoldOptions): string => `/**
 * @module
 * In any module: a create controller validates the body against the generated schema, calls the
 * service and answers 201. Here: POST ${names.basePath}, create one ${names.entityCamel}.
 *
 * See: docs/theory/request-flow.md, docs/modules/${names.kebab}.md
 */

import type { Request, Response } from 'express';
import { Create${names.entity}Body } from '@api/schemas.zod';
import { createdResponse } from '@infrastructure/http/response';
${callerImport(options)}import { catchAs, parseBody } from '@infrastructure/http/controller';
import type { ${names.entity} } from '@types';
import { ${names.entityCamel}Service } from '../service';
import { present${names.entity} } from '../presenter';

/**
 * POST ${names.basePath} (admin)
 * Validates the body against the generated schema, then creates the record.
 */
export const post${names.entity} = (request: Request, response: Response) => {
    const body = parseBody(Create${names.entity}Body, request.body, response);
    if (!body) return;

    return ${names.entityCamel}Service
        .create(body${contextArgument(options)})
        .then((created) => {
            const presented = present${names.entity}(created);
            createdResponse<${names.entity}>(response, presented, \`${names.basePath}/\${presented.id}\`);
        })
        .catch(catchAs(response, 'post${names.entity}'));
};
`;

/** The PUT/PATCH controller pair. */
export const updateController = (names: ModuleNames, options: ScaffoldOptions): string => `/**
 * @module
 * In any module: PUT (replace) and PATCH (merge) share one pipeline, built by the shared update
 * factory, which also owns the id check, If-Match and the ETag. Here: ${names.basePath}/:id.
 *
 * See: docs/api/write-methods.md, docs/modules/${names.kebab}.md
 */

import { createUpdateController } from '@infrastructure/surfaces/create-update-controller';
import { Replace${names.entity}Body, Update${names.entity}Body } from '@api/schemas.zod';
${callerImport(options)}import { ${names.entityCamel}Service } from '../service';
import { present${names.entity} } from '../presenter';

/** PUT and PATCH ${names.basePath}/:id - one handler pair over updateById, which audits itself. */
export const { replace: replace${names.entity}, update: update${names.entity} } =
    createUpdateController({
        entity: '${names.entityCamel}',
        replaceSchema: Replace${names.entity}Body,
        patchSchema: Update${names.entity}Body,
        update: (id, changes${options.audit ? ', request' : ''}) =>
            ${names.entityCamel}Service.updateById(id, changes${contextArgument(options)}),
        present: (row) => present${names.entity}(row)
    });
`;

/** The delete controller. */
export const deleteController = (names: ModuleNames, options: ScaffoldOptions): string => `/**
 * @module
 * In any module: a delete controller. Here: DELETE ${names.basePath}/:id - permanent. Hand-written
 * rather than built on createDeleteController: that factory serves the soft/hard delete triplet,
 * and this module has no soft-delete tier.
 *
 * See: docs/theory/request-flow.md, docs/modules/${names.kebab}.md
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
${callerImport(options)}import { catchAsNotFound, refused } from '@infrastructure/http/controller';
import { ${names.entityCamel}Service } from '../service';

/**
 * DELETE ${names.basePath}/:id (admin)
 * A malformed or unknown id both answer 404.
 */
export const delete${names.entity} = (request: Request<{ id: string }>, response: Response) =>
    ${names.entityCamel}Service
        .remove(request.params.id${contextArgument(options)})
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, undefined, 200, result.message);
        })
        .catch(catchAsNotFound(response, 'delete${names.entity}', 'generic.error-not-found'));
`;

/** The fixture builder. */
export const factoriesFile = (names: ModuleNames): string => `/**
 * @module
 * In any module: how a row is built for a test or a seed. Reachable at @modules/<name>/factories
 * and never from the barrel - it writes past the rules a service enforces. Here: a
 * ${names.entityCamel} row, through the model's own shape, so a fixture cannot carry a field the
 * schema would drop.
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
