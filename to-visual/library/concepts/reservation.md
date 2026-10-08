---
name: reservation
kind: concept
purpose: Make efficient use of a limited pool of resources.
familiar_as: a restaurant booking
misconception: A reservation holds the resource even if you cancel; or a no-show costs the provider nothing.
op: reserve r → (don't cancel) → use r succeeds
state: available resources · reservations (user → resource)
actions: provide · retract · reserve · cancel · use
syncs: with notification (reminders); with a no-show penalty
visual: A row of slots; reserving claims one, cancel frees it, use consumes it. Trap: two reservations for one slot.
sources: Daniel Jackson, The Essence of Software (2021), ch. 4
origin: seed · jackson
tags: [concept]
---
