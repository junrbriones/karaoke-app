# frozen_string_literal: true

class AddPhrasingToSongs < ActiveRecord::Migration[8.1]
  def change
    add_column :songs, :phrasing, :json
  end
end
