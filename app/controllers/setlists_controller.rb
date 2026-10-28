# frozen_string_literal: true

class SetlistsController < InertiaController
  before_action :set_group
  before_action :set_setlist, only: %i[show edit update destroy stage]
  before_action :require_owner, only: %i[new create edit update destroy]

  def index
    render inertia: "groups/setlists/index", props: {
      group: group_json,
      setlists: @group.setlists.order(:name).map { |s| setlist_json(s) }
    }
  end

  def show
    render inertia: "groups/setlists/show", props: {
      group: group_json,
      setlist: setlist_detail_json
    }
  end

  def new
    render inertia: "groups/setlists/new", props: { group: group_json }
  end

  def create
    @setlist = @group.setlists.new(setlist_params)

    if @setlist.save
      redirect_to group_setlist_path(@group, @setlist), notice: "Setlist created"
    else
      redirect_to new_group_setlist_path(@group), inertia: { errors: @setlist.errors }
    end
  end

  def edit
    render inertia: "groups/setlists/edit", props: { group: group_json, setlist: setlist_json(@setlist) }
  end

  def update
    if @setlist.update(setlist_params)
      redirect_to group_setlist_path(@group, @setlist), notice: "Setlist updated"
    else
      redirect_to edit_group_setlist_path(@group, @setlist), inertia: { errors: @setlist.errors }
    end
  end

  def destroy
    @setlist.destroy!
    redirect_to group_setlists_path(@group), notice: "Setlist deleted"
  end

  # Runs this setlist's songs, in order, through the shared Stage Mode page.
  def stage
    render inertia: "songs/stage", props: {
      songs: @setlist.ordered_setlist_songs.map { |ss| ss.song.detail_json(Current.user) },
      single: false,
      exit_href: group_setlist_path(@group, @setlist)
    }
  end

  private

  def set_group
    @group = Current.user.groups.find_by!(slug: params[:group_id])
  end

  def set_setlist
    @setlist = @group.setlists.find_by!(slug: params[:id])
  end

  def require_owner
    redirect_to group_setlists_path(@group), alert: "Only the group owner can do that." unless @group.owned_by?(Current.user)
  end

  def setlist_params
    params.permit(:name)
  end

  def group_json
    { id: @group.id, name: @group.name, slug: @group.slug, is_owner: @group.owned_by?(Current.user) }
  end

  def setlist_json(setlist)
    { id: setlist.id, name: setlist.name, slug: setlist.slug, song_count: setlist.setlist_songs.count }
  end

  def setlist_detail_json
    entries = @setlist.ordered_setlist_songs
    is_owner = @group.owned_by?(Current.user)
    already_in = entries.map(&:song_id)
    available = is_owner ? @group.dashboard_songs.where.not(id: already_in) : []

    setlist_json(@setlist).merge(
      is_owner: is_owner,
      entries: entries.map { |ss| { id: ss.id, position: ss.position, song: ss.song.summary_json(Current.user) } },
      available_songs: available.map { |s| s.summary_json(Current.user) }
    )
  end
end
