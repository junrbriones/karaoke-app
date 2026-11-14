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

  it "saves start times (seconds), what they were timed against, and where the last line ends" do
    timing = {
      version: 2, bpm: 96, source: "external", end: 14.5,
      lines: {
        "Verse#0" => { text: "Tayo ay magsaya", start: 3.21456 },
        "Verse#1" => { text: "negative", start: -2 },
        "Verse#2" => { text: "no start" }
      }
    }
    patch song_timing_path(song), params: { line_timing: timing.to_json, tempo: 96 }

    song.reload
    expect(song.tempo).to eq(96)
    expect(song.line_timing).to eq(
      "version" => 2, "bpm" => 96, "source" => "external", "end" => 14.5,
      "lines" => { "Verse#0" => { "text" => "Tayo ay magsaya", "start" => 3.215 } }
    )
  end

  it "saves the karaoke sync worked out from the timing along with it (one timing for both)" do
    timing = { version: 2, bpm: 100, source: "external", lines: { "Verse#0" => { text: "Tayo ay magsaya", start: 2.5 } } }
    phrasing = {
      sourceText: "Tayo ay magsaya", complete: true,
      sync: { mode: "line", bpm: 100, phase: 0, grid: 2, source: "external" },
      screens: [ { label: nil, instrumental: false, lines: [ { start: 2.5, tokens: [ { text: "Tayo", wordStart: true, time: 2.5 } ] } ] } ]
    }
    patch song_timing_path(song), params: { line_timing: timing.to_json, phrasing: phrasing.to_json }

    song.reload
    expect(song.line_timing.dig("lines", "Verse#0", "start")).to eq(2.5)
    expect(song.phrasing.dig("screens", 0, "lines", 0, "start")).to eq(2.5)
    expect(song.phrasing.dig("sync", "source")).to eq("external")
  end

  it "ignores a karaoke sync that isn't one" do
    timing = { version: 2, bpm: 100, lines: { "Verse#0" => { text: "Tayo ay magsaya", start: 2.5 } } }
    patch song_timing_path(song), params: { line_timing: timing.to_json, phrasing: "{not json" }
    expect(song.reload.line_timing.dig("lines", "Verse#0", "start")).to eq(2.5)
    expect(song.phrasing).to be_nil
  end

  it "ignores an unknown source" do
    timing = { version: 2, bpm: 96, source: "radio", lines: { "Verse#0" => { text: "Tayo ay magsaya", start: 1 } } }
    patch song_timing_path(song), params: { line_timing: timing.to_json }
    expect(song.reload.line_timing["source"]).to be_nil
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
