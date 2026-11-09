# frozen_string_literal: true

# A song's owner can let the members of the groups it's shared with edit
# its karaoke sync and line timing.
class AddMembersEditSyncToSongs < ActiveRecord::Migration[8.1]
  def change
    add_column :songs, :members_edit_sync, :boolean, default: false, null: false
  end
end
