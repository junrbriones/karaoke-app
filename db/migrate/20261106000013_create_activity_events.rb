# frozen_string_literal: true

# The admin activity log: sign-ins (and failed attempts), sign-outs,
# account changes, and changes to songs, groups and live sessions.
class CreateActivityEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :activity_events do |t|
      # Who did it. Kept (as a name/email snapshot in actor_label) even
      # after the account is deleted, when user_id goes back to null.
      t.references :user, foreign_key: { on_delete: :nullify }, null: true
      t.string :actor_label
      t.string :action, null: false
      t.string :category, null: false
      t.string :outcome, null: false, default: "ok"
      # What it was done to (a song, a group...), with its title/name as
      # it was then.
      t.string :subject_type
      t.bigint :subject_id
      t.string :subject_label
      t.json :details
      t.string :ip_address
      t.string :user_agent
      t.datetime :created_at, null: false
    end
    add_index :activity_events, :created_at
    add_index :activity_events, %i[user_id created_at]
    add_index :activity_events, %i[category created_at]
  end
end
