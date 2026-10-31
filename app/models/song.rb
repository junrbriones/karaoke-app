# frozen_string_literal: true

class Song < ApplicationRecord
  # KaraFun-style phrasing sync: an uploaded audio track, plus a JSON blob
  # {sourceText, complete, screens: [{label, instrumental, lines: [{tokens:
  # [{text, wordStart, time}]}]}]} built and tapped out in the phrasing
  # editor (see Songs::PhrasingsController and app/javascript/lib/phrasing.ts).
  # Stored as an opaque JSON document -- same treatment as live_sessions'
  # song_ids column elsewhere in this app -- and only trusted for Stage Mode
  # playback once its own "complete" flag says every token has a tapped time.
  ALLOWED_AUDIO_TYPES = %w[
    audio/mpeg audio/mp3 audio/mp4 audio/wav audio/x-wav audio/wave
    audio/ogg audio/webm audio/aac audio/flac audio/x-m4a
  ].freeze
  MAX_AUDIO_BYTES = 30.megabytes

  belongs_to :user
  has_one_attached :audio

  has_many :song_shares, dependent: :destroy
  has_many :groups, through: :song_shares
  has_many :setlist_songs, dependent: :destroy

  validates :title, presence: true
  validates :slug, presence: true, uniqueness: { scope: :user_id }
  validate :audio_is_valid

  before_validation :generate_slug, if: -> { slug.blank? || title_changed? }

  scope :in_setlist, -> { where(in_setlist: true) }
  scope :alphabetical, -> { order(:title) }

  # Songs a user may view: their own, plus anything shared into a group
  # they belong to.
  def self.accessible_to(user)
    left_joins(:groups)
      .where("songs.user_id = :user_id OR groups.id IN (:group_ids)", user_id: user.id, group_ids: user.group_ids.presence || [ nil ])
      .distinct
  end

  def to_param
    slug
  end

  def owned_by?(user)
    user_id == user.id
  end

  # Compact JSON for lists (library grid, group dashboard, setlist).
  def summary_json(viewer)
    {
      id: id,
      title: title,
      artist: artist,
      key: key,
      capo: capo,
      tempo: tempo,
      slug: slug,
      in_setlist: in_setlist,
      owned: owned_by?(viewer),
      owner_name: owned_by?(viewer) ? nil : user.name,
      has_audio: audio.attached?,
      phrasing_ready: phrasing_complete?
    }
  end

  # Full JSON for a single song's page, including the body and (for the
  # owner only) sharing info.
  def detail_json(viewer)
    json = summary_json(viewer).merge(body: body, phrasing: phrasing, line_timing: line_timing, audio_url: audio_url)
    return json unless owned_by?(viewer)

    json.merge(
      shares: song_shares.map { |s| { id: s.id, group_id: s.group_id } },
      shareable_groups: viewer.groups.order(:name).map { |g| { id: g.id, name: g.name } }
    )
  end

  def audio_url
    return nil unless audio.attached?
    Rails.application.routes.url_helpers.rails_blob_path(audio, only_path: true)
  end

  # True once the phrasing editor's own bookkeeping says every token has a
  # tapped time -- computed and saved by the client (see phrasing.ts's
  # isComplete), not re-derived here, since this JSON is opaque to Ruby.
  def phrasing_complete?
    phrasing.present? && phrasing["complete"] == true && phrasing["screens"].present?
  end

  private

  def audio_is_valid
    return unless audio.attached?

    blob = audio.blob
    return unless blob

    unless ALLOWED_AUDIO_TYPES.include?(blob.content_type)
      errors.add(:audio, "must be an audio file (mp3, wav, ogg, m4a, aac, or flac)")
    end

    if blob.byte_size > MAX_AUDIO_BYTES
      errors.add(:audio, "must be smaller than #{MAX_AUDIO_BYTES / 1.megabyte}MB")
    end
  end

  def generate_slug
    base = title.to_s.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/(^-+|-+$)/, "")
    base = "untitled" if base.blank?

    candidate = base
    n = 2
    while user && Song.where(user_id: user_id, slug: candidate).where.not(id: id).exists?
      candidate = "#{base}-#{n}"
      n += 1
    end

    self.slug = candidate
  end
end
