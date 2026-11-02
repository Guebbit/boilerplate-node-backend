/**
 * @module
 * Controller for `GET /tasks` and `POST /tasks/search` — the staff queue in its query and DTO
 * body spellings, built on the shared search-controller factory. Never Redis-cached: the answer is
 * one person's jurisdiction, not a shared shop-wide answer.
 * See docs/modules/tasks.md.
 */

import type { TasksResponse } from '@types';
import { SearchTasksBody } from '@api/schemas.zod';
import { optionalBooleanSchema, pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { callerContextOf } from '@infrastructure/http/request';
import { createSearchController } from '@infrastructure/surfaces/create-search-controller';
import { taskService } from '../service';

/**
 * Extends the orval-generated `SearchTasksBody`; `page`/`pageSize` and `overdue` are coerced
 * from strings since the GET form carries them as query text, not JSON types.
 */
const searchTasksQuerySchema = SearchTasksBody.extend({
    page: pageSchema,
    pageSize: pageSizeSchema,
    overdue: optionalBooleanSchema
});

/**
 * GET /tasks and POST /tasks/search (staff)
 * Search and paginate the tasks in the caller's jurisdiction.
 */
export const getTasks = createSearchController({
    entity: 'tasks',
    schema: searchTasksQuerySchema,
    runSearch: (parsed, request): Promise<TasksResponse> =>
        taskService.search(parsed, callerContextOf(request))
});
