# frozen_string_literal: true

module Songs
  # The line timing editor: how many beats each line of the chord sheet
  # lasts, so the tempo guide (and the sheet's scrolling) follows the song's
  # real pace. See app/javascript/pages/songs/timing.vue and
  # lib/lineTiming.ts. Owner-only, like the rest of song editing.
  class TimingsController < InertiaController
    MAX_LINES = 2_000
    BEATS_RANGE = (0.25..128.0)

    before_action :set_owned_song

    def show
      render inertia: "songs/timing", props: { song: @song.detail_json(Current.user) }
    end

    # Takes `line_timing` (a JSON string: { bpm, lines: { id => { text, beats } } },
    # or blank to clear it) and optionally the song's `tempo`, which the
    # beat lengths were worked out at.
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

    def set_owned_song
      @song = Current.user.songs.find_by!(slug: params[:song_id])
    end

    # Keeps only well-formed entries: a text and a sensible beat length per
    # line id. Returns nil to clear the timing, or :invalid on bad JSON.
    def parse_timing(raw)
      return nil if raw.blank?

      data = raw.is_a?(String) ? JSON.parse(raw) : raw.to_unsafe_h
      return :invalid unless data.is_a?(Hash) && data["lines"].is_a?(Hash)

      lines = data["lines"].first(MAX_LINES).each_with_object({}) do |(id, entry), out|
        next unless entry.is_a?(Hash)

        beats = Float(entry["beats"], exception: false)
        next unless beats && BEATS_RANGE.cover?(beats)

        out[id.to_s.first(200)] = { "text" => entry["text"].to_s.first(500), "beats" => beats.round(2) }
      end
      return nil if lines.empty?

      bpm = data["bpm"].to_i
      { "bpm" => (bpm.between?(20, 300) ? bpm : nil), "lines" => lines }
    rescue JSON::ParserError
      :invalid
    end
  end
end
