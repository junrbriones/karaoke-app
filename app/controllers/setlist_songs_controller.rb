# frozen_string_literal: true

class SetlistSongsController < InertiaController
  before_action :set_group
  before_action :set_setlist
  before_action :require_owner

  def create
    song = @group.songs.find_by(id: params[:song_id])
    if song.nil?
      redirect_to group_setlist_path(@group, @setlist), alert: "That song isn't shared with this group."
      return
    end

    entry = @setlist.add_song(song)
    if entry&.persisted?
      redirect_to group_setlist_path(@group, @setlist), notice: "Added #{song.title} to #{@setlist.name}"
    else
      redirect_to group_setlist_path(@group, @setlist), alert: "Could not add that song."
    end
  end

  def destroy
    entry = @setlist.setlist_songs.find(params[:id])
    song_title = entry.song.title
    entry.destroy!
    redirect_to group_setlist_path(@group, @setlist), notice: "Removed #{song_title} from #{@setlist.name}"
  end

  def move
    entry = @setlist.setlist_songs.find(params[:id])
    direction = params[:direction] == "up" ? "up" : "down"
    @setlist.move(entry, direction)
    redirect_to group_setlist_path(@group, @setlist)
  end

  private

  def set_group
    @group = Current.user.groups.find_by!(slug: params[:group_id])
  end

  def set_setlist
    @setlist = @group.setlists.find_by!(slug: params[:setlist_id])
  end

  def require_owner
    redirect_to group_setlist_path(@group, @setlist), alert: "Only the group owner can do that." unless @group.owned_by?(Current.user)
  end
end
