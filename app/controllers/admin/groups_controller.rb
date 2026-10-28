# frozen_string_literal: true

module Admin
  # Creating a group is an admin-only action. The admin who creates it
  # becomes its owner, same as group creation always worked, and can add
  # other members by email from the group page afterward.
  class GroupsController < BaseController
    def new
      render inertia: "admin/groups/new"
    end

    def create
      @group = Group.new(group_params)

      Group.transaction do
        @group.save!
        @group.memberships.create!(user: Current.user, role: "owner")
      end

      redirect_to group_path(@group), notice: "Group created"
    rescue ActiveRecord::RecordInvalid
      redirect_to new_admin_group_path, inertia: { errors: @group.errors }
    end

    private

    def group_params
      params.permit(:name)
    end
  end
end
