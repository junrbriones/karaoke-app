# frozen_string_literal: true

module Admin
  # An admin sets a new password for someone who's forgotten theirs -- the
  # way back in while there's no email to send a reset link with. The admin
  # passes the new password on to them directly; by default they're asked
  # to choose their own as soon as they sign in with it. Every device
  # they're signed in on is signed out (User's after_update), so the old
  # password stops working everywhere at once.
  class UserPasswordsController < BaseController
    before_action :set_user

    def edit
      render inertia: "admin/users/password", props: {
        user: {
          id: @user.id,
          name: @user.name,
          email: @user.email,
          admin: @user.admin,
          must_change_password: @user.must_change_password,
          sessions_count: @user.sessions.count
        },
        is_self: @user == Current.user
      }
    end

    def update
      @user.assign_attributes(password_params)
      # Choosing your own password needs no "change it" prompt afterwards.
      @user.must_change_password = must_change? && @user != Current.user

      if @user.password.blank?
        @user.errors.add(:password, "can't be blank")
        redirect_to edit_admin_user_password_path(@user), inertia: { errors: @user.errors }
      elsif @user.save
        redirect_to edit_admin_user_password_path(@user),
          notice: "#{@user.name}'s password has been changed"
      else
        redirect_to edit_admin_user_password_path(@user), inertia: { errors: @user.errors }
      end
    end

    private

    def set_user
      @user = User.find(params[:user_id])
    end

    def password_params
      params.permit(:password, :password_confirmation)
    end

    def must_change?
      ActiveModel::Type::Boolean.new.cast(params[:must_change_password]) == true
    end
  end
end
