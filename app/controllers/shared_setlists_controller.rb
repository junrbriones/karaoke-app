# frozen_string_literal: true

# Someone else's setlist that they've shared with everyone signed in to the
# app: open it and run it in Stage Mode, read-only. Its owner's own songs
# come with it; a song the owner has from one of their groups only plays
# for people who can open it anyway (Setlist#playable_song_ids_for).
class SharedSetlistsController < InertiaController
  before_action :set_setlist

  def show
    # Your own: the full editor.
    return redirect_to(my_setlist_path(@setlist)) if @setlist.user_id == Current.user.id

    entries = @setlist.ordered_setlist_songs.to_a
    playable = @setlist.playable_song_ids_for(Current.user, entries.map(&:song_id))
    openable = Song.accessible_to(Current.user).where(id: entries.map(&:song_id)).pluck(:id).to_set

    render inertia: "setlists/show", props: {
      setlist: {
        id: @setlist.id, name: @setlist.name, slug: @setlist.slug,
        song_count: entries.size, shared: true,
        is_owner: false, owner_name: @setlist.user.name,
        entries: entries.map do |ss|
          {
            id: ss.id, position: ss.position,
            unavailable: !playable.include?(ss.song_id),
            openable: openable.include?(ss.song_id),
            song: ss.song.summary_json(Current.user)
          }
        end
      }
    }
  end

  # Runs it through Stage Mode -- from the first song, or from `start` (a
  # position among the playable songs).
  def stage
    entries = @setlist.ordered_setlist_songs.to_a
    playable = @setlist.playable_song_ids_for(Current.user, entries.map(&:song_id))
    render inertia: "songs/stage", props: {
      songs: entries.select { |ss| playable.include?(ss.song_id) }.map { |ss| ss.song.detail_json(Current.user) },
      single: false,
      start_index: params[:start].to_i.clamp(0, 10_000),
      exit_href: shared_setlist_path(id: @setlist.id)
    }
  end

  private

  # Only a shared one (or your own, by its id).
  def set_setlist
    @setlist = Setlist.personal.includes(:user).find(params[:id])
    raise ActiveRecord::RecordNotFound unless @setlist.viewable_by?(Current.user)
  end
end
