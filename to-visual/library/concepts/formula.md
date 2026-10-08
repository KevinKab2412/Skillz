---
name: formula
kind: concept
purpose: Define a value in terms of other values and keep it up to date.
familiar_as: a spreadsheet cell formula (=A1*2)
misconception: A formula stores its value (pasted values); or copying it keeps the same references (relative vs absolute).
op: B := A × 2 → change A → B updates
state: cells · formulas · references (relative or absolute)
actions: set value · set formula · copy formula
syncs: with reference, with range
visual: Cells with wires from inputs to the formula cell; change an input, watch the wire pulse and the value update. Good familiar-as for dbt models.
sources: Daniel Jackson, The Essence of Software (2021), ch. 3, ch. 5
origin: seed · jackson
tags: [concept]
---
