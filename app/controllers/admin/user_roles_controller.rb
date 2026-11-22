# frozen_string_literal: true

module Admin
  # The super admin makes someone an admin (they can create groups), or
  # takes it away. Super admins themselves are made from the command line
  # (lib/tasks/users.rake), never here.
  class UserRolesController < BaseController
    def update
      @user = User.find(params[:user_id])
      if @user == Current.user || @user.super_admin?
        redirect_to admin_users_path, alert: "A super admin's role is changed from the command line."
        return
      end

      admin = ActiveModel::Type::Boolean.new.cast(params[:admin]) == true
      @user.update!(admin: admin)
      redirect_to admin_users_path,
        notice: admin ? "#{@user.name} is now an admin" : "#{@user.name} is no longer an admin"
    end
  end
end
