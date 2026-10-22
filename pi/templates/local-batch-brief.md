# One approved implementation batch

Planning task: K2412/planning#<task-number>
Planning epic: K2412/planning#<epic-number>
Feature branch: <branch>

## Objective

<One observable behavior to implement.>

## Existing public seam

<Where a caller or user observes the behavior. If the seam in code differs,
stop and report the conflict.>

## Acceptance examples

<Concrete inputs and expected results from the approved plan or product
contract. Do not invent expected results while writing tests.>

## Architecture contract

<Paste the approved epic contract and this task's subset verbatim, including
dependency direction, ownership, hard guards, and escalation conditions.>

## Allowed scope

<Files or architectural neighborhood the worker may edit.>

## Checks

<Focused behavior tests and every hard guard to run.>

## Stop conditions

<Any missing decision, human gate, conflicting seam, or need to edit outside
the allowed scope. Stop and report rather than widening the task.>

## Return

Report the behavior implemented, tests run and their results, changed files,
uncertainties, and anything requiring frontier or human review. Leave planning
issues and pull requests untouched.
