# frozen_string_literal: true

class LiveSessionsController < InertiaController
  before_action :set_group
  before_action :set_session, only: %i[show update destroy]
  before_action :require_leader, only: %i[update]
  before_action :require_leader_or_owner, only: %i[destroy]

  def show
    render inertia: "groups/live/show", props: {
      group: group_json,
      session: @session.state_for_broadcast,
      songs: @session.songs.map { |s| s.detail_json(Current.user) }
    }
  end

  def create
    song_ids = resolve_song_ids
    if song_ids.empty?
      redirect_to group_path(@group), alert: "Pick a song, or a setlist with at least one song, to go live with."
      return
    end

    session = nil
    LiveSession.transaction do
      @group.live_sessions.active.find_each(&:end!)
      session = @group.live_sessions.create!(
        leader: Current.user,
        song_ids: song_ids,
        bpm: Song.find_by(id: song_ids.first)&.tempo || 100
      )
    end

    session.broadcast_state!
    redirect_to group_live_session_path(@group), notice: "Live session started"
  end

  def update
    case params[:command]
    when "play" then @session.play!
    when "pause" then @session.pause!
    when "restart" then @session.restart!
    when "seek_index" then @session.seek_to!(params[:index].to_i)
    when "set_tempo" then @session.set_tempo!(bpm: params[:bpm], beats_per_line: params[:beats_per_line])
    when "set_count_in" then @session.set_count_in!(params[:beats])
    end

    @session.broadcast_state!
    redirect_to group_live_session_path(@group)
  end

  def destroy
    @session.end!
    @session.broadcast_state!
    redirect_to group_path(@group), notice: "Live session ended"
  end

  private

  def set_group
    @group = Current.user.groups.find_by!(slug: params[:group_id])
  end

  def set_session
    @session = @group.active_live_session
    redirect_to group_path(@group), alert: "No live session is running for #{@group.name} right now." if @session.nil?
  end

  def require_leader
    return if @session.leader_id == Current.user.id

    redirect_to group_live_session_path(@group),
      alert: "Only #{@session.leader.name}, who started this session, can control it."
  end

  def require_leader_or_owner
    return if @session.leader_id == Current.user.id || @group.owned_by?(Current.user)

    redirect_to group_live_session_path(@group), alert: "Only the session leader or the group owner can end this."
  end

  # A live session can be started from a single shared song (`song_id`) or
  # from a whole setlist (`setlist_id`), both scoped to songs this group can
  # already see -- exactly the same pool a setlist's songs can be drawn from.
  def resolve_song_ids
    if params[:setlist_id].present?
      setlist = @group.setlists.find_by(id: params[:setlist_id])
      setlist ? setlist.ordered_setlist_songs.map(&:song_id) : []
    elsif params[:song_id].present?
      song = @group.songs.find_by(id: params[:song_id])
      song ? [ song.id ] : []
    else
      []
    end
  end

  def group_json
    { id: @group.id, name: @group.name, slug: @group.slug }
  end
end
