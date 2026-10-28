class Setlist < ApplicationRecord
  belongs_to :group

  has_many :setlist_songs, -> { order(:position) }, dependent: :destroy
  has_many :songs, through: :setlist_songs

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: { scope: :group_id }

  before_validation :generate_slug, if: -> { slug.blank? || name_changed? }

  def to_param
    slug
  end

  def ordered_setlist_songs
    setlist_songs.includes(song: :user).order(:position)
  end

  # Adds a song to the end of the setlist. The song must already be shared
  # into this setlist's group (i.e. present on the group's dashboard) --
  # otherwise some members wouldn't be able to view it during rehearsal.
  def add_song(song)
    return setlist_songs.find_by(song_id: song.id) if setlist_songs.exists?(song_id: song.id)
    return nil unless group.songs.exists?(id: song.id)

    next_position = (setlist_songs.maximum(:position) || 0) + 1
    setlist_songs.create(song: song, position: next_position)
  end

  # Swaps the position of the given setlist_song with its neighbor in the
  # given direction ("up" or "down"). No-op at either end of the list.
  def move(setlist_song, direction)
    ordered = ordered_setlist_songs.to_a
    index = ordered.index { |s| s.id == setlist_song.id }
    return if index.nil?

    neighbor_index = direction == "up" ? index - 1 : index + 1
    return if neighbor_index < 0 || neighbor_index >= ordered.length

    neighbor = ordered[neighbor_index]

    Setlist.transaction do
      current_position = setlist_song.position
      setlist_song.update!(position: neighbor.position)
      neighbor.update!(position: current_position)
    end
  end

  private

  def generate_slug
    base = name.to_s.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/(^-+|-+$)/, "")
    base = "setlist" if base.blank?

    candidate = base
    n = 2
    while group && Setlist.where(group_id: group_id, slug: candidate).where.not(id: id).exists?
      candidate = "#{base}-#{n}"
      n += 1
    end

    self.slug = candidate
  end
end
