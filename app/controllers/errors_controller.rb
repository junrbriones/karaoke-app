# frozen_string_literal: true

# Error pages that work no matter how the request got here:
#
# - #show is the app's exceptions app (config/application.rb): anything not
#   already handled in a controller -- a crash in middleware, a non-page
#   controller -- lands here with the status in the path ("/500").
# - #not_found is the last route in config/routes.rb, so an unknown URL gets
#   the friendly 404 page at its own address (not redirected to "/404").
# - #preview (development and test only) shows any of the pages at
#   /errors/:status, since development otherwise shows Rails' debug pages.
#
# Deliberately not an InertiaController/ApplicationController subclass: an
# error page must never itself bounce to sign-in, be blocked by the browser
# check, or trip CSRF protection on the POST that just failed.
class ErrorsController < ActionController::Base
  include ErrorPages

  skip_forgery_protection

  inertia_share auth: {
    user: -> { Current.user.as_json(only: %i[id name email admin verified created_at updated_at]) },
    session: -> { Current.session.as_json(only: %i[id]) }
  }

  before_action :resume_session

  def show
    status = request.path_info.delete_prefix("/").to_i
    status = exception_status if status.zero?
    render_error_page(status)
  end

  def not_found
    render_error_page(404)
  end

  def preview
    render_error_page(params[:status].to_i)
  end

  private

  # Signed-in or not decides which way-back links the page offers. If the
  # session can't be looked up (say the database is what's down), carry on
  # signed out -- the page still renders.
  def resume_session
    Current.session ||= Session.find_by_id(cookies.signed[:session_token])
  rescue StandardError
    Current.session = nil
  end

  def exception_status
    exception = request.env["action_dispatch.exception"]
    return 500 unless exception

    ActionDispatch::ExceptionWrapper.status_code_for_exception(exception.class.name)
  end
end
