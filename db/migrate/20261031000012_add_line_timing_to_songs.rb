# frozen_string_literal: true

class AddLineTimingToSongs < ActiveRecord::Migration[8.1]
  def change
    add_column :songs, :line_timing, :json
  end
end
