class SetlistSong < ApplicationRecord
  belongs_to :setlist
  belongs_to :song

  validates :song_id, uniqueness: { scope: :setlist_id }
  validate :song_shared_with_group

  private

  def song_shared_with_group
    return if setlist.nil? || song.nil?

    errors.add(:song, "must be shared with the setlist's group first") unless setlist.group.songs.exists?(id: song.id)
  end
end
