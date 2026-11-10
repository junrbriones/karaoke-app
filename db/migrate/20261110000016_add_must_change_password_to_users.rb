# frozen_string_literal: true

# Set when an admin gives someone a new password: they're asked to choose
# their own the next time they sign in.
class AddMustChangePasswordToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :must_change_password, :boolean, default: false, null: false
  end
end
