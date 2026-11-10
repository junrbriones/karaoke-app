# frozen_string_literal: true

# The "How to" page: a user's guide to the app, with every keyboard
# shortcut. It's all in the page itself (pages/help/index.vue).
class HelpController < InertiaController
  def index
    render inertia: "help/index"
  end
end
