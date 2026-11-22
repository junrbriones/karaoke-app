# frozen_string_literal: true

# Who runs the app: there's no UI to make a super admin (so nobody can lock
# everyone else out from the app itself) -- it's done here:
#
#   bin/rails "users:super_admin[you@example.com]"
#   bin/rails "users:revoke_super_admin[someone@example.com]"
#   bin/rails users:roles
namespace :users do
  desc "Make a user a super admin (runs the Admin area)"
  task :super_admin, [ :email ] => :environment do |_, args|
    user = find_user!(args[:email])
    user.update!(super_admin: true)
    puts "#{user.name} <#{user.email}> is now a super admin."
  end

  desc "Take away a user's super admin role"
  task :revoke_super_admin, [ :email ] => :environment do |_, args|
    user = find_user!(args[:email])
    user.update!(super_admin: false)
    puts "#{user.name} <#{user.email}> is no longer a super admin."
  end

  desc "List super admins and admins"
  task roles: :environment do
    User.where(super_admin: true).or(User.where(admin: true)).order(:name).each do |u|
      puts "#{u.super_admin? ? "super admin" : "admin      "}  #{u.name} <#{u.email}>"
    end
  end

  def find_user!(email)
    abort "Give an email: bin/rails \"users:super_admin[you@example.com]\"" if email.blank?
    User.find_by(email: email.strip.downcase) || abort("No user with the email #{email}")
  end
end
