# frozen_string_literal: true

class SongShare < ApplicationRecord
  belongs_to :song
  belongs_to :group

  validates :song_id, uniqueness: { scope: :group_id }

  validate :group_includes_song_owner
  after_destroy :remove_from_group_setlists

  private

  def group_includes_song_owner
    return if song.nil? || group.nil?

    errors.add(:group, "must include the song's owner") unless group.member?(song.user)
  end

  # Unsharing a song from a group makes it inaccessible to non-owner
  # members, so it can no longer stay in any of that group's setlists.
  def remove_from_group_setlists
    SetlistSong.joins(:setlist).where(setlists: { group_id: group_id }, song_id: song_id).destroy_all
  end
end
