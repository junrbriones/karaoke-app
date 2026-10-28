# frozen_string_literal: true

class Membership < ApplicationRecord
  ROLES = %w[owner member].freeze

  belongs_to :user
  belongs_to :group

  validates :role, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :group_id }

  def owner?
    role == "owner"
  end
end
