import { type Consumer, createConsumer } from "@rails/actioncable"

// A single shared WebSocket connection (ActionCable "consumer") for the
// whole app. Channels subscribe over this one connection rather than each
// opening their own socket.
let consumer: Consumer | null = null

export function getConsumer(): Consumer {
  if (!consumer) consumer = createConsumer("/cable")
  return consumer
}
