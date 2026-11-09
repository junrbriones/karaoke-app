# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Personal setlists", type: :request do
  fixtures :users

  let(:me) { users(:one) }
  let(:bandmate) { users(:two) }
  let!(:mine) { me.songs.create!(title: "Magsayawan", body: "[Verse]\nC\nTayo ay magsaya\n") }
  let!(:theirs) { bandmate.songs.create!(title: "Annie Batungbakal", body: "C\nSi Annie\n") }
  let!(:private_song) { bandmate.songs.create!(title: "Not Shared", body: "C\nHmm\n") }
  let!(:group) do
    Group.create!(name: "The Band").tap do |g|
      g.memberships.create!(user: bandmate, role: "owner")
      g.memberships.create!(user: me, role: "member")
      g.song_shares.create!(song: theirs)
    end
  end

  def page_props
    html = response.body
    json = html[%r{<script[^>]*data-page="app"[^>]*>(.*?)</script>}m, 1] ||
      CGI.unescapeHTML(html[/data-page="([^"]*)"/, 1].to_s)
    JSON.parse(json)["props"]
  end

  before { sign_in me }

  it "lets any user create a setlist, starting with a song if they like" do
    post my_setlists_path, params: { name: "Friday gig", song_id: mine.id }
    setlist = me.setlists.find_by!(name: "Friday gig")

    expect(response).to redirect_to(my_setlist_path(setlist))
    expect(setlist.group).to be_nil
    expect(setlist.songs).to eq([ mine ])
  end

  it "draws from their own songs and songs shared with their groups -- nothing else" do
    setlist = me.setlists.create!(name: "Practice")

    post my_setlist_entries_path(setlist), params: { song_id: theirs.id }
    post my_setlist_entries_path(setlist), params: { song_id: private_song.id }

    expect(setlist.reload.songs).to eq([ theirs ])
  end

  it "reorders, removes, renames and deletes" do
    setlist = me.setlists.create!(name: "Practice")
    setlist.add_song(mine)
    setlist.add_song(theirs)
    second = setlist.setlist_songs.find_by(song: theirs)

    patch move_my_setlist_entry_path(setlist, second), params: { direction: "up" }
    expect(setlist.reload.ordered_setlist_songs.map(&:song)).to eq([ theirs, mine ])

    delete my_setlist_entry_path(setlist, second)
    expect(setlist.reload.songs).to eq([ mine ])

    patch my_setlist_path(setlist), params: { name: "Sunday set" }
    expect(setlist.reload.name).to eq("Sunday set")

    delete my_setlist_path(setlist)
    expect(Setlist.exists?(setlist.id)).to be(false)
  end

  it "runs in Stage Mode, skipping a song that's no longer shared with them" do
    setlist = me.setlists.create!(name: "Practice")
    setlist.add_song(mine)
    setlist.add_song(theirs)
    group.song_shares.find_by(song: theirs).destroy!

    get my_setlist_path(setlist)
    entries = page_props["setlist"]["entries"]
    expect(entries.map { |e| [ e["song"]["title"], e["unavailable"] ] })
      .to eq([ [ "Magsayawan", false ], [ "Annie Batungbakal", true ] ])

    get stage_my_setlist_path(setlist)
    expect(page_props["songs"].map { |s| s["title"] }).to eq([ "Magsayawan" ])
  end

  it "keeps each person's setlists to themselves" do
    theirs_setlist = bandmate.setlists.create!(name: "Bandmate's")
    get my_setlist_path(theirs_setlist)
    expect(response).to have_http_status(:not_found)
  end

  it "offers the user's setlists on a song's page" do
    setlist = me.setlists.create!(name: "Practice")
    setlist.add_song(theirs)
    get song_path(theirs)
    expect(page_props["my_setlists"]).to eq([ { "id" => setlist.id, "name" => "Practice", "slug" => "practice", "has_song" => true } ])
  end
end

RSpec.describe "Group members editing a song's sync", type: :request do
  fixtures :users

  let(:owner) { users(:one) }
  let(:member) { users(:two) }
  let(:outsider) { users(:admin) }
  let!(:song) { owner.songs.create!(title: "Magsayawan", body: "[Verse]\nC\nTayo ay magsaya\n") }
  before do
    group = Group.create!(name: "The Band")
    group.memberships.create!(user: owner, role: "owner")
    group.memberships.create!(user: member, role: "member")
    group.song_shares.create!(song: song)
  end

  it "is owner-only until the owner allows it" do
    sign_in member
    get song_phrasing_path(song)
    expect(response).to have_http_status(:not_found)
    get song_timing_path(song)
    expect(response).to have_http_status(:not_found)
  end

  it "opens the karaoke sync and line timing to the group's members when allowed" do
    song.update!(members_edit_sync: true)
    sign_in member

    get song_phrasing_path(song)
    expect(response).to have_http_status(:success)

    timing = { lines: { "Verse#0" => { text: "Tayo ay magsaya", beats: 6 } } }
    patch song_timing_path(song), params: { line_timing: timing.to_json }
    expect(song.reload.line_timing.dig("lines", "Verse#0", "beats")).to eq(6.0)
    expect(song.detail_json(member)[:can_edit_sync]).to be(true)
  end

  it "still keeps out anyone the song isn't shared with" do
    song.update!(members_edit_sync: true)
    sign_in outsider
    get song_timing_path(song)
    expect(response).to have_http_status(:not_found)
  end

  it "only lets the owner flip the switch" do
    sign_in owner
    patch song_path(song), params: { members_edit_sync: true }
    expect(song.reload.members_edit_sync).to be(true)

    sign_in member
    patch song_path(song), params: { members_edit_sync: false }
    expect(song.reload.members_edit_sync).to be(true)
  end
end
