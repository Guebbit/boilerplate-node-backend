/**
 * @module
 * The contract fragment of a scaffolded module: its own `openapi.yaml`, in the shape the
 * root assembler completes (paths and tags reach the root bundle by themselves).
 */

import type { ModuleNames } from './names';

/** Where the shared components live, relative to a module folder. */
const ROOT = '../../../shared/contracts/openapi.root.yaml';

/**
 * One error-response line.
 * @param status - the HTTP status
 * @param component - the shared response component's name
 * @returns the YAML line, indented for a responses map
 */
const errorResponse = (status: string, component: string): string =>
    `                '${status}': { $ref: '${ROOT}#/components/responses/${component}' }`;

/** The shared error set every keyed route answers. */
const KEYED_ERRORS = [
    errorResponse('401', 'Unauthorized'),
    errorResponse('403', 'Forbidden'),
    errorResponse('422', 'ValidationError'),
    errorResponse('500', 'InternalError')
].join('\n');

/** The same, plus the 404 a route with an id can answer. */
const KEYED_ERRORS_WITH_NOT_FOUND = [
    errorResponse('401', 'Unauthorized'),
    errorResponse('403', 'Forbidden'),
    errorResponse('404', 'NotFound'),
    errorResponse('422', 'ValidationError'),
    errorResponse('500', 'InternalError')
].join('\n');

/** A route with only a path id: no body or query to fail, so no 422, and a malformed id is the 404. */
const PATH_ONLY_ERRORS = [
    errorResponse('401', 'Unauthorized'),
    errorResponse('403', 'Forbidden'),
    errorResponse('404', 'NotFound'),
    errorResponse('500', 'InternalError')
].join('\n');

/**
 * The module's `openapi.yaml`: list, create, replace, patch and delete, plus the schemas only
 * these paths reference.
 * @param names - the module's spellings
 * @returns the YAML text
 */
export const openapiFragment = (names: ModuleNames): string => `openapi: 3.0.3
info:
    title: ${names.kebab} — module contract
    version: '1.0.0'

paths:
    ${names.basePath}:
        get:
            tags: [${names.entity}]
            summary: List ${names.words}
            description: Returns one page of ${names.words}, newest first.
            operationId: list${names.plural}
            security:
                - bearerAuth: []
            parameters:
                - $ref: '${ROOT}#/components/parameters/PageParam'
                - $ref: '${ROOT}#/components/parameters/PageSizeParam'
            responses:
                '200':
                    description: A page of ${names.words}
                    content:
                        application/json:
                            schema:
                                $ref: '#/components/schemas/${names.plural}ResponseEnvelope'
${KEYED_ERRORS}
        post:
            tags: [${names.entity}]
            summary: Create ${names.entityCamel}
            description: Creates one ${names.entityCamel}.
            operationId: create${names.entity}
            security:
                - bearerAuth: []
            requestBody:
                required: true
                content:
                    application/json:
                        schema:
                            $ref: '#/components/schemas/Create${names.entity}Request'
            responses:
                '201':
                    description: Created ${names.entityCamel}
                    headers:
                        Location: { $ref: '${ROOT}#/components/headers/Location' }
                    content:
                        application/json:
                            schema:
                                $ref: '#/components/schemas/${names.entity}Envelope'
${KEYED_ERRORS}

    ${names.basePath}/{id}:
        put:
            tags: [${names.entity}]
            summary: Replace ${names.entityCamel}
            description: Replaces the ${names.entityCamel} (RFC 9110 9.3.4, an omitted optional field is cleared). name is required, since a PUT names the whole representation.
            operationId: replace${names.entity}
            security:
                - bearerAuth: []
            parameters:
                - $ref: '${ROOT}#/components/parameters/IdPathParam'
            requestBody:
                required: true
                content:
                    application/json:
                        schema:
                            $ref: '#/components/schemas/Replace${names.entity}Request'
            responses:
                '200':
                    description: Updated ${names.entityCamel}
                    content:
                        application/json:
                            schema:
                                $ref: '#/components/schemas/${names.entity}Envelope'
${KEYED_ERRORS_WITH_NOT_FOUND}
        patch:
            tags: [${names.entity}]
            summary: Update ${names.entityCamel}
            description: Merges a change into the ${names.entityCamel} (RFC 7396, an omitted field is left unchanged, null clears notes).
            operationId: update${names.entity}
            security:
                - bearerAuth: []
            parameters:
                - $ref: '${ROOT}#/components/parameters/IdPathParam'
            requestBody:
                required: true
                content:
                    application/json:
                        schema:
                            $ref: '#/components/schemas/Update${names.entity}Request'
                    application/merge-patch+json:
                        schema:
                            $ref: '#/components/schemas/Update${names.entity}Request'
            responses:
                '200':
                    description: Updated ${names.entityCamel}
                    content:
                        application/json:
                            schema:
                                $ref: '#/components/schemas/${names.entity}Envelope'
${KEYED_ERRORS_WITH_NOT_FOUND}
        delete:
            tags: [${names.entity}]
            summary: Delete ${names.entityCamel}
            description: Permanently removes the ${names.entityCamel} identified by {id}.
            operationId: delete${names.entity}
            security:
                - bearerAuth: []
            parameters:
                - $ref: '${ROOT}#/components/parameters/IdPathParam'
            responses:
                '200': { $ref: '${ROOT}#/components/responses/Success' }
${PATH_ONLY_ERRORS}

components:
    schemas:
        ${names.entity}Envelope:
            type: object
            additionalProperties: false
            required: [success, status, message, data]
            properties:
                success:
                    $ref: '${ROOT}#/components/schemas/EnvelopeSuccess'
                status:
                    $ref: '${ROOT}#/components/schemas/EnvelopeStatus'
                message:
                    $ref: '${ROOT}#/components/schemas/EnvelopeMessage'
                data:
                    $ref: '#/components/schemas/${names.entity}'

        ${names.plural}ResponseEnvelope:
            type: object
            additionalProperties: false
            required: [success, status, message, data]
            properties:
                success:
                    $ref: '${ROOT}#/components/schemas/EnvelopeSuccess'
                status:
                    $ref: '${ROOT}#/components/schemas/EnvelopeStatus'
                message:
                    $ref: '${ROOT}#/components/schemas/EnvelopeMessage'
                data:
                    $ref: '#/components/schemas/${names.plural}Response'

        ${names.plural}Response:
            type: object
            additionalProperties: false
            required: [items, meta]
            properties:
                items:
                    type: array
                    items:
                        $ref: '#/components/schemas/${names.entity}'
                meta:
                    $ref: '${ROOT}#/components/schemas/PaginationMeta'

        ${names.entity}:
            type: object
            additionalProperties: false
            required: [id, name, createdAt]
            properties:
                id:
                    $ref: '${ROOT}#/components/schemas/Id'
                name:
                    type: string
                notes:
                    type: string
                createdAt:
                    type: string
                    format: date-time
                updatedAt:
                    type: string
                    format: date-time

        Create${names.entity}Request:
            type: object
            additionalProperties: false
            required: [name]
            properties:
                name:
                    type: string
                    minLength: 1
                    maxLength: 120
                notes:
                    type: string
                    maxLength: 5000

        # PUT: the body IS the new representation, so name is genuinely required.
        Replace${names.entity}Request:
            type: object
            additionalProperties: false
            required: [name]
            properties:
                name:
                    type: string
                    minLength: 1
                    maxLength: 120
                notes:
                    type: string
                    minLength: 1
                    maxLength: 5000
                    nullable: true

        # PATCH: every field optional, omitted means unchanged. null clears notes.
        Update${names.entity}Request:
            type: object
            additionalProperties: false
            properties:
                name:
                    type: string
                    minLength: 1
                    maxLength: 120
                notes:
                    type: string
                    minLength: 1
                    maxLength: 5000
                    nullable: true
`;
