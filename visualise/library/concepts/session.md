---
name: session
kind: concept
purpose: Tie a series of requests to one logged-in user.
familiar_as: staying logged in to a website
misconception: A session is the user's identity forever; or logging out elsewhere ends this session.
op: log in → requests carry the session → log out (or expire) → requests are anonymous
state: sessions (token → user, expiry)
actions: log in · log out · expire
syncs: with access control; with cookie
visual: A badge attached to each request arrow; it fades at expiry.
sources: Daniel Jackson, The Essence of Software (2021), ch. 3, ch. 7
origin: seed · jackson
tags: [concept]
---
