# frozen_string_literal: true

# Adding, removing and reordering the songs in one of your own setlists
# (from the setlist's page, or "Add to setlist" on a song's page -- either
# way you're sent back where you were).
class MySetlistSongsController < InertiaController
  before_action :set_setlist

  def create
    song = @setlist.song_pool.find_by(id: params[:song_id])
    entry = song && @setlist.add_song(song)

    if entry&.persisted?
      redirect_back_or_to my_setlist_path(@setlist), notice: "Added #{song.title} to #{@setlist.name}"
    else
      redirect_back_or_to my_setlist_path(@setlist), alert: "Could not add that song."
    end
  end

  def destroy
    entry = @setlist.setlist_songs.find(params[:id])
    title = entry.song.title
    entry.destroy!
    redirect_back_or_to my_setlist_path(@setlist), notice: "Removed #{title} from #{@setlist.name}"
  end

  def move
    entry = @setlist.setlist_songs.find(params[:id])
    @setlist.move(entry, params[:direction] == "up" ? "up" : "down")
    redirect_to my_setlist_path(@setlist)
  end

  private

  def set_setlist
    @setlist = Current.user.setlists.find_by!(slug: params[:my_setlist_id])
  end
end
