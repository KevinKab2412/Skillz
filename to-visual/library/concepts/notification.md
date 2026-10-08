---
name: notification
kind: concept
purpose: Tell a user promptly about events they care about.
familiar_as: a push notification
misconception: Notifications are a complete log, or always on (the user can't stop them).
op: register interest in event kind k → k happens → you get a notice
state: interests (user → event kinds) · pending notices
actions: register · unregister · notify
syncs: with almost anything (synchronized to other concepts' actions)
visual: Event source → notice tray; unregistering cuts the wire.
sources: Daniel Jackson, The Essence of Software (2021), ch. 5, ch. 6
origin: seed · jackson
tags: [concept]
---
