# frozen_string_literal: true

# Seeds a demo account with a few public-domain sample songs, so the app
# isn't empty on first run. Safe to run more than once.
#
# Only an admin can add other users or groups from the app itself -- there's
# no public sign-up and no UI to grant the admin flag, so this demo account
# is seeded as an admin directly. Promote any other user the same way, from
# `bin/rails console`:
#
#   User.find_by(email: "someone@example.com").update!(admin: true)

demo = User.find_or_create_by!(email: "demo@example.com") do |u|
  u.name = "Demo Singer"
  u.password = "password12345"
  u.verified = true
  u.admin = true
end

samples = [
  {
    title: "Amazing Grace",
    artist: "Traditional (John Newton)",
    key: "G",
    capo: "0",
    tempo: 80,
    body: <<~CHORD
      [Intro]
      G   G7   C   G   x4

      [Verse 1]
      G              G7           C        G
      Amazing grace, how sweet the sound,
      G                       D
      That saved a wretch like me.
      G                 G7          C          G
      I once was lost, but now am found,
      Em          D            G
      Was blind, but now I see.

      [Verse 2]
      G                G7            C        G
      'Twas grace that taught my heart to fear,
      G                       D
      And grace my fears relieved.
      G                G7          C           G
      How precious did that grace appear,
      Em              D            G
      The hour I first believed.
    CHORD
  },
  {
    title: "Oh! Susanna",
    artist: "Stephen Foster",
    key: "C",
    capo: "0",
    tempo: 108,
    body: <<~CHORD
      [Verse 1]
      C                          F           C
      I come from Alabama with my banjo on my knee,
      C                        G          C
      I'm going to Louisiana, my true love for to see.
      C                          F            C
      It rained all night the day I left, the weather it was dry,
      C                       G                C
      The sun so hot I froze to death; Susanna, don't you cry.

      [Chorus]
      C                    F        C
      Oh, Susanna, don't you cry for me,
      C                     G            C
      For I come from Alabama with my banjo on my knee.
    CHORD
  },
  {
    title: "Auld Lang Syne",
    artist: "Traditional (Robert Burns)",
    key: "D",
    capo: "0",
    tempo: 90,
    body: <<~CHORD
      [Verse 1]
      D                     G      D
      Should auld acquaintance be forgot,
      D                  A7        D
      And never brought to mind?
      D                       G       D
      Should auld acquaintance be forgot,
      D            A7          D
      And auld lang syne?

      [Chorus]
      D             G              D
      For auld lang syne, my dear,
      Bm             E7        A7
      For auld lang syne,
      D                     G      D
      We'll take a cup o' kindness yet,
      D            A7           D
      For auld lang syne.
    CHORD
  }
]

samples.each do |attrs|
  demo.songs.find_or_create_by!(title: attrs[:title]) do |song|
    song.artist = attrs[:artist]
    song.key = attrs[:key]
    song.capo = attrs[:capo]
    song.tempo = attrs[:tempo]
    song.body = attrs[:body]
  end
end

puts "Seeded demo@example.com / password12345 with #{demo.songs.count} songs."
