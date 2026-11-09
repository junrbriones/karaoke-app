# frozen_string_literal: true

# A solo performer's own setlists: named, ordered runs of any songs they
# can open (their own, and anything shared with a group they're in), run
# straight through in Stage Mode. Every user has these; a group's setlists
# (SetlistsController) are separate and run by the group's owner.
class MySetlistsController < InertiaController
  before_action :set_setlist, only: %i[show edit update destroy stage]

  def index
    render inertia: "setlists/index", props: {
      setlists: Current.user.setlists.order(:name).map { |s| setlist_json(s) },
      starred_count: Current.user.songs.in_setlist.count
    }
  end

  def show
    render inertia: "setlists/show", props: { setlist: setlist_detail_json }
  end

  def new
    song = params[:song_id].present? ? Song.accessible_to(Current.user).find_by(id: params[:song_id]) : nil
    render inertia: "setlists/new", props: { song: song&.summary_json(Current.user) }
  end

  # Optionally with a first song (when made from a song's page).
  def create
    @setlist = Current.user.setlists.new(setlist_params)

    if @setlist.save
      song = params[:song_id].present? ? @setlist.song_pool.find_by(id: params[:song_id]) : nil
      @setlist.add_song(song) if song
      redirect_to my_setlist_path(@setlist), notice: song ? "Setlist created with #{song.title}" : "Setlist created"
    else
      redirect_to new_my_setlist_path(song_id: params[:song_id].presence), inertia: { errors: @setlist.errors }
    end
  end

  def edit
    render inertia: "setlists/edit", props: { setlist: setlist_json(@setlist) }
  end

  def update
    if @setlist.update(setlist_params)
      redirect_to my_setlist_path(@setlist), notice: "Setlist renamed"
    else
      redirect_to edit_my_setlist_path(@setlist), inertia: { errors: @setlist.errors }
    end
  end

  def destroy
    @setlist.destroy!
    redirect_to my_setlists_path, notice: "Setlist deleted"
  end

  # Runs the setlist's songs, in order, through Stage Mode.
  def stage
    render inertia: "songs/stage", props: {
      songs: playable_entries.map { |ss| ss.song.detail_json(Current.user) },
      single: false,
      exit_href: my_setlist_path(@setlist)
    }
  end

  private

  def set_setlist
    @setlist = Current.user.setlists.find_by!(slug: params[:id])
  end

  def setlist_params
    params.permit(:name)
  end

  def setlist_json(setlist)
    { id: setlist.id, name: setlist.name, slug: setlist.slug, song_count: setlist.setlist_songs.count }
  end

  # A song stops being openable if it's unshared from (or they leave) the
  # group it came through; it stays listed, marked, but isn't played.
  def openable_song_ids(entries)
    @setlist.song_pool.where(id: entries.map(&:song_id)).pluck(:id).to_set
  end

  def playable_entries
    entries = @setlist.ordered_setlist_songs.to_a
    ok = openable_song_ids(entries)
    entries.select { |ss| ok.include?(ss.song_id) }
  end

  def setlist_detail_json
    entries = @setlist.ordered_setlist_songs.to_a
    ok = openable_song_ids(entries)
    available = @setlist.song_pool.where.not(id: entries.map(&:song_id)).includes(:user).reorder(:title)

    setlist_json(@setlist).merge(
      is_owner: true,
      entries: entries.map do |ss|
        { id: ss.id, position: ss.position, unavailable: !ok.include?(ss.song_id), song: ss.song.summary_json(Current.user) }
      end,
      available_songs: available.map { |s| s.summary_json(Current.user) }
    )
  end
end
