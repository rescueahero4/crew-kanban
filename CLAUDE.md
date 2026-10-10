# crew-kanban

<!-- design-recall:start -->
## Design memory

This project uses **design-recall** (v0.4.3). Mockups live in `.design-recall/mockups/` and are the
single source of truth for UX, the PRD and the solution architecture. Every change to them is an
iteration recorded by `node .design-recall/bin/dm.js` with a Design Decision Record (DDR).

Skills in `.claude/skills/` (read the matching SKILL.md before acting):
- **design-iterate** — ANY create/change/compare/revert/fork of a mockup. Never edit mockups without it.
- **design-critique** — edge cases, unhappy paths, feasibility → findings (uses agents in `.claude/agents/`).
- **design-spec** — PRD and solution-architecture docs derived from mockups + DDRs + findings.
- **design-viewer** — build the local HTML viewer of iterations and decisions.
- **design-principles** — distil confirmed DDRs into `.design-recall/context/design-principles.md`; check drift.

**Read `.design-recall/context/design-principles.md` at the start of any design work** if it exists. It is
the designer's own stated preferences, with evidence, and outranks generic best practice.

Never run plain `git` against `.design-recall/`; use `dm` commands only.
Docs: `.design-recall/docs/` (conventions, ddr-schema, findings-schema, critique-checklists).
<!-- design-recall:end -->
