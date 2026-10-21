---
name: capability
kind: concept
purpose: Grant access to whoever holds a token, without checking who they are.
familiar_as: a presigned URL or an API key
misconception: A token proves who you are, or works on every server (unless bound to one).
op: issue t for r → present t → access; revoke or expire t → denied
state: tokens (token → resource, scope, expiry)
actions: issue · present · revoke · expire
syncs: with authentication (phishing relays a token: the 2FA attack)
visual: A key card that opens one door; show it at another door and nothing happens.
sources: Daniel Jackson, The Essence of Software (2021), ch. 3
origin: seed · jackson
tags: [concept]
---
