---
name: backup
kind: concept
purpose: Get back earlier versions after loss or a mistake.
familiar_as: Time Machine
misconception: 'Backed up as of 1:05' covers everything saved before 1:05 (it doesn't if a scan runs first); or deleted files stay forever.
op: save f → backup runs → later restore f as it was
state: versions (file → time → content) · scan list
actions: scan · upload · restore · purge
syncs: contrast with synchronization (backups keep deletions recoverable)
visual: A timeline per file with snapshots; restore pulls one forward. Trap: the scan-then-upload gap.
sources: Daniel Jackson, The Essence of Software (2021), ch. 2, ch. 9
origin: seed · jackson
tags: [concept]
---
