# frozen_string_literal: true

# The super admin runs the Admin area (users, activity, password resets,
# who's an admin). Regular admins keep creating groups, but no longer see
# the Admin area. Grant it with `bin/rails "users:super_admin[email]"`.
class AddSuperAdminToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :super_admin, :boolean, default: false, null: false
  end
end
