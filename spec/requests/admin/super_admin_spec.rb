# frozen_string_literal: true

require "rails_helper"

RSpec.describe "The super admin and admins", type: :request do
  fixtures :users

  let(:super_admin) { users(:super_admin) }
  let(:admin) { users(:admin) }
  let(:member) { users(:one) }

  def page_props
    html = response.body
    json = html[%r{<script[^>]*data-page="app"[^>]*>(.*?)</script>}m, 1] ||
      CGI.unescapeHTML(html[/data-page="([^"]*)"/, 1].to_s)
    JSON.parse(json)["props"]
  end

  it "keeps the Admin area to the super admin" do
    sign_in admin
    [ admin_users_path, new_admin_user_path, admin_activity_path, edit_admin_user_password_path(member) ].each do |path|
      get path
      expect(response).to redirect_to(root_path), "#{path} should be the super admin's"
    end

    sign_in super_admin
    get admin_users_path
    expect(response).to have_http_status(:success)
  end

  it "still lets a regular admin create groups" do
    sign_in admin
    get new_admin_group_path
    expect(response).to have_http_status(:success)
  end

  it "tells the pages who's who" do
    sign_in admin
    get songs_path
    expect(page_props.dig("auth", "user")).to include("admin" => true, "super_admin" => false)

    sign_in super_admin
    get songs_path
    expect(page_props.dig("auth", "user")).to include("admin" => true, "super_admin" => true)
  end

  it "counts a super admin as an admin" do
    expect(super_admin.admin?).to be(true)
    expect(super_admin[:admin]).to be(false)
  end

  describe "making someone an admin" do
    it "is the super admin's to do, and logged" do
      sign_in super_admin
      patch admin_user_role_path(member), params: { admin: true }
      expect(response).to redirect_to(admin_users_path)
      expect(member.reload.admin?).to be(true)
      expect(ActivityEvent.where(action: "user_role_changed", subject_id: member.id)).to exist

      patch admin_user_role_path(member), params: { admin: false }
      expect(member.reload.admin?).to be(false)
    end

    it "isn't for a regular admin" do
      sign_in admin
      patch admin_user_role_path(member), params: { admin: true }
      expect(response).to redirect_to(root_path)
      expect(member.reload.admin?).to be(false)
    end

    it "never touches a super admin" do
      other = User.create!(name: "Other Super", email: "other-super@example.com", password: "Long-password-123", super_admin: true)
      sign_in super_admin
      patch admin_user_role_path(other), params: { admin: false }
      expect(other.reload.super_admin?).to be(true)
      patch admin_user_role_path(super_admin), params: { admin: false }
      expect(super_admin.reload.super_admin?).to be(true)
    end
  end
end
