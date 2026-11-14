# frozen_string_literal: true

# Reading a song's Line timing from the editors (a JSON string, or blank to
# clear it):
#   { version: 2, bpm, source, end, lines: { id => { text, start } } }
# -- start times in seconds. Older timings, { bpm, lines: { id => { text,
# beats } } }, are still accepted. Used by the Line timing editor and by the
# karaoke sync, which saves the same timing (see lib/sharedTiming.ts).
module LineTimingParams
  extend ActiveSupport::Concern

  MAX_LINES = 2_000
  BEATS_RANGE = (0.25..128.0)
  SECONDS_RANGE = (0.0..36_000.0)

  private

  # Keeps only well-formed entries: a text and a sensible start time (or,
  # in an older timing, a beat length) per line id. Returns nil to clear
  # the timing, or :invalid on bad JSON.
  def parse_line_timing(raw)
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
