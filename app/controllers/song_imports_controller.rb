# frozen_string_literal: true

# Bulk song import: many chord sheets at once, from files or pasted text.
# The files are read and converted in the browser (lib/songImport.ts), which
# shows a preview; what's sent here is the list of songs to create. It's
# all or nothing: if any song can't be saved, none are, and the reasons come
# back against each one so it can be fixed (or left out) and sent again.
class SongImportsController < InertiaController
  MAX_SONGS = 200
  MAX_BODY = 100_000

  def new
    render inertia: "songs/import", props: {
      existing: Current.user.songs.pluck(:title, :artist).map { |title, artist| { title: title, artist: artist } },
      max_songs: MAX_SONGS
    }
  end

  def create
    rows = parse_rows
    if rows.nil?
      redirect_to import_songs_path, inertia: { errors: { import: "Nothing to import." } }
      return
    end
    if rows.size > MAX_SONGS
      redirect_to import_songs_path, inertia: { errors: { import: "That's #{rows.size} songs -- import up to #{MAX_SONGS} at a time." } }
      return
    end

    songs = rows.map { |row| Current.user.songs.new(row) }
    problems = {}
    Song.transaction do
      songs.each_with_index do |song, i|
        problems["song_#{i}"] = song.errors.full_messages.to_sentence unless song.save
      end
      raise ActiveRecord::Rollback if problems.any?
    end

    if problems.any?
      redirect_to import_songs_path, inertia: { errors: problems.merge(import: "#{problems.size} of #{songs.size} songs couldn't be saved, so nothing was imported yet.") }
    else
      redirect_to songs_path, notice: "Imported #{songs.size} song#{'s' unless songs.size == 1}"
    end
  end

  private

  # The songs as JSON (one string field: it's a list of objects that strong
  # params doesn't map onto neatly), each cut down to the fields a song has.
  def parse_rows
    list = JSON.parse(params[:songs].to_s)
    return nil unless list.is_a?(Array) && list.any?

    list.filter_map do |row|
      next unless row.is_a?(Hash)

      {
        title: row["title"].to_s.strip.truncate(200, omission: ""),
        artist: row["artist"].to_s.strip.truncate(200, omission: "").presence,
        key: row["key"].to_s.strip.truncate(20, omission: "").presence,
        capo: row["capo"].to_s.strip.truncate(20, omission: "").presence,
        tempo: (t = row["tempo"].to_i).between?(20, 300) ? t : nil,
        body: row["body"].to_s.truncate(MAX_BODY, omission: "")
      }
    end.presence
  rescue JSON::ParserError
    nil
  end
end
