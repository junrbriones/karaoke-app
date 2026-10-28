// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from './runtime'
import { buildUrl } from './runtime'

type GroupParam = { group_id: string | number }
type SetlistParam = { group_id: string | number; id: string | number }

export default {
  /** GET /groups/:group_id/setlists */
  index: (params: GroupParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/groups/:group_id/setlists', params, options),
    method: 'get',
  }),

  /** GET /groups/:group_id/setlists/new */
  new: (params: GroupParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/groups/:group_id/setlists/new', params, options),
    method: 'get',
  }),

  /** POST /groups/:group_id/setlists */
  create: (params: GroupParam, options?: RouteOptions): RouteDefinition<'post'> => ({
    url: buildUrl('/groups/:group_id/setlists', params, options),
    method: 'post',
  }),

  /** GET /groups/:group_id/setlists/:id */
  show: (params: SetlistParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/groups/:group_id/setlists/:id', params, options),
    method: 'get',
  }),

  /** GET /groups/:group_id/setlists/:id/edit */
  edit: (params: SetlistParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/groups/:group_id/setlists/:id/edit', params, options),
    method: 'get',
  }),

  /** PATCH /groups/:group_id/setlists/:id */
  update: (params: SetlistParam, options?: RouteOptions): RouteDefinition<'patch'> => ({
    url: buildUrl('/groups/:group_id/setlists/:id', params, options),
    method: 'patch',
  }),

  /** DELETE /groups/:group_id/setlists/:id */
  destroy: (params: SetlistParam, options?: RouteOptions): RouteDefinition<'delete'> => ({
    url: buildUrl('/groups/:group_id/setlists/:id', params, options),
    method: 'delete',
  }),

  /** GET /groups/:group_id/setlists/:id/stage */
  stage: (params: SetlistParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/groups/:group_id/setlists/:id/stage', params, options),
    method: 'get',
  }),
}
