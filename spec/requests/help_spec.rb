# frozen_string_literal: true

require "rails_helper"

RSpec.describe "How to (the user's guide)", type: :request do
  fixtures :users

  it "opens for anyone signed in" do
    sign_in users(:one)
    get help_path
    expect(response).to have_http_status(:success)
    expect(response.body).to include("help/index")
  end

  it "needs signing in" do
    get help_path
    expect(response).to redirect_to(sign_in_path)
  end
end
