# frozen_string_literal: true

module Admin
  # Shared base for the administration area. Every action under this
  # namespace requires the signed-in user to be an admin -- there's no UI
  # for granting that flag; it's set directly in the database, e.g. from
  # `bin/rails console`:
  #
  #   User.find_by(email: "someone@example.com").update!(admin: true)
  class BaseController < InertiaController
    before_action :require_admin
  end
end
