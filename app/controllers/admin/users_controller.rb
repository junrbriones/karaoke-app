# frozen_string_literal: true

module Admin
  # Adding a user account is an admin-only action -- there's no public
  # sign-up anymore. Creating a user here never signs the admin out of
  # their own session (unlike the old public sign-up flow, this doesn't
  # touch the session cookie at all).
  class UsersController < BaseController
    def index
      last_sign_in = ActivityEvent.where(action: "signed_in").group(:user_id).maximum(:created_at)
      last_active = ActivityEvent.group(:user_id).maximum(:created_at)
      failed = ActivityEvent.where(action: "sign_in_failed", created_at: 1.day.ago..).group(:user_id).count
      render inertia: "admin/users/index", props: {
        users: User.order(:name).map do |u|
          user_json(u).merge(
            last_sign_in_at: last_sign_in[u.id],
            last_active_at: last_active[u.id],
            failed_sign_ins_today: failed[u.id] || 0
          )
        end
      }
    end

    def new
      render inertia: "admin/users/new"
    end

    # "Mark as verified" vouches for the address (the admin knows them):
    # no verification email is sent. Otherwise they get one, as before.
    def create
      @user = User.new(user_params)
      @user.verified = verified_by_admin?

      if @user.save
        if @user.verified?
          redirect_to admin_users_path, notice: "#{@user.name} was added and marked as verified"
        else
          send_email_verification
          redirect_to admin_users_path, notice: "#{@user.name} was added -- a verification email is on its way"
        end
      else
        redirect_to new_admin_user_path, inertia: { errors: @user.errors }
      end
    end

    private

    def user_params
      params.permit(:email, :name, :password, :password_confirmation)
    end

    def verified_by_admin?
      ActiveModel::Type::Boolean.new.cast(params[:verified]) == true
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
