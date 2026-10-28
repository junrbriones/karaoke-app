class CreateLiveSessions < ActiveRecord::Migration[8.0]
  def change
    create_table :live_sessions do |t|
      t.references :group, null: false, foreign_key: true
      t.references :leader, null: false, foreign_key: { to_table: :users }
      t.json :song_ids, null: false
      t.integer :current_index, null: false, default: 0
      t.boolean :playing, null: false, default: false
      t.datetime :clock_started_at
      t.float :clock_offset, null: false, default: 0.0
      t.integer :bpm, null: false, default: 100
      t.integer :beats_per_line, null: false, default: 4
      t.datetime :ended_at
      t.timestamps
    end
    add_index :live_sessions, [ :group_id, :ended_at ]
  end
end
