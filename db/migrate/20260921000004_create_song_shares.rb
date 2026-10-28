# frozen_string_literal: true

class CreateSongShares < ActiveRecord::Migration[8.0]
  def change
    create_table :song_shares do |t|
      t.references :song, null: false, foreign_key: true
      t.references :group, null: false, foreign_key: true

      t.timestamps
    end

    add_index :song_shares, [ :song_id, :group_id ], unique: true
  end
end
