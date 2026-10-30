# frozen_string_literal: true

# Renders the app's own error page (app/javascript/pages/errors/show.vue)
# instead of a bare status page, so whoever hits an error -- a broken link,
# a deleted song, a server hiccup -- gets a clear explanation and a way back:
# go back, try again, or jump to the most useful nearby page.
#
# Used by InertiaController (errors raised while handling a page) and
# ErrorsController (the exceptions app, the not-found catch-all, and the
# development previews).
module ErrorPages
  extend ActiveSupport::Concern

  private

  def render_error_page(status)
    status = Rack::Utils.status_code(status)
    status = 500 unless status.between?(400, 599)

    if error_page_renderable?
      render inertia: "errors/show",
        props: {
          status: status,
          path: error_original_path,
          # Only a page load can simply be tried again; a failed form post
          # is retried by going back to the form instead.
          retry_path: request.get? ? request.original_fullpath : nil,
          request_id: request.request_id,
          signed_in: Current.user.present?
        },
        status: status
    else
      head status
    end
  end

  # Browsers and Inertia visits get the page; API-ish requests (JSON, images,
  # etc.) just get the status code.
  def error_page_renderable?
    return true if request.headers["X-Inertia"].present?

    request.format.html? || request.format.to_s == "*/*"
  rescue ActionDispatch::Http::MimeNegotiation::InvalidType
    true
  end

  # The path the person actually asked for -- inside the exceptions app the
  # request has been re-pointed at "/404", "/500", etc.
  def error_original_path
    request.env["action_dispatch.original_path"].presence || request.path
  end
end
