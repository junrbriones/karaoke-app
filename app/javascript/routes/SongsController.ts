// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from './runtime'
import { buildUrl } from './runtime'

type IdParam = { id: string | number } | string | number

export default {
  /** GET /songs */
  index: (options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/songs', {}, options),
    method: 'get',
  }),

  /** GET /songs/new */
  new: (options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/songs/new', {}, options),
    method: 'get',
  }),

  /** POST /songs */
  create: (options?: RouteOptions): RouteDefinition<'post'> => ({
    url: buildUrl('/songs', {}, options),
    method: 'post',
  }),

  /** GET /songs/:id */
  show: (params: IdParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/songs/:id', params, options),
    method: 'get',
  }),

  /** GET /songs/:id/edit */
  edit: (params: IdParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/songs/:id/edit', params, options),
    method: 'get',
  }),

  /** PATCH /songs/:id */
  update: (params: IdParam, options?: RouteOptions): RouteDefinition<'patch'> => ({
    url: buildUrl('/songs/:id', params, options),
    method: 'patch',
  }),

  /** DELETE /songs/:id */
  destroy: (params: IdParam, options?: RouteOptions): RouteDefinition<'delete'> => ({
    url: buildUrl('/songs/:id', params, options),
    method: 'delete',
  }),

  /** PATCH /songs/:id/toggle_setlist */
  toggleSetlist: (params: IdParam, options?: RouteOptions): RouteDefinition<'patch'> => ({
    url: buildUrl('/songs/:id/toggle_setlist', params, options),
    method: 'patch',
  }),

  /** GET /songs/:id/stage */
  stage: (params: IdParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/songs/:id/stage', params, options),
    method: 'get',
  }),
}
