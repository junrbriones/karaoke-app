# frozen_string_literal: true

module Songs
  # The KaraFun-style phrasing editor: upload a song's audio, and tap out a
  # tap-timed, screen-by-screen sync (see app/javascript/pages/songs/phrasing.vue
  # and lib/phrasing.ts for the client-side parsing/recording). Owner-only,
  # same as the rest of song editing.
  class PhrasingsController < InertiaController
    before_action :set_owned_song

    def show
      render inertia: "songs/phrasing", props: { song: @song.detail_json(Current.user) }
    end

    def update
      @song.audio.attach(params[:audio]) if params[:audio].present?
      # The optional minus-one (the song without its lead vocal).
      @song.instrumental.attach(params[:instrumental]) if params[:instrumental].present?
      @song.instrumental.purge_later if params[:remove_instrumental].present? && @song.instrumental.attached?

      if params.key?(:phrasing)
        parsed = parse_phrasing(params[:phrasing])
        if parsed == :invalid
          redirect_to song_phrasing_path(@song), inertia: { errors: { phrasing: [ "was not valid JSON" ] } }
          return
        end
        @song.phrasing = parsed
      end

      # A line-by-line sync finds the song's tempo from the taps; the editor
      # can send it along to become the song's tempo.
      @song.tempo = params[:tempo].to_i if params[:tempo].present? && params[:tempo].to_i.between?(20, 300)

      if @song.save
        redirect_to song_phrasing_path(@song), notice: saved_notice
      else
        redirect_to song_phrasing_path(@song), inertia: { errors: @song.errors }
      end
    end

    private

    def saved_notice
      if params[:instrumental].present? then "Minus-one track saved"
      elsif params[:remove_instrumental].present? then "Minus-one track removed"
      elsif params[:audio].present? then "Audio saved"
      else "Karaoke sync saved"
      end
    end

    def set_owned_song
      @song = Current.user.songs.find_by!(slug: params[:song_id])
    end

    # The client sends the whole phrasing document as one JSON string field
    # (it's a nested structure that doesn't map cleanly onto Rails' strong
    # params) -- opaque to this controller, same as `body`'s freeform text.
    # Returns nil for "clear it", a Hash for "set it", or :invalid on bad JSON.
    def parse_phrasing(raw)
      return nil if raw.blank?

      raw.is_a?(String) ? JSON.parse(raw) : raw
    rescue JSON::ParserError
      :invalid
    end
  end
end
