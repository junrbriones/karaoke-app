# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Admin: setting a user's password", type: :request do
  fixtures :users

  let(:admin) { users(:admin) }
  let(:member) { User.create!(name: "Forgetful", email: "forgetful@example.com", password: "Old-password-123", verified: true) }

  describe "as an admin" do
    before { sign_in admin }

    it "shows the page" do
      get edit_admin_user_password_path(member)
      expect(response).to have_http_status(:success)
      expect(response.body).to include("admin/users/password")
    end

    it "sets the new password, asks them to choose their own, and signs them out everywhere" do
      member.sessions.create!
      patch admin_user_password_path(member), params: { password: "Kx7m-Pq2r-Tz9w-Hn4c", must_change_password: true }

      expect(response).to redirect_to(edit_admin_user_password_path(member))
      member.reload
      expect(member.authenticate("Kx7m-Pq2r-Tz9w-Hn4c")).to be_truthy
      expect(member.authenticate("Old-password-123")).to be(false)
      expect(member.must_change_password).to be(true)
      expect(member.sessions).to be_empty
      expect(ActivityEvent.where(action: "user_password_reset", subject_id: member.id)).to exist
    end

    it "can leave out the 'choose your own' step" do
      patch admin_user_password_path(member), params: { password: "Kx7m-Pq2r-Tz9w-Hn4c", must_change_password: false }
      expect(member.reload.must_change_password).to be(false)
    end

    it "refuses a blank or short password" do
      patch admin_user_password_path(member), params: { password: "" }
      expect(member.reload.authenticate("Old-password-123")).to be_truthy

      patch admin_user_password_path(member), params: { password: "short" }
      expect(member.reload.authenticate("Old-password-123")).to be_truthy
    end
  end

  it "is admin-only" do
    sign_in users(:one)
    patch admin_user_password_path(member), params: { password: "Kx7m-Pq2r-Tz9w-Hn4c" }
    expect(member.reload.authenticate("Old-password-123")).to be_truthy
  end

  describe "signing in with a password an admin set" do
    before do
      member.update!(password: "Kx7m-Pq2r-Tz9w-Hn4c", must_change_password: true)
      post sign_in_path, params: { email: member.email, password: "Kx7m-Pq2r-Tz9w-Hn4c" }
    end

    it "goes to the password page before anything else" do
      get songs_path
      expect(response).to redirect_to(settings_password_path)
      get settings_password_path
      expect(response).to have_http_status(:success)
    end

    it "opens up once they've chosen their own" do
      patch settings_password_path, params: {
        password_challenge: "Kx7m-Pq2r-Tz9w-Hn4c",
        password: "My-own-password-456", password_confirmation: "My-own-password-456"
      }
      expect(member.reload.must_change_password).to be(false)
      get songs_path
      expect(response).to have_http_status(:success)
    end
  end
end
