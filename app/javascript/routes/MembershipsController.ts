// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from './runtime'
import { buildUrl } from './runtime'

type GroupParam = { group_id: string | number }
type MembershipParam = { group_id: string | number; id: string | number }

export default {
  /** POST /groups/:group_id/memberships */
  create: (params: GroupParam, options?: RouteOptions): RouteDefinition<'post'> => ({
    url: buildUrl('/groups/:group_id/memberships', params, options),
    method: 'post',
  }),

  /** DELETE /groups/:group_id/memberships/:id */
  destroy: (params: MembershipParam, options?: RouteOptions): RouteDefinition<'delete'> => ({
    url: buildUrl('/groups/:group_id/memberships/:id', params, options),
    method: 'delete',
  }),
}
