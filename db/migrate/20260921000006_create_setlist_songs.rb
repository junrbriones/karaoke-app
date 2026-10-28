class CreateSetlistSongs < ActiveRecord::Migration[8.0]
  def change
    create_table :setlist_songs do |t|
      t.references :setlist, null: false, foreign_key: true
      t.references :song, null: false, foreign_key: true
      t.integer :position, null: false, default: 0
      t.timestamps
    end
    add_index :setlist_songs, [ :setlist_id, :song_id ], unique: true
    add_index :setlist_songs, [ :setlist_id, :position ]
  end
end
