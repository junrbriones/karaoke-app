# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Error pages", type: :request do
  fixtures :users

  def page_component
    response.body[/"component":"([^"]+)"/, 1]&.gsub("\\/", "/")
  end

  describe "GET /errors/:status (development/test preview)" do
    it "renders the friendly 404 page with a 404 status" do
      get "/errors/404"
      expect(response).to have_http_status(:not_found)
      expect(page_component).to eq("errors/show")
    end

    it "renders the 500 page with a 500 status" do
      get "/errors/500"
      expect(response).to have_http_status(:internal_server_error)
      expect(page_component).to eq("errors/show")
    end

    it "works signed in as well as signed out" do
      sign_in users(:one)
      get "/errors/403"
      expect(response).to have_http_status(:forbidden)
      expect(response.body).to include(users(:one).email)
    end

    it "treats an out-of-range status as a 500" do
      get "/errors/299"
      expect(response).to have_http_status(:internal_server_error)
    end

    it "answers non-page requests with just the status" do
      get "/errors/404", headers: { "Accept" => "application/json" }
      expect(response).to have_http_status(:not_found)
      expect(response.body).to be_empty
    end
  end

  describe "signing in after being sent to the sign-in page" do
    it "returns to the page that was asked for" do
      get songs_path
      expect(response).to redirect_to(sign_in_path)
      expect(flash[:alert]).to eq("Please sign in to continue.")

      post sign_in_path, params: { email: users(:one).email, password: "Secret1*3*5*" }
      expect(response).to redirect_to(songs_path)
    end

    it "goes to the dashboard when nothing was asked for" do
      post sign_in_path, params: { email: users(:one).email, password: "Secret1*3*5*" }
      expect(response).to redirect_to(dashboard_path)
    end
  end
end
