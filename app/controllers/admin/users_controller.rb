# frozen_string_literal: true

module Admin
  # Adding a user account is an admin-only action -- there's no public
  # sign-up anymore. Creating a user here never signs the admin out of
  # their own session (unlike the old public sign-up flow, this doesn't
  # touch the session cookie at all).
  class UsersController < BaseController
    def index
      render inertia: "admin/users/index", props: {
        users: User.order(:name).map { |u| user_json(u) }
      }
    end

    def new
      render inertia: "admin/users/new"
    end

    def create
      @user = User.new(user_params)

      if @user.save
        send_email_verification
        redirect_to admin_users_path, notice: "#{@user.name} was added"
      else
        redirect_to new_admin_user_path, inertia: { errors: @user.errors }
      end
    end

    private

    def user_params
      params.permit(:email, :name, :password, :password_confirmation)
    end

    def send_email_verification
      UserMailer.with(user: @user).email_verification.deliver_later
    end

    def user_json(user)
      {
        id: user.id,
        name: user.name,
        email: user.email,
        admin: user.admin,
        verified: user.verified,
        created_at: user.created_at
      }
    end
  end
end
