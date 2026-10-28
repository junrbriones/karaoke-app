# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Users", type: :request do
  fixtures :users

  describe "DELETE /users" do
    it "destroys current user with valid password" do
      sign_in users(:one)
      expect {
        delete users_path, params: { password_challenge: "Secret1*3*5*" }
      }.to change(User, :count).by(-1)
      expect(response).to redirect_to(root_path)
    end

    it "rejects account deletion with wrong password" do
      sign_in users(:one)
      expect {
        delete users_path, params: { password_challenge: "wrongpassword" }
      }.not_to change(User, :count)
      expect(response).to redirect_to(settings_profile_path)
    end
  end
end
