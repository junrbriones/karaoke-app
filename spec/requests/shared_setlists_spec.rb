# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Setlists shared with everyone", type: :request do
  fixtures :users

  let(:me) { users(:one) }
  let(:bandmate) { users(:two) }
  let(:someone_else) { users(:admin) } # not in the band
  let!(:mine) { me.songs.create!(title: "Magsayawan", body: "[Verse]\nC\nTayo ay magsaya\n") }
  let!(:theirs) { bandmate.songs.create!(title: "Annie Batungbakal", body: "C\nSi Annie\n") }
  let!(:group) do
    Group.create!(name: "The Band").tap do |g|
      g.memberships.create!(user: bandmate, role: "owner")
      g.memberships.create!(user: me, role: "member")
      g.song_shares.create!(song: theirs)
    end
  end
  let!(:setlist) do
    me.setlists.create!(name: "Friday gig").tap do |s|
      s.add_song(mine)
      s.add_song(theirs)
    end
  end

  def page_props
    html = response.body
    json = html[%r{<script[^>]*data-page="app"[^>]*>(.*?)</script>}m, 1] ||
      CGI.unescapeHTML(html[/data-page="([^"]*)"/, 1].to_s)
    JSON.parse(json)["props"]
  end

  it "is only seen by its owner until they share it" do
    sign_in someone_else
    get shared_setlist_path(id: setlist.id)
    expect(response).to have_http_status(:not_found)

    get my_setlists_path
    expect(page_props["shared_setlists"]).to eq([])
  end

  it "lets the owner share it with everyone, and stop" do
    sign_in me
    patch share_my_setlist_path(setlist), params: { shared: true }
    expect(response).to redirect_to(my_setlist_path(setlist))
    expect(setlist.reload).to be_shared
    expect(ActivityEvent.where(action: "personal_setlist_shared")).to exist

    patch share_my_setlist_path(setlist), params: { shared: false }
    expect(setlist.reload).not_to be_shared
  end

  context "once it's shared" do
    before { setlist.update!(shared: true) }

    it "is listed for everyone else, with its owner" do
      sign_in someone_else
      get my_setlists_path
      expect(page_props["shared_setlists"]).to contain_exactly(
        hash_including("id" => setlist.id, "name" => "Friday gig", "owner_name" => me.name, "song_count" => 2)
      )
    end

    it "plays the owner's own songs for anyone, and their group's songs only for people who can open them" do
      sign_in someone_else
      get shared_setlist_path(id: setlist.id)
      expect(response).to have_http_status(:success)
      entries = page_props.dig("setlist", "entries")
      expect(entries.map { |e| [ e.dig("song", "title"), e["unavailable"] ] }).to eq(
        [ [ "Magsayawan", false ], [ "Annie Batungbakal", true ] ]
      )
      expect(page_props.dig("setlist", "is_owner")).to be(false)

      get stage_shared_setlist_path(id: setlist.id)
      expect(page_props["songs"].map { |s| s["title"] }).to eq([ "Magsayawan" ])

      sign_in bandmate
      get stage_shared_setlist_path(id: setlist.id, start: 1)
      expect(page_props["songs"].map { |s| s["title"] }).to eq([ "Magsayawan", "Annie Batungbakal" ])
      expect(page_props["start_index"]).to eq(1)
    end

    it "is read-only for everyone but its owner" do
      sign_in someone_else
      patch my_setlist_path(setlist), params: { name: "Mine now" }
      expect(response).to have_http_status(:not_found)
      post my_setlist_entries_path(setlist), params: { song_id: mine.id }
      expect(response).to have_http_status(:not_found)
      patch share_my_setlist_path(setlist), params: { shared: false }
      expect(response).to have_http_status(:not_found)
      expect(setlist.reload).to be_shared
    end

    it "sends its owner to their own editor" do
      sign_in me
      get shared_setlist_path(id: setlist.id)
      expect(response).to redirect_to(my_setlist_path(setlist))
    end
  end

  it "can't share a group's setlist" do
    group_setlist = group.setlists.create!(name: "Band set")
    group_setlist.shared = true
    expect(group_setlist).not_to be_valid
  end
end
