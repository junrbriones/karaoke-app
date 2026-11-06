// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from '../runtime'
import { buildUrl } from '../runtime'

export default {
  /** GET /admin/activity */
  index: (options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/admin/activity', {}, options),
    method: 'get',
  }),
}
