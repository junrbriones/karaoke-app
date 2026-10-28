# frozen_string_literal: true

# Streams live-session control updates (play/pause, current song, tempo) to
# every member of a group who has the group's Live page open. Anyone who
# isn't a member of the group is rejected rather than subscribed.
class GroupLiveChannel < ApplicationCable::Channel
  def subscribed
    group = current_user.groups.find_by(id: params[:group_id])
    return reject unless group

    stream_from "group_live_#{group.id}"
  end
end
