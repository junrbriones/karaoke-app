# frozen_string_literal: true

# A setlist now belongs either to a group (a band's, run by its owner) or
# to one user (a solo performer's own).
class AddPersonalSetlists < ActiveRecord::Migration[8.1]
  def change
    add_reference :setlists, :user, foreign_key: true, null: true
    change_column_null :setlists, :group_id, true
    add_index :setlists, %i[user_id slug], unique: true
  end
end
