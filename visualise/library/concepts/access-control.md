---
name: access control
kind: concept
purpose: Limit which actions a user may perform on which resources.
familiar_as: file permissions / RBAC
misconception: Hiding a button means the action is forbidden; or permissions are checked once at login.
op: grant u on r → u's action on r succeeds; revoke → it fails
state: permissions (user → resource → actions)
actions: grant · revoke · check
syncs: suppression sync: the guarded action happens only if check succeeds
visual: A gate on each request arrow that opens or closes per user.
sources: Daniel Jackson, The Essence of Software (2021), ch. 3, ch. 6
origin: seed · jackson
tags: [concept]
---
