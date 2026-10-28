# frozen_string_literal: true

class CreateSongs < ActiveRecord::Migration[8.0]
  def change
    create_table :songs do |t|
      t.references :user, null: false, foreign_key: true
      t.string  :title,      null: false
      t.string  :artist
      t.string  :key
      t.string  :capo
      t.integer :tempo
      t.text    :body, null: false, default: ""
      t.string  :slug, null: false
      t.boolean :in_setlist, null: false, default: false

      t.timestamps
    end

    add_index :songs, [ :user_id, :slug ], unique: true
  end
end
