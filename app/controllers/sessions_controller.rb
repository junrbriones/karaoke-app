# frozen_string_literal: true

class SessionsController < InertiaController
  skip_before_action :authenticate, only: %i[new create]
  before_action :require_no_authentication, only: %i[new create]
  before_action :set_session, only: :destroy

  def new
  end

  def create
    if user = User.authenticate_by(email: params[:email], password: params[:password])
      @session = user.sessions.create!
      cookies.signed.permanent[:session_token] = { value: @session.id, httponly: true }

      redirect_to after_sign_in_path, notice: "Signed in successfully"
    else
      redirect_to sign_in_path, alert: "That email or password is incorrect"
    end
  end

  def destroy
    @session.destroy!
    Current.session = nil
    redirect_to settings_sessions_path, notice: "That session has been logged out", inertia: { clear_history: true }
  end

  private

  def set_session
    @session = Current.user.sessions.find(params[:id])
  end

  # Wherever they were headed before being asked to sign in (only ever a
  # path on this site), or the dashboard.
  def after_sign_in_path
    path = session.delete(:return_to_after_sign_in).to_s
    path.start_with?("/") && !path.start_with?("//") ? path : dashboard_path
  end
end
