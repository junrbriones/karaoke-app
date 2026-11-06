# frozen_string_literal: true

module Admin
  # The activity log: sign-ins (and failed attempts), sign-outs, account
  # changes, and changes to songs, groups and live sessions -- newest first,
  # filterable by person, kind, outcome, time and text, 50 at a time.
  class ActivityController < BaseController
    PER_PAGE = 50
    PERIODS = { "1" => 1.day, "7" => 7.days, "30" => 30.days, "90" => 90.days }.freeze

    def index
      events = filtered_events
      page = events.limit(PER_PAGE + 1).to_a
      more = page.size > PER_PAGE
      page = page.first(PER_PAGE)

      render inertia: "admin/activity/index", props: {
        events: page.map(&:as_admin_json),
        next_before: more ? page.last.id : nil,
        filters: filters,
        users: User.order(:name).map { |u| { id: u.id, name: u.name, email: u.email } },
        categories: ActivityEvent::CATEGORIES.map { |value, label| { value: value, label: label } },
        summary: {
          sign_ins_today: ActivityEvent.where(action: "signed_in", created_at: 1.day.ago..).count,
          failed_sign_ins_today: ActivityEvent.where(action: "sign_in_failed", created_at: 1.day.ago..).count,
          active_users_week: ActivityEvent.where(created_at: 7.days.ago..).where.not(user_id: nil).distinct.count(:user_id)
        },
        retention_days: ActivityEvent::RETENTION.in_days.round
      }
    end

    private

    def filters
      {
        user_id: params[:user_id].presence&.to_i,
        category: ActivityEvent::CATEGORIES.key?(params[:category]) ? params[:category] : nil,
        outcome: params[:outcome] == "failed" ? "failed" : nil,
        days: PERIODS.key?(params[:days]) || params[:days] == "all" ? params[:days] : "7",
        q: params[:q].to_s.strip.presence&.truncate(100)
      }
    end

    def filtered_events
      f = filters
      scope = ActivityEvent.newest_first
      scope = scope.where(user_id: f[:user_id]) if f[:user_id]
      scope = scope.where(category: f[:category]) if f[:category]
      scope = scope.where(outcome: "failed") if f[:outcome]
      scope = scope.where(created_at: PERIODS[f[:days]].ago..) if PERIODS[f[:days]]
      if f[:q]
        like = "%#{ActiveRecord::Base.sanitize_sql_like(f[:q].downcase)}%"
        scope = scope.where(
          "LOWER(COALESCE(actor_label, '')) LIKE :q OR LOWER(COALESCE(subject_label, '')) LIKE :q " \
          "OR COALESCE(ip_address, '') LIKE :q OR LOWER(COALESCE(CAST(details AS TEXT), '')) LIKE :q",
          q: like
        )
      end
      scope = scope.where("activity_events.id < ?", params[:before].to_i) if params[:before].present?
      scope
    end
  end
end
