# frozen_string_literal: true

module Songs
  # The line timing editor: when each line of the chord sheet starts, tapped
  # out against the song's audio or music playing in another app, so the
  # tempo guide (and the sheet's scrolling) follows the song's real pace.
  # See app/javascript/pages/songs/timing.vue and lib/lineTiming.ts. The
  # owner's -- or, when they allow it, their groups' (Song#sync_editable_by?).
  class TimingsController < InertiaController
    include LineTimingParams
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
      timing = parse_line_timing(params[:line_timing])
      if timing == :invalid
        redirect_to song_timing_path(@song), inertia: { errors: { line_timing: [ "couldn't be read. Please try again." ] } }
        return
      end

      @song.line_timing = timing
      # One timing for both: the editor sends the karaoke sync's line starts
      # worked out from this timing too (lib/sharedTiming.ts).
      if params[:phrasing].present?
        phrasing = parse_shared_phrasing(params[:phrasing])
        @song.phrasing = phrasing if phrasing.is_a?(Hash)
      end
      @song.tempo = params[:tempo].to_i if params[:tempo].present? && params[:tempo].to_i.between?(20, 300)

      if @song.save
        notice = params[:phrasing].present? ? "Line timing saved, and the karaoke sync with it" : "Line timing saved"
        redirect_to song_timing_path(@song), notice: notice
      else
        redirect_to song_timing_path(@song), inertia: { errors: @song.errors }
      end
    end

    private

    def parse_shared_phrasing(raw)
      data = raw.is_a?(String) ? JSON.parse(raw) : raw.to_unsafe_h
      data.is_a?(Hash) && data["screens"].is_a?(Array) ? data : nil
    rescue JSON::ParserError
      nil
    end

    # The song's owner -- or, when the owner allows it, a member of a group
    # it's shared with (Song#sync_editable_by?). Their own song first, if
    # two share a slug.
    def set_sync_song
      @song = Current.user.songs.find_by(slug: params[:song_id]) ||
        Song.accessible_to(Current.user).find_by!(slug: params[:song_id])
      raise ActiveRecord::RecordNotFound unless @song.sync_editable_by?(Current.user)
    end
  end
end
