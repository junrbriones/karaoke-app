// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from '../runtime'
import { buildUrl } from '../runtime'

type UserParam = { user_id: string | number }

export default {
  /** GET /admin/users/:user_id/password/edit */
  edit: (params: UserParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/admin/users/:user_id/password/edit', params, options),
    method: 'get',
  }),

  /** PATCH /admin/users/:user_id/password */
  update: (params: UserParam, options?: RouteOptions): RouteDefinition<'patch'> => ({
    url: buildUrl('/admin/users/:user_id/password', params, options),
    method: 'patch',
  }),
}
