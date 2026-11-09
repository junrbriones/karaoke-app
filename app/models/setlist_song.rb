class SetlistSong < ApplicationRecord
  belongs_to :setlist
  belongs_to :song

  validates :song_id, uniqueness: { scope: :setlist_id }
  validate :song_in_setlist_pool

  private

  def song_in_setlist_pool
    return if setlist.nil? || song.nil?
    return if setlist.can_include?(song)

    errors.add(:song, setlist.personal? ? "isn't one you can open" : "must be shared with the setlist's group first")
  end
end
