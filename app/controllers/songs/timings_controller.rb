# frozen_string_literal: true

module Songs
  # The line timing editor: when each line of the chord sheet starts, tapped
  # out against the song's audio or music playing in another app, so the
  # tempo guide (and the sheet's scrolling) follows the song's real pace.
  # See app/javascript/pages/songs/timing.vue and lib/lineTiming.ts. The
  # owner's -- or, when they allow it, their groups' (Song#sync_editable_by?).
  class TimingsController < InertiaController
    MAX_LINES = 2_000
    BEATS_RANGE = (0.25..128.0)
    SECONDS_RANGE = (0.0..36_000.0)

    before_action :set_sync_song

    def show
      render inertia: "songs/timing", props: { song: @song.detail_json(Current.user) }
    end

    # Takes `line_timing` (a JSON string, or blank to clear it):
    #   { version: 2, bpm, source, end, lines: { id => { text, start } } }
    # -- start times in seconds -- and optionally the song's `tempo`, the
    # tempo Stage Mode plays the timing at in real time. (Older timings,
    # { bpm, lines: { id => { text, beats } } }, are still accepted.)
    def update
      timing = parse_timing(params[:line_timing])
      if timing == :invalid
        redirect_to song_timing_path(@song), inertia: { errors: { line_timing: [ "couldn't be read. Please try again." ] } }
        return
      end

      @song.line_timing = timing
      @song.tempo = params[:tempo].to_i if params[:tempo].present? && params[:tempo].to_i.between?(20, 300)

      if @song.save
        redirect_to song_timing_path(@song), notice: "Line timing saved"
      else
        redirect_to song_timing_path(@song), inertia: { errors: @song.errors }
      end
    end

    private

    # The song's owner -- or, when the owner allows it, a member of a group
    # it's shared with (Song#sync_editable_by?). Their own song first, if
    # two share a slug.
    def set_sync_song
      @song = Current.user.songs.find_by(slug: params[:song_id]) ||
        Song.accessible_to(Current.user).find_by!(slug: params[:song_id])
      raise ActiveRecord::RecordNotFound unless @song.sync_editable_by?(Current.user)
    end

    # Keeps only well-formed entries: a text and a sensible start time (or,
    # in an older timing, a beat length) per line id. Returns nil to clear
    # the timing, or :invalid on bad JSON.
    def parse_timing(raw)
      return nil if raw.blank?

      data = raw.is_a?(String) ? JSON.parse(raw) : raw.to_unsafe_h
      return :invalid unless data.is_a?(Hash) && data["lines"].is_a?(Hash)

      timed = data["version"].to_i == 2 || data["lines"].values.any? { |e| e.is_a?(Hash) && e.key?("start") }
      lines = data["lines"].first(MAX_LINES).each_with_object({}) do |(id, entry), out|
        next unless entry.is_a?(Hash)

        text = entry["text"].to_s.first(500)
        if timed
          start = Float(entry["start"], exception: false)
          next unless start && SECONDS_RANGE.cover?(start)

          out[id.to_s.first(200)] = { "text" => text, "start" => start.round(3) }
        else
          beats = Float(entry["beats"], exception: false)
          next unless beats && BEATS_RANGE.cover?(beats)

          out[id.to_s.first(200)] = { "text" => text, "beats" => beats.round(2) }
        end
      end
      return nil if lines.empty?

      bpm = data["bpm"].to_i
      bpm = bpm.between?(20, 300) ? bpm : nil
      return { "bpm" => bpm, "lines" => lines } unless timed

      finish = Float(data["end"], exception: false)
      {
        "version" => 2,
        "bpm" => bpm,
        "source" => %w[audio external].include?(data["source"]) ? data["source"] : nil,
        "end" => finish && SECONDS_RANGE.cover?(finish) ? finish.round(3) : nil,
        "lines" => lines
      }
    rescue JSON::ParserError
      :invalid
    end
  end
end
