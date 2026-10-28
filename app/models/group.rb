# frozen_string_literal: true

class Group < ApplicationRecord
  has_many :memberships, dependent: :destroy
  has_many :users, through: :memberships
  has_one :owner_membership, -> { where(role: "owner") }, class_name: "Membership"
  has_one :owner, through: :owner_membership, source: :user

  has_many :song_shares, dependent: :destroy
  has_many :songs, through: :song_shares

  has_many :setlists, dependent: :destroy
  has_many :live_sessions, dependent: :destroy

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true

  before_validation :generate_slug, if: -> { slug.blank? || name_changed? }

  def to_param
    slug
  end

  def owned_by?(user)
    memberships.exists?(user_id: user.id, role: "owner")
  end

  def member?(user)
    memberships.exists?(user_id: user.id)
  end

  def dashboard_songs
    songs.includes(:user).order(:title)
  end

  def active_live_session
    live_sessions.active.order(created_at: :desc).first
  end

  private

  def generate_slug
    base = name.to_s.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/(^-+|-+$)/, "")
    base = "group" if base.blank?

    candidate = base
    n = 2
    while Group.where(slug: candidate).where.not(id: id).exists?
      candidate = "#{base}-#{n}"
      n += 1
    end

    self.slug = candidate
  end
end
