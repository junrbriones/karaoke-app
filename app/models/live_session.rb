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
  def elapsed_seconds
    return clock_offset unless playing? && clock_started_at

    clock_offset + (Time.current - clock_started_at)
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

  def set_tempo!(bpm: nil, beats_per_line: nil)
    changes = {}
    changes[:bpm] = bpm.to_i if bpm.present? && bpm.to_i > 0
    changes[:beats_per_line] = beats_per_line.to_i if beats_per_line.present? && beats_per_line.to_i > 0
    update!(changes) if changes.any?
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
