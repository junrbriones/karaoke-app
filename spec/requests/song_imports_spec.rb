# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Bulk song import", type: :request do
  fixtures :users

  let(:me) { users(:one) }
  before { sign_in me }

  # Made-up songs.
  let(:rows) do
    [
      { title: "Kape sa Umaga", artist: "Test Band", key: "G", capo: "2", tempo: 96, body: "[Verse]\nG     D\nGising na ang araw\n" },
      { title: "Ulan sa Lungsod", artist: "", key: "", capo: "", tempo: nil, body: "Am   F\nBasang kalsada\n" }
    ]
  end

  it "shows the import page with the songs already there (to spot duplicates)" do
    me.songs.create!(title: "Kape sa Umaga", body: "")
    get import_songs_path
    expect(response).to have_http_status(:success)
  end

  it "creates every song in one go" do
    expect {
      post import_songs_path, params: { songs: rows.to_json }
    }.to change(me.songs, :count).by(2)

    expect(response).to redirect_to(songs_path)
    expect(flash[:notice]).to eq("Imported 2 songs")
    song = me.songs.find_by!(title: "Kape sa Umaga")
    expect(song).to have_attributes(artist: "Test Band", key: "G", capo: "2", tempo: 96)
    expect(me.songs.find_by!(title: "Ulan sa Lungsod").artist).to be_nil
  end

  it "saves nothing when any song can't be saved, and says which" do
    bad = rows + [ { title: "", body: "C\nla\n" } ]
    expect {
      post import_songs_path, params: { songs: bad.to_json }
    }.not_to change(Song, :count)
    expect(response).to redirect_to(import_songs_path)
  end

  it "gives a repeated title its own address" do
    me.songs.create!(title: "Kape sa Umaga", body: "")
    post import_songs_path, params: { songs: [ rows.first ].to_json }
    expect(me.songs.where(title: "Kape sa Umaga").pluck(:slug)).to contain_exactly("kape-sa-umaga", "kape-sa-umaga-2")
  end

  it "refuses too many songs or nonsense" do
    post import_songs_path, params: { songs: Array.new(201) { |i| { title: "Song #{i}", body: "" } }.to_json }
    expect(response).to redirect_to(import_songs_path)
    post import_songs_path, params: { songs: "{not json" }
    expect(response).to redirect_to(import_songs_path)
    expect(me.songs.count).to eq(0)
  end

  it "is logged in the activity log" do
    post import_songs_path, params: { songs: rows.to_json }
    expect(ActivityEvent.last).to have_attributes(action: "songs_imported", user: me)
    expect(ActivityEvent.last.details["note"]).to eq("Imported 2 songs")
  end
end
