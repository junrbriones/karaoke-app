// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from './runtime'
import { buildUrl } from './runtime'

type IdParam = { id: string | number } | string | number

export default {
  /** GET /groups */
  index: (options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/groups', {}, options),
    method: 'get',
  }),

  /** GET /groups/:id */
  show: (params: IdParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/groups/:id', params, options),
    method: 'get',
  }),

  /** GET /groups/:id/edit */
  edit: (params: IdParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/groups/:id/edit', params, options),
    method: 'get',
  }),

  /** PATCH /groups/:id */
  update: (params: IdParam, options?: RouteOptions): RouteDefinition<'patch'> => ({
    url: buildUrl('/groups/:id', params, options),
    method: 'patch',
  }),

  /** DELETE /groups/:id */
  destroy: (params: IdParam, options?: RouteOptions): RouteDefinition<'delete'> => ({
    url: buildUrl('/groups/:id', params, options),
    method: 'delete',
  }),
}
