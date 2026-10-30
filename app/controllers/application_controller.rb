# frozen_string_literal: true

class ApplicationController < ActionController::Base
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  before_action :set_current_request_details
  before_action :authenticate

  private

  def authenticate
    return if perform_authentication

    # Come back here after signing in, rather than starting over from the
    # dashboard (only for pages -- replaying a form post isn't safe).
    if request.get? && request.path != root_path &&
        (request.headers["X-Inertia"].present? || !request.xhr?)
      session[:return_to_after_sign_in] = request.fullpath
      flash[:alert] = "Please sign in to continue."
    end
    redirect_to sign_in_path
  end

  def require_no_authentication
    return unless perform_authentication

    flash[:notice] = "You are already signed in"
    redirect_to root_path
  end

  def require_admin
    redirect_to root_path, alert: "You don't have access to that." unless Current.user&.admin?
  end

  def perform_authentication
    Current.session ||= Session.find_by_id(cookies.signed[:session_token])
  end

  def set_current_request_details
    Current.user_agent = request.user_agent
    Current.ip_address = request.ip
  end
end
