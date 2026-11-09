// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from './runtime'
import { buildUrl } from './runtime'

type SetlistParam = { id: string | number }

export default {
  /** GET /setlists */
  index: (options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/setlists', {}, options),
    method: 'get',
  }),

  /** GET /setlists/new */
  new: (options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/setlists/new', {}, options),
    method: 'get',
  }),

  /** POST /setlists */
  create: (options?: RouteOptions): RouteDefinition<'post'> => ({
    url: buildUrl('/setlists', {}, options),
    method: 'post',
  }),

  /** GET /setlists/:id */
  show: (params: SetlistParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/setlists/:id', params, options),
    method: 'get',
  }),

  /** GET /setlists/:id/edit */
  edit: (params: SetlistParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/setlists/:id/edit', params, options),
    method: 'get',
  }),

  /** PATCH /setlists/:id */
  update: (params: SetlistParam, options?: RouteOptions): RouteDefinition<'patch'> => ({
    url: buildUrl('/setlists/:id', params, options),
    method: 'patch',
  }),

  /** DELETE /setlists/:id */
  destroy: (params: SetlistParam, options?: RouteOptions): RouteDefinition<'delete'> => ({
    url: buildUrl('/setlists/:id', params, options),
    method: 'delete',
  }),

  /** GET /setlists/:id/stage */
  stage: (params: SetlistParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/setlists/:id/stage', params, options),
    method: 'get',
  }),
}
