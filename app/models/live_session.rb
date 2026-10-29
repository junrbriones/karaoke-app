class LiveSession < ApplicationRecord
  belongs_to :group
  belongs_to :leader, class_name: "User"

  validates :song_ids, presence: true

  scope :active, -> { where(ended_at: nil) }

  before_create :reset_clock_to_count_in

  def active?
    ended_at.nil?
  end

  # The session's songs, in the order they were queued -- missing/deleted
  # songs are silently dropped rather than raising.
  def songs
    by_id = Song.where(id: song_ids).index_by(&:id)
    song_ids.map { |id| by_id[id] }.compact
  end

  def current_song
    songs[current_index]
  end

  # Negative while the pre-song count-in cue is still running; 0 is the
  # instant the song itself starts, exactly like the tempo guide already
  # treats "before the first word" elsewhere in this app.
  def elapsed_seconds(now = Time.current)
    return clock_offset unless playing? && clock_started_at

    clock_offset + (now - clock_started_at)
  end

  # How long the count-in cue lasts, in seconds, at the session's current
  # tempo -- 0 beats disables it entirely.
  def count_in_seconds
    beats = count_in_beats.to_i
    return 0.0 if beats <= 0

    safe_bpm = bpm.to_i > 0 ? bpm.to_i : 100
    beats * (60.0 / safe_bpm)
  end

  def play!
    return if playing?

    update!(playing: true, clock_started_at: Time.current)
  end

  def pause!
    return unless playing?

    update!(playing: false, clock_offset: elapsed_seconds, clock_started_at: nil)
  end

  def restart!
    update!(clock_offset: -count_in_seconds, clock_started_at: playing? ? Time.current : nil)
  end

  def seek_to!(index)
    return unless index.is_a?(Integer) && index >= 0 && index < song_ids.length

    update!(current_index: index, clock_offset: -count_in_seconds, clock_started_at: playing? ? Time.current : nil)
  end

  BPM_RANGE = (20..300)
  BEATS_PER_LINE_RANGE = (1..16)

  # Safe to call mid-song: the clock is rescaled so everyone stays at the
  # same spot in the song, just moving faster or slower from there (see
  # rescale_elapsed). The tempo guide's timeline is musical time -- the
  # count-in in beats, the song in lines of beats_per_line beats -- so
  # without this, a tempo change would make every screen jump to wherever
  # the same number of seconds lands at the new speed.
  def set_tempo!(bpm: nil, beats_per_line: nil)
    new_bpm = bpm.present? && bpm.to_i.positive? ? bpm.to_i.clamp(BPM_RANGE) : self.bpm
    new_bpl =
      if beats_per_line.present? && beats_per_line.to_i.positive?
        beats_per_line.to_i.clamp(BEATS_PER_LINE_RANGE)
      else
        self.beats_per_line
      end
    return if new_bpm == self.bpm && new_bpl == self.beats_per_line

    now = Time.current
    rescaled = self.class.rescale_elapsed(
      elapsed_seconds(now),
      from_bpm: self.bpm, to_bpm: new_bpm,
      from_beats_per_line: self.beats_per_line, to_beats_per_line: new_bpl
    )
    update!(
      bpm: new_bpm,
      beats_per_line: new_bpl,
      clock_offset: rescaled,
      clock_started_at: playing? ? now : nil
    )
  end

  # Mirrors rescaleElapsed in app/javascript/lib/tempoGuide.ts.
  def self.rescale_elapsed(elapsed, from_bpm:, to_bpm:, from_beats_per_line:, to_beats_per_line:)
    from_bpm = from_bpm.to_i.positive? ? from_bpm.to_i : 100
    to_bpm = to_bpm.to_i.positive? ? to_bpm.to_i : 100
    beat_ratio = from_bpm.to_f / to_bpm
    return elapsed * beat_ratio if elapsed.negative?

    from_bpl = from_beats_per_line.to_i.positive? ? from_beats_per_line.to_i : 4
    to_bpl = to_beats_per_line.to_i.positive? ? to_beats_per_line.to_i : 4
    elapsed * beat_ratio * (to_bpl.to_f / from_bpl)
  end

  # Changes the count-in length for future restarts/song changes. Doesn't
  # touch whatever's already playing, so it's safe to tweak mid-song.
  def set_count_in!(beats)
    n = beats.to_i
    return if n.negative?

    update!(count_in_beats: n)
  end

  def end!
    update!(ended_at: Time.current, playing: false)
  end

  def state_for_broadcast
    {
      id: id,
      active: active?,
      leader_id: leader_id,
      leader_name: leader.name,
      current_index: current_index,
      playing: playing,
      clock_started_at: clock_started_at&.iso8601(3),
      clock_offset: clock_offset,
      bpm: bpm,
      beats_per_line: beats_per_line,
      count_in_beats: count_in_beats
    }
  end

  def broadcast_state!
    ActionCable.server.broadcast("group_live_#{group_id}", state_for_broadcast)
  end

  private

  def reset_clock_to_count_in
    self.clock_offset = -count_in_seconds
  end
end
