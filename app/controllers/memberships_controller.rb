# frozen_string_literal: true

class MembershipsController < InertiaController
  before_action :set_group
  before_action :require_owner, only: %i[create]

  def create
    email = params[:email].to_s.strip.downcase

    if email.blank?
      redirect_to group_path(@group), inertia: { errors: { email: [ "can't be blank" ] } }
      return
    end

    invitee = User.find_by(email: email)
    if invitee.nil?
      redirect_to group_path(@group), inertia: { errors: { email: [ "No account found with that email" ] } }
      return
    end

    if @group.member?(invitee)
      redirect_to group_path(@group), inertia: { errors: { email: [ "#{invitee.name} is already a member" ] } }
      return
    end

    @group.memberships.create!(user: invitee, role: "member")
    redirect_to group_path(@group), notice: "#{invitee.name} added to #{@group.name}"
  end

  def destroy
    membership = @group.memberships.find(params[:id])
    is_owner = @group.owned_by?(Current.user)
    is_self = membership.user_id == Current.user.id

    if membership.owner?
      redirect_to group_path(@group), alert: "The group owner can't be removed. Delete the group instead."
      return
    end

    unless is_self || is_owner
      redirect_to group_path(@group), alert: "You can't remove that member."
      return
    end

    member_name = membership.user.name
    membership.destroy!

    if is_self
      redirect_to groups_path, notice: "You left #{@group.name}"
    else
      redirect_to group_path(@group), notice: "#{member_name} removed from #{@group.name}"
    end
  end

  private

  def set_group
    @group = Current.user.groups.find_by!(slug: params[:group_id])
  end

  def require_owner
    redirect_to group_path(@group), alert: "Only the group owner can do that." unless @group.owned_by?(Current.user)
  end
end
