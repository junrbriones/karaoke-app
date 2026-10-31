# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Song line timing", type: :request do
  fixtures :users

  let(:owner) { users(:one) }
  let!(:song) { owner.songs.create!(title: "Magsayawan", tempo: 100, body: "[Verse]\nC\nTayo ay magsaya\n") }

  before { sign_in owner }

  it "shows the editor to the song's owner" do
    get song_timing_path(song)
    expect(response).to have_http_status(:success)
  end

  it "saves cleaned-up timing and the tempo it was made at" do
    timing = {
      bpm: 120,
      lines: {
        "Verse#0" => { text: "Tayo ay magsaya", beats: 8 },
        "Verse#1" => { text: "too long", beats: 999 },
        "Verse#2" => "not an entry"
      }
    }
    patch song_timing_path(song), params: { line_timing: timing.to_json, tempo: 120 }
    expect(response).to redirect_to(song_timing_path(song))

    song.reload
    expect(song.tempo).to eq(120)
    expect(song.line_timing).to eq(
      "bpm" => 120,
      "lines" => { "Verse#0" => { "text" => "Tayo ay magsaya", "beats" => 8.0 } }
    )
  end

  it "clears the timing when sent blank" do
    song.update!(line_timing: { "lines" => { "Verse#0" => { "text" => "Tayo ay magsaya", "beats" => 8 } } })
    patch song_timing_path(song), params: { line_timing: "" }
    expect(song.reload.line_timing).to be_nil
  end

  it "rejects unreadable timing without changing anything" do
    patch song_timing_path(song), params: { line_timing: "{not json" }
    expect(response).to redirect_to(song_timing_path(song))
    expect(song.reload.line_timing).to be_nil
  end

  it "is only for the song's owner" do
    sign_in users(:two)
    get song_timing_path(song)
    expect(response).to have_http_status(:not_found)
  end
end
