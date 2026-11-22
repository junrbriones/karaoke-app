# frozen_string_literal: true

module Admin
  # Shared base for the administration area (users, activity, password
  # resets, roles): the super admin's. Regular admins don't see it -- they
  # only create groups (Admin::GroupsController). There's no UI for making
  # a super admin; it's a rake task:
  #
  #   bin/rails "users:super_admin[someone@example.com]"
  class BaseController < InertiaController
    before_action :require_super_admin
  end
end
