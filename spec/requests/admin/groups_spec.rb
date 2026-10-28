# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Admin::Groups", type: :request do
  fixtures :users

  describe "GET /admin/groups/new" do
    it "renders the new group page for an admin" do
      sign_in users(:admin)
      get new_admin_group_path
      expect(response).to have_http_status(:success)
    end

    it "redirects a non-admin" do
      sign_in users(:one)
      get new_admin_group_path
      expect(response).to redirect_to(root_path)
    end
  end

  describe "POST /admin/groups" do
    it "creates a group with the admin as its owner" do
      sign_in users(:admin)
      expect {
        post admin_groups_path, params: { name: "The Weekend Warriors" }
      }.to change(Group, :count).by(1)

      group = Group.last
      expect(group.owned_by?(users(:admin))).to be(true)
      expect(response).to redirect_to(group_path(group))
    end

    it "is off-limits to a non-admin" do
      sign_in users(:one)
      expect {
        post admin_groups_path, params: { name: "The Weekend Warriors" }
      }.not_to change(Group, :count)
      expect(response).to redirect_to(root_path)
    end
  end
end
