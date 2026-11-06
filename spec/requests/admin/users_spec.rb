# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Admin::Users", type: :request do
  fixtures :users

  describe "GET /admin/users" do
    it "lists users for an admin" do
      sign_in users(:admin)
      get admin_users_path
      expect(response).to have_http_status(:success)
    end

    it "redirects a non-admin" do
      sign_in users(:one)
      get admin_users_path
      expect(response).to redirect_to(root_path)
    end

    it "redirects a signed-out visitor to sign in" do
      get admin_users_path
      expect(response).to redirect_to(sign_in_path)
    end
  end

  describe "GET /admin/users/new" do
    it "renders the new user page for an admin" do
      sign_in users(:admin)
      get new_admin_user_path
      expect(response).to have_http_status(:success)
    end

    it "redirects a non-admin" do
      sign_in users(:one)
      get new_admin_user_path
      expect(response).to redirect_to(root_path)
    end
  end

  describe "POST /admin/users" do
    it "creates a new user without touching the admin's own session" do
      sign_in users(:admin)
      admin_session_cookie = cookies[:session_token]

      expect {
        post admin_users_path, params: {
          name: "New User",
          email: "new@example.com",
          password: "Secret1*3*5*",
          password_confirmation: "Secret1*3*5*"
        }
      }.to change(User, :count).by(1)

      expect(response).to redirect_to(admin_users_path)
      expect(cookies[:session_token]).to eq(admin_session_cookie)

      new_user = User.find_by(email: "new@example.com")
      expect(new_user).not_to be_admin
      expect(new_user.sessions.count).to eq(0)
    end

    it "sends a verification email to a user the admin didn't mark verified" do
      sign_in users(:admin)
      expect {
        post admin_users_path, params: {
          name: "New User", email: "new@example.com",
          password: "Secret1*3*5*", password_confirmation: "Secret1*3*5*"
        }
      }.to have_enqueued_mail(UserMailer, :email_verification)

      expect(User.find_by(email: "new@example.com")).not_to be_verified
    end

    it "marks a user verified when the admin ticks the box, with no email" do
      sign_in users(:admin)
      expect {
        post admin_users_path, params: {
          name: "New User", email: "new@example.com",
          password: "Secret1*3*5*", password_confirmation: "Secret1*3*5*",
          verified: "1"
        }
      }.not_to have_enqueued_mail(UserMailer, :email_verification)

      expect(response).to redirect_to(admin_users_path)
      expect(User.find_by(email: "new@example.com")).to be_verified
      expect(flash[:notice]).to include("marked as verified")
    end

    it "treats an unticked box as not verified" do
      sign_in users(:admin)
      post admin_users_path, params: {
        name: "New User", email: "new@example.com",
        password: "Secret1*3*5*", password_confirmation: "Secret1*3*5*",
        verified: "0"
      }
      expect(User.find_by(email: "new@example.com")).not_to be_verified
    end

    it "rejects an invalid user" do
      sign_in users(:admin)
      expect {
        post admin_users_path, params: {
          name: "",
          email: "invalid",
          password: "short",
          password_confirmation: "short"
        }
      }.not_to change(User, :count)
      expect(response).to redirect_to(new_admin_user_path)
    end

    it "is off-limits to a non-admin" do
      sign_in users(:one)
      expect {
        post admin_users_path, params: {
          name: "New User",
          email: "new@example.com",
          password: "Secret1*3*5*",
          password_confirmation: "Secret1*3*5*"
        }
      }.not_to change(User, :count)
      expect(response).to redirect_to(root_path)
    end
  end
end
