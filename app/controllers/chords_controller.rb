# frozen_string_literal: true

# Guitar chord charts: look up any chord ("C#m7", "Bbmaj7", "G/B") and see
# how to play it. The charts are worked out in the browser
# (lib/guitarChords.ts), so all this does is open the page, with the chord
# from the link (/chords?q=C%23m7) already looked up.
class ChordsController < InertiaController
  def index
    render inertia: "chords/index", props: { query: params[:q].to_s.first(40) }
  end
end
