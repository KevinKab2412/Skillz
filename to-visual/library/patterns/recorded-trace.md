---
name: recorded-trace
kind: pattern
purpose: Show what the code really does, not what an agent imagines it does.
when: A change with runnable tests on Django, Laravel, FastAPI or Express (Jest + supertest).
how: Run the change's own tests with to-visual's recorder, snapshot the concept's models after every request, and play the steps as beats with a provenance chip per beat.
sources: to-visual concept view (this repo); Litt's named examples
origin: seed · to-visual
tags: [pattern]
---
