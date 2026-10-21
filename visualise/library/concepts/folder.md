---
name: folder
kind: concept
purpose: Organize items in a hierarchy where names belong to the containing folder.
familiar_as: a Unix directory
misconception: A name is metadata on the item, so renaming a shared folder renames it for everyone (Dropbox: it depends where the entry lives).
op: rename an entry inside a shared parent → every sharer sees the new name; rename a top-level shared entry → only you do
state: entries (folder → name → item)
actions: create · rename · move · remove entry
syncs: with sharing; with trash
visual: A tree whose edges carry the names; renaming edits an edge, not the node.
sources: Daniel Jackson, The Essence of Software (2021), ch. 2
origin: seed · jackson
tags: [concept]
---
