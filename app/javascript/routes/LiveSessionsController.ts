// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from './runtime'
import { buildUrl } from './runtime'

type GroupParam = { group_id: string | number }

export default {
  /** GET /groups/:group_id/live_session */
  show: (params: GroupParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/groups/:group_id/live_session', params, options),
    method: 'get',
  }),

  /** POST /groups/:group_id/live_session */
  create: (params: GroupParam, options?: RouteOptions): RouteDefinition<'post'> => ({
    url: buildUrl('/groups/:group_id/live_session', params, options),
    method: 'post',
  }),

  /** PATCH /groups/:group_id/live_session */
  update: (params: GroupParam, options?: RouteOptions): RouteDefinition<'patch'> => ({
    url: buildUrl('/groups/:group_id/live_session', params, options),
    method: 'patch',
  }),

  /** DELETE /groups/:group_id/live_session */
  destroy: (params: GroupParam, options?: RouteOptions): RouteDefinition<'delete'> => ({
    url: buildUrl('/groups/:group_id/live_session', params, options),
    method: 'delete',
  }),
}
