// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from '../runtime'
import { buildUrl } from '../runtime'

export default {
  /** GET /admin/users */
  index: (options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/admin/users', {}, options),
    method: 'get',
  }),

  /** GET /admin/users/new */
  new: (options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/admin/users/new', {}, options),
    method: 'get',
  }),

  /** POST /admin/users */
  create: (options?: RouteOptions): RouteDefinition<'post'> => ({
    url: buildUrl('/admin/users', {}, options),
    method: 'post',
  }),
}
