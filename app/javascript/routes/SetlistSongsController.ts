// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from './runtime'
import { buildUrl } from './runtime'

type SetlistParam = { group_id: string | number; setlist_id: string | number }
type EntryParam = { group_id: string | number; setlist_id: string | number; id: string | number }

export default {
  /** POST /groups/:group_id/setlists/:setlist_id/setlist_songs */
  create: (params: SetlistParam, options?: RouteOptions): RouteDefinition<'post'> => ({
    url: buildUrl('/groups/:group_id/setlists/:setlist_id/setlist_songs', params, options),
    method: 'post',
  }),

  /** DELETE /groups/:group_id/setlists/:setlist_id/setlist_songs/:id */
  destroy: (params: EntryParam, options?: RouteOptions): RouteDefinition<'delete'> => ({
    url: buildUrl('/groups/:group_id/setlists/:setlist_id/setlist_songs/:id', params, options),
    method: 'delete',
  }),

  /** PATCH /groups/:group_id/setlists/:setlist_id/setlist_songs/:id/move */
  move: (params: EntryParam, options?: RouteOptions): RouteDefinition<'patch'> => ({
    url: buildUrl('/groups/:group_id/setlists/:setlist_id/setlist_songs/:id/move', params, options),
    method: 'patch',
  }),
}
