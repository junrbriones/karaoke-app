# frozen_string_literal: true

# One entry in the admin activity log (Admin::ActivityController): who did
# what, to what, when, from where, and whether it worked. Recorded by
# TracksActivity for ordinary actions, and directly for signing in/out,
# which happen before/after there's a signed-in user to go by.
#
# Logging must never get in the way: `record` swallows its own errors.
class ActivityEvent < ApplicationRecord
  RETENTION = 1.year

  # action => [category, how it reads in the log]
  ACTIONS = {
    "signed_in" => [ "sign_in", "Signed in" ],
    "sign_in_failed" => [ "sign_in", "Failed to sign in" ],
    "signed_out" => [ "sign_in", "Signed out" ],
    "session_revoked" => [ "sign_in", "Logged out another device" ],
    "password_reset_requested" => [ "account", "Asked for a password reset" ],
    "password_reset" => [ "account", "Reset their password" ],
    "email_verified" => [ "account", "Verified their email" ],
    "verification_resent" => [ "account", "Asked for a new verification email" ],
    "password_changed" => [ "account", "Changed their password" ],
    "email_changed" => [ "account", "Changed their email" ],
    "profile_updated" => [ "account", "Updated their profile" ],
    "account_deleted" => [ "account", "Deleted their account" ],
    "user_created" => [ "admin", "Added a user" ],
    "group_created" => [ "admin", "Created a group" ],
    "song_created" => [ "songs", "Added a song" ],
    "songs_imported" => [ "songs", "Imported songs" ],
    "song_updated" => [ "songs", "Edited a song" ],
    "song_deleted" => [ "songs", "Deleted a song" ],
    "setlist_toggled" => [ "songs", "Starred/unstarred a song" ],
    "stage_opened" => [ "songs", "Opened Stage Mode" ],
    "sync_saved" => [ "songs", "Saved a karaoke sync" ],
    "audio_uploaded" => [ "songs", "Uploaded a song's audio" ],
    "minus_one_uploaded" => [ "songs", "Uploaded a minus-one" ],
    "minus_one_removed" => [ "songs", "Removed a minus-one" ],
    "line_timing_saved" => [ "songs", "Saved line timing" ],
    "song_shared" => [ "groups", "Shared a song with a group" ],
    "song_unshared" => [ "groups", "Stopped sharing a song" ],
    "group_updated" => [ "groups", "Edited a group" ],
    "group_deleted" => [ "groups", "Deleted a group" ],
    "member_added" => [ "groups", "Added a group member" ],
    "member_removed" => [ "groups", "Removed a group member" ],
    "setlist_created" => [ "groups", "Created a setlist" ],
    "setlist_updated" => [ "groups", "Edited a setlist" ],
    "setlist_deleted" => [ "groups", "Deleted a setlist" ],
    "setlist_song_added" => [ "groups", "Added a song to a setlist" ],
    "setlist_song_removed" => [ "groups", "Removed a song from a setlist" ],
    "setlist_stage_opened" => [ "groups", "Opened a setlist in Stage Mode" ],
    "personal_setlist_created" => [ "songs", "Created a setlist" ],
    "personal_setlist_updated" => [ "songs", "Renamed a setlist" ],
    "personal_setlist_deleted" => [ "songs", "Deleted a setlist" ],
    "personal_setlist_song_added" => [ "songs", "Added a song to a setlist" ],
    "personal_setlist_song_removed" => [ "songs", "Removed a song from a setlist" ],
    "personal_setlist_stage_opened" => [ "songs", "Opened a setlist in Stage Mode" ],
    "live_session_started" => [ "groups", "Started a live session" ],
    "live_session_ended" => [ "groups", "Ended a live session" ]
  }.freeze

  CATEGORIES = {
    "sign_in" => "Sign-ins",
    "account" => "Account",
    "admin" => "Admin",
    "songs" => "Songs",
    "groups" => "Groups & live"
  }.freeze

  belongs_to :user, optional: true

  validates :action, inclusion: { in: ACTIONS.keys }
  validates :outcome, inclusion: { in: %w[ok failed] }

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }

  def self.record(action, user: Current.user, subject: nil, label: nil, outcome: "ok", details: {})
    category, = ACTIONS.fetch(action)
    user = nil unless user&.persisted? && !user.destroyed?
    create!(
      user: user,
      actor_label: user && "#{user.name} <#{user.email}>",
      action: action,
      category: category,
      outcome: outcome,
      subject_type: subject&.class&.name,
      subject_id: subject&.id,
      subject_label: (label || label_for(subject))&.to_s&.truncate(200),
      details: details.compact.presence,
      ip_address: Current.ip_address,
      user_agent: Current.user_agent&.truncate(500)
    ).tap { prune_now_and_then }
  rescue StandardError => e
    Rails.logger.warn("[activity] #{action} not recorded: #{e.class}: #{e.message}")
    nil
  end

  def self.label_for(subject)
    return nil if subject.nil?

    subject.try(:title).presence || subject.try(:name).presence ||
      subject.try(:email).presence || "#{subject.class.name} ##{subject.id}"
  end

  # Old entries go now and then, rather than piling up forever.
  def self.prune_now_and_then
    prune! if rand < 0.01
  end

  def self.prune!
    where(created_at: ...RETENTION.ago).delete_all
  end

  def label
    ACTIONS.dig(action, 1) || action.humanize
  end

  def as_admin_json
    {
      id: id,
      at: created_at.iso8601,
      action: action,
      label: label,
      category: category,
      outcome: outcome,
      user_id: user_id,
      actor: actor_label,
      subject: subject_label,
      subject_type: subject_type,
      details: details || {},
      ip_address: ip_address,
      user_agent: user_agent
    }
  end
end
