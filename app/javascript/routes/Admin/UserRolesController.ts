// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from '../runtime'
import { buildUrl } from '../runtime'

type UserParam = { user_id: string | number }

export default {
  /** PATCH /admin/users/:user_id/role */
  update: (params: UserParam, options?: RouteOptions): RouteDefinition<'patch'> => ({
    url: buildUrl('/admin/users/:user_id/role', params, options),
    method: 'patch',
  }),
}
