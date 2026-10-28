# frozen_string_literal: true

class GroupsController < InertiaController
  before_action :set_group, only: %i[show edit update destroy]
  before_action :require_owner, only: %i[edit update destroy]

  def index
    render inertia: "groups/index", props: { groups: Current.user.groups.order(:name).map { |g| group_json(g) } }
  end

  def show
    render inertia: "groups/show", props: {
      group: group_json(@group).merge(members: member_list(@group)),
      songs: @group.dashboard_songs.map { |s| s.summary_json(Current.user) },
      live_session: live_session_summary(@group)
    }
  end

  def edit
    render inertia: "groups/edit", props: { group: group_json(@group) }
  end

  def update
    if @group.update(group_params)
      redirect_to group_path(@group), notice: "Group updated"
    else
      redirect_to edit_group_path(@group), inertia: { errors: @group.errors }
    end
  end

  def destroy
    @group.destroy!
    redirect_to groups_path, notice: "Group deleted"
  end

  private

  def set_group
    @group = Current.user.groups.find_by!(slug: params[:id])
  end

  def require_owner
    redirect_to group_path(@group), alert: "Only the group owner can do that." unless @group.owned_by?(Current.user)
  end

  def group_params
    params.permit(:name)
  end

  def group_json(group)
    {
      id: group.id,
      name: group.name,
      slug: group.slug,
      is_owner: group.owned_by?(Current.user),
      member_count: group.memberships.count
    }
  end

  # A snapshot as of this page load -- not pushed live to this page. Open
  # the group's Live page for the real-time view.
  def live_session_summary(group)
    session = group.active_live_session
    return nil unless session

    {
      leader_name: session.leader.name,
      current_song_title: session.current_song&.title
    }
  end

  def member_list(group)
    ordered = group.memberships.includes(:user).to_a.sort_by { |m| [ m.role == "owner" ? 0 : 1, m.user.name.downcase ] }
    ordered.map do |m|
      {
        id: m.id,
        user_id: m.user_id,
        name: m.user.name,
        email: m.user.email,
        role: m.role
      }
    end
  end
end
