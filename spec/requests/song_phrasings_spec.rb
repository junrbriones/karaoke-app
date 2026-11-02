# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Song karaoke sync (phrasing)", type: :request do
  fixtures :users

  let(:owner) { users(:one) }
  let!(:song) { owner.songs.create!(title: "Magsayawan", tempo: 100, body: "[Verse]\nTayo ay magsaya\n") }

  before { sign_in owner }

  let(:phrasing) do
    {
      sourceText: "Tayo ay magsaya",
      complete: true,
      sync: { mode: "line", bpm: 112, phase: 0.2, grid: 2 },
      screens: [
        {
          label: nil, instrumental: false,
          lines: [ { start: 1.0, end: nil, tokens: [ { text: "Tayo", wordStart: true, time: 1.0, end: 1.5 } ] } ]
        }
      ]
    }
  end

  it "saves a line-synced phrasing and the tempo found from the taps" do
    patch song_phrasing_path(song), params: { phrasing: phrasing.to_json, tempo: 112 }
    expect(response).to redirect_to(song_phrasing_path(song))

    song.reload
    expect(song.tempo).to eq(112)
    expect(song.phrasing["sync"]).to include("mode" => "line", "bpm" => 112, "grid" => 2)
    expect(song.phrasing.dig("screens", 0, "lines", 0, "start")).to eq(1.0)
  end

  it "keeps an uploaded track with the song and describes it to the owner" do
    pcm = "\x00\x00" * 800
    wav = "RIFF".b + [ 36 + pcm.bytesize ].pack("V") + "WAVEfmt ".b +
      [ 16, 1, 1, 8000, 16_000, 2, 16 ].pack("VvvVVvv") + "data".b + [ pcm.bytesize ].pack("V") + pcm.b
    file = Rack::Test::UploadedFile.new(StringIO.new(wav), "audio/wav", original_filename: "click.wav")

    patch song_phrasing_path(song), params: { audio: file }
    expect(response).to redirect_to(song_phrasing_path(song))

    song.reload
    expect(song.audio).to be_attached
    expect(song.detail_json(owner)[:audio_file]).to include(filename: "click.wav", byte_size: wav.bytesize)
  end

  it "keeps an optional minus-one track, and removes it on request" do
    pcm = "\x00\x00" * 800
    wav = "RIFF".b + [ 36 + pcm.bytesize ].pack("V") + "WAVEfmt ".b +
      [ 16, 1, 1, 8000, 16_000, 2, 16 ].pack("VvvVVvv") + "data".b + [ pcm.bytesize ].pack("V") + pcm.b
    file = Rack::Test::UploadedFile.new(StringIO.new(wav), "audio/wav", original_filename: "minus-one.wav")

    patch song_phrasing_path(song), params: { instrumental: file }
    expect(response).to redirect_to(song_phrasing_path(song))
    song.reload
    expect(song.instrumental).to be_attached
    json = song.detail_json(owner)
    expect(json[:has_instrumental]).to be(true)
    expect(json[:instrumental_url]).to be_present
    expect(json[:instrumental_file]).to include(filename: "minus-one.wav")

    patch song_phrasing_path(song), params: { remove_instrumental: "1" }
    expect(song.reload.instrumental).not_to be_attached
  end

  it "refuses a minus-one that's the very same file as the song's audio" do
    pcm = "\x01\x00" * 800
    wav = "RIFF".b + [ 36 + pcm.bytesize ].pack("V") + "WAVEfmt ".b +
      [ 16, 1, 1, 8000, 16_000, 2, 16 ].pack("VvvVVvv") + "data".b + [ pcm.bytesize ].pack("V") + pcm.b
    upload = -> { Rack::Test::UploadedFile.new(StringIO.new(wav), "audio/wav", original_filename: "song.wav") }

    patch song_phrasing_path(song), params: { audio: upload.call }
    patch song_phrasing_path(song), params: { instrumental: upload.call }

    expect(song.reload.instrumental).not_to be_attached
    expect(song.detail_json(owner)[:instrumental_url]).to be_nil
  end

  it "still saves the sync of a song whose minus-one is a copy of its audio" do
    pcm = "\x02\x00" * 800
    wav = "RIFF".b + [ 36 + pcm.bytesize ].pack("V") + "WAVEfmt ".b +
      [ 16, 1, 1, 8000, 16_000, 2, 16 ].pack("VvvVVvv") + "data".b + [ pcm.bytesize ].pack("V") + pcm.b
    blob = ActiveStorage::Blob.create_and_upload!(io: StringIO.new(wav), filename: "song.wav", content_type: "audio/wav")
    song.audio.attach(blob)
    # Attached before uploads were checked (straight in, past validation).
    ActiveStorage::Attachment.create!(name: "instrumental", record: song, blob: blob)
    expect(song.reload.instrumental_same_as_audio?).to be(true)

    patch song_phrasing_path(song), params: { phrasing: phrasing.to_json }
    expect(response).to redirect_to(song_phrasing_path(song))
    expect(song.reload.phrasing["sync"]).to include("mode" => "line")
    expect(song.detail_json(owner)[:instrumental_url]).to be_nil
  end

  it "leaves the tempo alone when none (or a silly one) is sent" do
    patch song_phrasing_path(song), params: { phrasing: phrasing.to_json, tempo: 9000 }
    expect(song.reload.tempo).to eq(100)
  end
end
