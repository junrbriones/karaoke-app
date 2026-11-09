import type { LucideIcon } from "lucide-vue-next"

import type { LineTiming } from "@/lib/lineTiming"
import type { Phrasing } from "@/lib/phrasing"

export interface Auth {
  user: User
  session: Pick<Session, "id">
}

export interface BreadcrumbItem {
  title: string
  href: string
}

export interface NavItem {
  title: string
  href: string
  icon?: LucideIcon
  isActive?: boolean
}

export interface FlashData {
  alert?: string
  notice?: string
}

export interface SharedProps {
  auth: Auth
}

export interface User {
  id: number
  name: string
  email: string
  avatar?: string
  admin: boolean
  verified: boolean
  created_at: string
  updated_at: string
}

export type BreadcrumbItemType = BreadcrumbItem

export interface Session {
  id: number
  user_agent: string
  ip_address: string
  created_at: string
}

export interface SongShareRef {
  id: number
  group_id: number
}

export interface ShareableGroup {
  id: number
  name: string
}

export interface UploadedFile {
  filename: string
  byte_size: number
  uploaded_at: string
}

export interface Song {
  id: number
  title: string
  artist?: string | null
  key?: string | null
  capo?: string | null
  tempo?: number | null
  body?: string
  slug: string
  in_setlist: boolean
  owned: boolean
  owner_name?: string | null
  has_audio: boolean
  has_instrumental?: boolean
  phrasing_ready: boolean
  audio_url?: string | null
  // Owner only: the uploaded track, saved with the song.
  audio_file?: UploadedFile | null
  // An optional "minus-one": the song without its lead vocal.
  instrumental_url?: string | null
  instrumental_file?: (UploadedFile & { same_as_audio?: boolean }) | null
  phrasing?: Phrasing | null
  line_timing?: LineTiming | null
  // Whether group members may edit its karaoke sync and line timing (set
  // by the owner), and whether the viewer can.
  members_edit_sync?: boolean
  can_edit_sync?: boolean
  shares?: SongShareRef[]
  shareable_groups?: ShareableGroup[]
}

export interface GroupMember {
  id: number
  user_id: number
  name: string
  email: string
  role: "owner" | "member"
}

export interface Group {
  id: number
  name: string
  slug: string
  is_owner: boolean
  member_count: number
  members?: GroupMember[]
}

export interface SetlistEntry {
  id: number
  position: number
  song: Song
  // A personal setlist's song that's no longer shared with its owner.
  unavailable?: boolean
}

export interface Setlist {
  id: number
  name: string
  slug: string
  song_count: number
  is_owner?: boolean
  entries?: SetlistEntry[]
  available_songs?: Song[]
}

export interface LiveSessionState {
  id: number
  active: boolean
  leader_id: number
  leader_name: string
  current_index: number
  playing: boolean
  clock_started_at: string | null
  clock_offset: number
  bpm: number
  beats_per_line: number
  count_in_beats: number
}

export interface LiveSessionSummary {
  leader_name: string
  current_song_title?: string | null
}
