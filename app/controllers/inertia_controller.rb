# frozen_string_literal: true

class InertiaController < ApplicationController
  include ErrorPages

  inertia_config default_render: true
  inertia_share auth: {
        user: -> { Current.user.as_json(only: %i[id name email admin verified created_at updated_at]) },
        session: -> { Current.session.as_json(only: %i[id]) }
      }

  # Handlers are matched last-declared first, so the catch-all goes first.
  rescue_from StandardError, with: :render_unexpected_error
  rescue_from ActiveRecord::RecordNotFound, ActionController::RoutingError,
    ActionController::ParameterMissing, ActionController::UnknownFormat,
    with: :render_known_error
  rescue_from ActionController::InvalidAuthenticityToken, with: :recover_expired_form

  private

  # A missing song/group/setlist, a bad link or form: the friendly page with
  # its proper status (404, 400, 406...). In development and test these
  # still raise, so Rails' debug page shows what went wrong -- preview the
  # friendly pages at /errors/404 etc. instead.
  def render_known_error(exception)
    raise exception if Rails.env.local?

    render_error_page(ActionDispatch::ExceptionWrapper.status_code_for_exception(exception.class.name))
  end

  def render_unexpected_error(exception)
    raise exception if Rails.env.local?

    Rails.error.report(exception, handled: true, severity: :error)
    render_error_page(ActionDispatch::ExceptionWrapper.status_code_for_exception(exception.class.name))
  end

  # The form's security token went stale -- the page sat open across a
  # sign-out, a deploy, or a long break. Nothing to show an error page for:
  # send them back to the page they were on, freshly loaded, to try again.
  def recover_expired_form
    redirect_back_or_to root_path,
      alert: "That page had been open a while, so your change wasn't saved. It's been refreshed -- please try again."
  end
end
