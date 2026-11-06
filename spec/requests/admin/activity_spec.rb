# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Admin activity log", type: :request do
  fixtures :users

  let(:password) { "Secret1*3*5*" }

  def page_props
    html = response.body
    json = html[%r{<script[^>]*data-page="app"[^>]*>(.*?)</script>}m, 1] ||
      CGI.unescapeHTML(html[/data-page="([^"]*)"/, 1].to_s)
    JSON.parse(json)["props"]
  end

  describe "what gets recorded" do
    it "logs a sign-in with the device and IP it came from" do
      post sign_in_path, params: { email: users(:one).email, password: password },
        headers: { "User-Agent" => "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36" }

      event = ActivityEvent.last
      expect(event).to have_attributes(action: "signed_in", outcome: "ok", user: users(:one), category: "sign_in")
      expect(event.actor_label).to eq("Test User <one@example.com>")
      expect(event.user_agent).to include("Chrome/130")
      expect(event.ip_address).to be_present
    end

    it "logs a failed sign-in, against the account when there is one" do
      post sign_in_path, params: { email: users(:one).email, password: "wrong password" }
      post sign_in_path, params: { email: "nobody@example.com", password: "whatever" }

      wrong_password, unknown = ActivityEvent.order(:id).last(2)
      expect(wrong_password).to have_attributes(action: "sign_in_failed", outcome: "failed", user: users(:one))
      expect(unknown).to have_attributes(action: "sign_in_failed", user: nil)
      expect(unknown.details).to eq("email" => "nobody@example.com")
    end

    it "logs signing out" do
      post sign_in_path, params: { email: users(:one).email, password: password }
      delete session_path(users(:one).sessions.last)

      expect(ActivityEvent.last).to have_attributes(action: "signed_out", user: users(:one))
    end

    it "logs changes to songs, with the song's title, and whether they worked" do
      sign_in users(:one)
      post songs_path, params: { title: "Magsayawan", body: "[Verse]\nC\nTayo ay magsaya\n" }
      post songs_path, params: { title: "" }

      saved, refused = ActivityEvent.order(:id).last(2)
      expect(saved).to have_attributes(action: "song_created", outcome: "ok", subject_label: "Magsayawan", subject_type: "Song")
      expect(refused).to have_attributes(action: "song_created", outcome: "failed")
    end

    it "keeps the log readable after an account is deleted" do
      sign_in users(:two)
      delete users_path, params: { password_challenge: password }

      event = ActivityEvent.find_by(action: "account_deleted")
      expect(event.user_id).to be_nil
      expect(event.actor_label).to eq("Another User <two@example.com>")
    end

    it "doesn't log page views" do
      sign_in users(:one)
      expect { get songs_path }.not_to change(ActivityEvent, :count)
    end

    it "never gets in the way of the action itself" do
      allow(ActivityEvent).to receive(:create!).and_raise(ActiveRecord::StatementInvalid, "boom")
      post sign_in_path, params: { email: users(:one).email, password: password }
      expect(response).to redirect_to(dashboard_path)
    end
  end

  describe "GET /admin/activity" do
    before do
      post sign_in_path, params: { email: users(:one).email, password: "nope" }
      post sign_in_path, params: { email: users(:one).email, password: password }
      delete session_path(users(:one).sessions.last)
    end

    it "shows the log to an admin, newest first" do
      sign_in users(:admin)
      get admin_activity_path
      expect(response).to have_http_status(:success)

      actions = page_props["events"].map { |e| e["action"] }
      expect(actions.first(3)).to eq(%w[signed_out signed_in sign_in_failed])
      expect(page_props["summary"]).to include("failed_sign_ins_today" => 1, "sign_ins_today" => 1)
    end

    it "filters to failed attempts by one person" do
      sign_in users(:admin)
      get admin_activity_path, params: { user_id: users(:one).id, outcome: "failed" }
      expect(page_props["events"].map { |e| e["action"] }).to eq(%w[sign_in_failed])
    end

    it "is only for admins" do
      sign_in users(:one)
      get admin_activity_path
      expect(response).to redirect_to(root_path)
    end
  end

  it "prunes entries past the retention period" do
    old = ActivityEvent.record("signed_in", user: users(:one))
    old.update_column(:created_at, (ActivityEvent::RETENTION + 1.day).ago)
    fresh = ActivityEvent.record("signed_in", user: users(:one))

    ActivityEvent.prune!
    expect(ActivityEvent.exists?(old.id)).to be(false)
    expect(ActivityEvent.exists?(fresh.id)).to be(true)
  end
end
