// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
import type { RouteDefinition, RouteOptions } from './runtime'
import { buildUrl } from './runtime'

type SongParam = { song_id: string | number }
type ShareParam = { song_id: string | number; id: string | number }

export default {
  /** POST /songs/:song_id/song_shares */
  create: (params: SongParam, options?: RouteOptions): RouteDefinition<'post'> => ({
    url: buildUrl('/songs/:song_id/song_shares', params, options),
    method: 'post',
  }),

  /** DELETE /songs/:song_id/song_shares/:id */
  destroy: (params: ShareParam, options?: RouteOptions): RouteDefinition<'delete'> => ({
    url: buildUrl('/songs/:song_id/song_shares/:id', params, options),
    method: 'delete',
  }),
}
