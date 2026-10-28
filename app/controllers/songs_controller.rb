# frozen_string_literal: true

class SongsController < InertiaController
  before_action :set_owned_song, only: %i[edit update destroy toggle_setlist]
  before_action :set_viewable_song, only: %i[show stage]

  def index
    render inertia: "songs/index", props: {
      songs: current_user_songs.alphabetical.map { |s| s.summary_json(Current.user) }
    }
  end

  # Viewable by the owner or by anyone in a group the song is shared with.
  def show
    render inertia: "songs/show", props: { song: @song.detail_json(Current.user) }
  end

  def new
    render inertia: "songs/new"
  end

  def create
    @song = Current.user.songs.new(song_params)

    if @song.save
      redirect_to song_path(@song), notice: "Song saved"
    else
      redirect_to new_song_path, inertia: { errors: @song.errors }
    end
  end

  def edit
    render inertia: "songs/edit", props: { song: @song.detail_json(Current.user) }
  end

  def update
    if @song.update(song_params)
      redirect_to song_path(@song), notice: "Song updated"
    else
      redirect_to edit_song_path(@song), inertia: { errors: @song.errors }
    end
  end

  def destroy
    @song.destroy!
    redirect_to songs_path, notice: "Song deleted"
  end

  def toggle_setlist
    @song.update!(in_setlist: !@song.in_setlist)
    redirect_back fallback_location: songs_path
  end

  # Stage Mode. With an :id, runs a single song (yours, or one shared into
  # a group you're in). Without one, runs your own starred setlist.
  def stage
    if @song
      render inertia: "songs/stage", props: { songs: [ @song.detail_json(Current.user) ], single: true }
    else
      render inertia: "songs/stage", props: {
        songs: current_user_songs.in_setlist.alphabetical.map { |s| s.detail_json(Current.user) },
        single: false
      }
    end
  end

  private

  def set_owned_song
    @song = current_user_songs.find_by!(slug: params[:id])
  end

  def set_viewable_song
    @song = Song.accessible_to(Current.user).find_by!(slug: params[:id]) if params[:id]
  end

  def current_user_songs
    Current.user.songs
  end

  def song_params
    params.permit(:title, :artist, :key, :capo, :tempo, :body)
  end
end
