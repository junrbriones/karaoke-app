# A named, ordered run of songs. Either a group's (planned by the group
# owner, drawn from the songs shared with the group, run by every member)
# or one user's own -- a solo performer's -- drawn from any song they can
# open: their own and anything shared with a group they're in.
class Setlist < ApplicationRecord
  belongs_to :group, optional: true
  belongs_to :user, optional: true

  has_many :setlist_songs, -> { order(:position) }, dependent: :destroy
  has_many :songs, through: :setlist_songs

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: { scope: %i[group_id user_id] }
  validate :belongs_to_a_group_or_a_user

  scope :personal, -> { where(group_id: nil) }

  before_validation :generate_slug, if: -> { slug.blank? || name_changed? }

  def to_param
    slug
  end

  def ordered_setlist_songs
    setlist_songs.includes(song: :user).order(:position)
  end

  def personal?
    group_id.nil?
  end

  # The songs this setlist can draw from: for a group's, the songs shared
  # into the group (so every member can open them during rehearsal); for a
  # personal one, every song its owner can open.
  def song_pool
    personal? ? Song.accessible_to(user) : group.songs
  end

  def can_include?(song)
    song_pool.exists?(id: song.id)
  end

  # Adds a song to the end of the setlist, if it's one the setlist can draw
  # from (see song_pool).
  def add_song(song)
    return setlist_songs.find_by(song_id: song.id) if setlist_songs.exists?(song_id: song.id)
    return nil unless can_include?(song)

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

  def belongs_to_a_group_or_a_user
    errors.add(:base, "A setlist belongs to a group or to one person") unless group_id.present? ^ user_id.present?
  end

  def generate_slug
    base = name.to_s.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/(^-+|-+$)/, "")
    base = "setlist" if base.blank?

    candidate = base
    n = 2
    while Setlist.where(group_id: group_id, user_id: user_id, slug: candidate).where.not(id: id).exists?
      candidate = "#{base}-#{n}"
      n += 1
    end

    self.slug = candidate
  end
end
