# frozen_string_literal: true

class SongSharesController < InertiaController
  before_action :set_song

  def create
    group = @song.user.groups.find_by(id: params[:group_id])
    if group.nil?
      redirect_to song_path(@song), alert: "You can only share to a group you belong to."
      return
    end

    @song.song_shares.find_or_create_by!(group: group)
    redirect_to song_path(@song), notice: "Shared to #{group.name}"
  rescue ActiveRecord::RecordInvalid
    redirect_to song_path(@song), alert: "Could not share that song."
  end

  def destroy
    share = @song.song_shares.find(params[:id])
    group_name = share.group.name
    share.destroy!
    redirect_to song_path(@song), notice: "Unshared from #{group_name}"
  end

  private

  def set_song
    @song = Current.user.songs.find_by!(slug: params[:song_id])
  end
end
