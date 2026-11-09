// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from './runtime'
import { buildUrl } from './runtime'

type SetlistParam = { my_setlist_id: string | number }
type EntryParam = { my_setlist_id: string | number; id: string | number }

export default {
  /** POST /setlists/:my_setlist_id/entries */
  create: (params: SetlistParam, options?: RouteOptions): RouteDefinition<'post'> => ({
    url: buildUrl('/setlists/:my_setlist_id/entries', params, options),
    method: 'post',
  }),

  /** DELETE /setlists/:my_setlist_id/entries/:id */
  destroy: (params: EntryParam, options?: RouteOptions): RouteDefinition<'delete'> => ({
    url: buildUrl('/setlists/:my_setlist_id/entries/:id', params, options),
    method: 'delete',
  }),

  /** PATCH /setlists/:my_setlist_id/entries/:id/move */
  move: (params: EntryParam, options?: RouteOptions): RouteDefinition<'patch'> => ({
    url: buildUrl('/setlists/:my_setlist_id/entries/:id/move', params, options),
    method: 'patch',
  }),
}
