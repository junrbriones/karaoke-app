# frozen_string_literal: true

# Records the admin activity log (ActivityEvent) for the actions listed in
# TRACKED, after they run -- with whether they worked: a validation error,
# an alert or an error status counts as a failed attempt. Anything not
# listed (page views, live-session play/pause commands...) isn't logged.
#
# Signing in and out are recorded directly in SessionsController (there's
# no signed-in user yet/anymore by the time this would run), as is an
# account deletion (in UsersController, before the account is gone).
module TracksActivity
  extend ActiveSupport::Concern

  # "controller#action" => [event (or a method choosing one), subject ivar,
  #   options]. actor: an ivar holding the user when nobody's signed in.
  TRACKED = {
    "identity/password_resets#update" => [ "password_reset", nil, { actor: :@user } ],
    "identity/email_verifications#show" => [ "email_verified", nil, { actor: :@user } ],
    "identity/email_verifications#create" => [ "verification_resent" ],
    "settings/passwords#update" => [ "password_changed" ],
    "settings/emails#update" => [ "email_changed" ],
    "settings/profiles#update" => [ "profile_updated" ],
    "admin/users#create" => [ "user_created", :@user ],
    "admin/user_passwords#update" => [ "user_password_reset", :@user ],
    "admin/groups#create" => [ "group_created", :@group ],
    "songs#create" => [ "song_created", :@song ],
    "song_imports#create" => [ "songs_imported" ],
    "songs#update" => [ "song_updated", :@song ],
    "songs#destroy" => [ "song_deleted", :@song ],
    "songs#toggle_setlist" => [ "setlist_toggled", :@song ],
    "songs#stage" => [ "stage_opened", :@song ],
    "songs/phrasings#update" => [ :phrasing_activity, :@song ],
    "songs/timings#update" => [ "line_timing_saved", :@song ],
    "song_shares#create" => [ "song_shared", :@song ],
    "song_shares#destroy" => [ "song_unshared", :@song ],
    "groups#update" => [ "group_updated", :@group ],
    "groups#destroy" => [ "group_deleted", :@group ],
    "memberships#create" => [ "member_added", :@group ],
    "memberships#destroy" => [ "member_removed", :@group ],
    "setlists#create" => [ "setlist_created", :@setlist ],
    "setlists#update" => [ "setlist_updated", :@setlist ],
    "setlists#destroy" => [ "setlist_deleted", :@setlist ],
    "setlists#stage" => [ "setlist_stage_opened", :@setlist ],
    "setlist_songs#create" => [ "setlist_song_added", :@setlist ],
    "setlist_songs#destroy" => [ "setlist_song_removed", :@setlist ],
    "my_setlists#create" => [ "personal_setlist_created", :@setlist ],
    "my_setlists#update" => [ "personal_setlist_updated", :@setlist ],
    "my_setlists#destroy" => [ "personal_setlist_deleted", :@setlist ],
    "my_setlists#stage" => [ "personal_setlist_stage_opened", :@setlist ],
    "my_setlist_songs#create" => [ "personal_setlist_song_added", :@setlist ],
    "my_setlist_songs#destroy" => [ "personal_setlist_song_removed", :@setlist ],
    "live_sessions#create" => [ "live_session_started", :@group ],
    "live_sessions#destroy" => [ "live_session_ended", :@group ]
  }.freeze

  included do
    after_action :track_activity
  end

  private

  def track_activity
    event, subject_ivar, options = TRACKED["#{controller_path}##{action_name}"]
    return unless event

    event = send(event) if event.is_a?(Symbol)
    actor = Current.user || (options&.dig(:actor) && instance_variable_get(options[:actor]))
    ActivityEvent.record(
      event,
      user: actor,
      subject: subject_ivar && instance_variable_get(subject_ivar),
      outcome: activity_failed? ? "failed" : "ok",
      details: activity_details
    )
  end

  def activity_failed?
    response.status >= 400 || flash[:alert].present? ||
      session[:inertia_errors].present? || session["inertia_errors"].present?
  end

  # The app's own confirmation (or refusal) message reads well in the log
  # ("Tim added to The Band", "Shared to Choir"), plus the group it was in.
  def activity_details
    group = instance_variable_get(:@group)
    note = flash[:alert].presence || flash[:notice].presence
    errors = session[:inertia_errors].presence || session["inertia_errors"].presence
    {
      note: note&.to_s&.truncate(200),
      group: group.respond_to?(:name) ? group.name : nil,
      errors: errors.respond_to?(:to_h) ? errors.to_h.transform_values { |v| Array(v).first.to_s.truncate(120) } : nil
    }
  end

  def phrasing_activity
    if params[:instrumental].present? then "minus_one_uploaded"
    elsif params[:remove_instrumental].present? then "minus_one_removed"
    elsif params[:audio].present? then "audio_uploaded"
    else "sync_saved"
    end
  end
end
