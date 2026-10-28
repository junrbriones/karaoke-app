class CreateSetlists < ActiveRecord::Migration[8.0]
  def change
    create_table :setlists do |t|
      t.references :group, null: false, foreign_key: true
      t.string :name, null: false
      t.string :slug, null: false
      t.timestamps
    end
    add_index :setlists, [ :group_id, :slug ], unique: true
  end
end
