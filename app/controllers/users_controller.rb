# frozen_string_literal: true

# Self-service actions on the signed-in user's own account. Creating a new
# account is an admin-only action now -- see Admin::UsersController -- so
# this controller only handles a user deleting themselves.
class UsersController < InertiaController
  def destroy
    user = Current.user
    if user.authenticate(params[:password_challenge] || "")
      user.destroy!
      Current.session = nil
      redirect_to root_path, notice: "Your account has been deleted", inertia: { clear_history: true }
    else
      redirect_to settings_profile_path, inertia: { errors: { password_challenge: "Password challenge is invalid" } }
    end
  end
end
