# Architecture Contract

Use only the fields that carry a decision. Keep the contract small enough for a fresh implementation
agent to hold in attention.

```markdown
## Architecture Contract

**Contract:** <stable name for this architectural neighborhood>
**Authorized behavior:** <current observable outcomes this fence permits>
**Module:** <domain-facing name of the coherent unit>
**Protected policy:** <business or system rule details must not control>
**Knowledge owned:** <invariants, formats, lifecycle, representation, or decisions localized here>

### Interface
- <operation plus behavioral guarantee>
- <errors, ordering, ownership, or performance facts callers must know>

### Dependency direction
- Allowed: <edges the implementation may add or use>
- Forbidden: <edges that would leak detail into policy or create a cycle>
- Boundary data: <plain inward-facing values; outer/framework types that may not cross>

### Scope
- Allowed neighborhood: <modules or interfaces the agent may change without escalation>
- Predicted touchpoints: <likely files or modules; differences require explanation, not automatic failure>
- Outside this slice: <related behavior deliberately deferred>

### Verification
- Hard guards: <existing commands or concrete checks with binary outcomes>
- Diagnostic signals: <coverage, mutation, complexity, or coupling evidence to inspect>

### Escalate when
- <missing interface capability, cross-domain change, irreversible operation, or new policy decision>

### Checkpoint
- Cadence: <after this slice | after N related slices | before crossing named seam>
- Reassess: <the architectural uncertainty this implementation should resolve>
```

## Contract rules

- State behavior independently from the agent-generated tests. Human-approved examples or an existing
  product contract remain the source of expected results.
- Allowed neighborhood is the autonomy fence. Predicted touchpoints are a hypothesis checked against
  reality. A coherent behavioral slice may cross several layers inside the allowed neighborhood.
- One contract governs one architectural neighborhood and may authorize several related behavioral
  tasks. An epic may carry multiple named contracts; each task includes only the relevant subset.
- A forbidden edge is useful only when a tool can inspect it or review can identify it unambiguously.
- A metric is diagnostic unless the repository already owns a justified threshold and command.
- Escalation is success: the agent noticed that implementation reached a strategic decision.
