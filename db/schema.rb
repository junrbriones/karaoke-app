# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_31_000012) do
  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "groups", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.string "slug", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_groups_on_slug", unique: true
  end

  create_table "live_sessions", force: :cascade do |t|
    t.integer "beats_per_line", default: 4, null: false
    t.integer "bpm", default: 100, null: false
    t.float "clock_offset", default: 0.0, null: false
    t.datetime "clock_started_at"
    t.integer "count_in_beats", default: 4, null: false
    t.datetime "created_at", null: false
    t.integer "current_index", default: 0, null: false
    t.datetime "ended_at"
    t.integer "group_id", null: false
    t.integer "leader_id", null: false
    t.boolean "playing", default: false, null: false
    t.json "song_ids", null: false
    t.datetime "updated_at", null: false
    t.index ["group_id", "ended_at"], name: "index_live_sessions_on_group_id_and_ended_at"
    t.index ["group_id"], name: "index_live_sessions_on_group_id"
    t.index ["leader_id"], name: "index_live_sessions_on_leader_id"
  end

  create_table "memberships", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "group_id", null: false
    t.string "role", default: "member", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["group_id"], name: "index_memberships_on_group_id"
    t.index ["user_id", "group_id"], name: "index_memberships_on_user_id_and_group_id", unique: true
    t.index ["user_id"], name: "index_memberships_on_user_id"
  end

  create_table "sessions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "ip_address"
    t.datetime "updated_at", null: false
    t.string "user_agent"
    t.integer "user_id", null: false
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "setlist_songs", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "position", default: 0, null: false
    t.integer "setlist_id", null: false
    t.integer "song_id", null: false
    t.datetime "updated_at", null: false
    t.index ["setlist_id", "position"], name: "index_setlist_songs_on_setlist_id_and_position"
    t.index ["setlist_id", "song_id"], name: "index_setlist_songs_on_setlist_id_and_song_id", unique: true
    t.index ["setlist_id"], name: "index_setlist_songs_on_setlist_id"
    t.index ["song_id"], name: "index_setlist_songs_on_song_id"
  end

  create_table "setlists", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "group_id", null: false
    t.string "name", null: false
    t.string "slug", null: false
    t.datetime "updated_at", null: false
    t.index ["group_id", "slug"], name: "index_setlists_on_group_id_and_slug", unique: true
    t.index ["group_id"], name: "index_setlists_on_group_id"
  end

  create_table "song_shares", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "group_id", null: false
    t.integer "song_id", null: false
    t.datetime "updated_at", null: false
    t.index ["group_id"], name: "index_song_shares_on_group_id"
    t.index ["song_id", "group_id"], name: "index_song_shares_on_song_id_and_group_id", unique: true
    t.index ["song_id"], name: "index_song_shares_on_song_id"
  end

  create_table "songs", force: :cascade do |t|
    t.string "artist"
    t.text "body", default: "", null: false
    t.string "capo"
    t.datetime "created_at", null: false
    t.boolean "in_setlist", default: false, null: false
    t.string "key"
    t.json "line_timing"
    t.json "phrasing"
    t.string "slug", null: false
    t.integer "tempo"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["user_id", "slug"], name: "index_songs_on_user_id_and_slug", unique: true
    t.index ["user_id"], name: "index_songs_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.boolean "admin", default: false, null: false
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.string "name", null: false
    t.string "password_digest", null: false
    t.datetime "updated_at", null: false
    t.boolean "verified", default: false, null: false
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "live_sessions", "groups"
  add_foreign_key "live_sessions", "users", column: "leader_id"
  add_foreign_key "memberships", "groups"
  add_foreign_key "memberships", "users"
  add_foreign_key "sessions", "users"
  add_foreign_key "setlist_songs", "setlists"
  add_foreign_key "setlist_songs", "songs"
  add_foreign_key "setlists", "groups"
  add_foreign_key "song_shares", "groups"
  add_foreign_key "song_shares", "songs"
  add_foreign_key "songs", "users"
end
