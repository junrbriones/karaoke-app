# frozen_string_literal: true

# A personal setlist its owner shares with everyone signed in to the app:
# they can open it and run it in Stage Mode (read-only).
class AddSharedToSetlists < ActiveRecord::Migration[8.1]
  def change
    add_column :setlists, :shared, :boolean, default: false, null: false
    add_index :setlists, :shared
  end
end
