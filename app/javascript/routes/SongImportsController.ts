// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from './runtime'
import { buildUrl } from './runtime'

export default {
  /** GET /songs/import */
  new: (options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/songs/import', {}, options),
    method: 'get',
  }),

  /** POST /songs/import */
  create: (options?: RouteOptions): RouteDefinition<'post'> => ({
    url: buildUrl('/songs/import', {}, options),
    method: 'post',
  }),
}
