---
name: cache
kind: concept
purpose: Answer faster by reusing an earlier result.
familiar_as: a browser cache / memoization
misconception: Cached means fresh; or invalidation is automatic.
op: get k (miss) → fetch and store → get k (hit) → invalidate k → get k (miss)
state: entries (key → value, stored_at)
actions: get · put · invalidate · expire
syncs: with the source of truth it shadows
visual: Two routes: the long trip to the database vs the short trip to the shelf; invalidation empties the shelf.
sources: Daniel Jackson, The Essence of Software (2021), ch. 3
origin: seed · jackson
tags: [concept]
---
