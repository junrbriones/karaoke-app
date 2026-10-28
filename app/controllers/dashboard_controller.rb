# frozen_string_literal: true

class DashboardController < InertiaController
  def index
    redirect_to songs_path
  end
end
