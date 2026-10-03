/**
 * @module
 * In any module: a controller is thin wiring — decode the request, call the service, shape the
 * answer. Here, `GET /examples` and `POST /examples/search`: one search in its query and DTO
 * spellings, built on the shared search-controller factory.
 *
 * See: docs/theory/request-flow.md
 */

import { SearchExamplesBody } from '@api/schemas.zod';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { callerContextOf } from '@infrastructure/http/request';
import { createSearchController } from '@infrastructure/surfaces/create-search-controller';
import { exampleService } from '../services';

/**
 * The generated body schema, with `page`/`pageSize` coerced from strings: the GET form carries
 * them as query text, not as JSON numbers.
 */
const searchExamplesQuerySchema = SearchExamplesBody.extend({
    page: pageSchema,
    pageSize: pageSizeSchema
});

/** GET /examples and POST /examples/search — the caller's own examples, or everyone's with `examples.any.read`. */
export const getExamples = createSearchController({
    entity: 'examples',
    schema: searchExamplesQuerySchema,
    runSearch: (parsed, request) => exampleService.search(parsed, callerContextOf(request))
});
