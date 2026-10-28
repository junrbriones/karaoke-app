// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from '../runtime'
import { buildUrl } from '../runtime'

type SongParam = { song_id: string | number }

export default {
  /** GET /songs/:song_id/phrasing */
  show: (params: SongParam, options?: RouteOptions): RouteDefinition<'get'> => ({
    url: buildUrl('/songs/:song_id/phrasing', params, options),
    method: 'get',
  }),

  /** PATCH /songs/:song_id/phrasing */
  update: (params: SongParam, options?: RouteOptions): RouteDefinition<'patch'> => ({
    url: buildUrl('/songs/:song_id/phrasing', params, options),
    method: 'patch',
  }),
}
