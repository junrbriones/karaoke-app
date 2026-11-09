# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Guitar chord charts", type: :request do
  fixtures :users

  it "opens the chord charts, with the chord from the link looked up" do
    sign_in users(:one)
    get chords_path(q: "C#m7")
    expect(response).to have_http_status(:success)
    expect(response.body).to include("chords/index")
    expect(response.body).to include("C#m7")
  end

  it "needs signing in" do
    get chords_path
    expect(response).to redirect_to(sign_in_path)
  end
end
