---
name: synchronization
kind: concept
purpose: Keep two collections the same, including deletions.
familiar_as: Dropbox or iCloud sync
misconception: Sync is a backup. It isn't: deleting on one side deletes on the other.
op: change or delete in A → the same change appears in B
state: two collections · mapping between them
actions: change · propagate
syncs: breaks integrity when a 'file' is only a link (Google Drive .gdoc)
visual: Two mirrored panels; delete on the left and watch the right lose it too.
sources: Daniel Jackson, The Essence of Software (2021), ch. 3, ch. 11
origin: seed · jackson
tags: [concept]
---
