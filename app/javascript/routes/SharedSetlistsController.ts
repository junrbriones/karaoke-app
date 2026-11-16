// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from './runtime'
import { buildUrl } from './runtime'

type SharedSetlistParam = { id: string | number }

export default {
  /** GET /setlists/shared/:id */
  show: (params: SharedSetlistParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/setlists/shared/:id', params, options),
    method: 'get',
  }),

  /** GET /setlists/shared/:id/stage */
  stage: (params: SharedSetlistParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/setlists/shared/:id/stage', params, options),
    method: 'get',
  }),
}
