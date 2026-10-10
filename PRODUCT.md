# Crew Kanban — product context

Written from the designer's own description (2026-10-10). Assumptions are labelled.

## What it is

A UI for a **Claude mod**: an interface rendered inside Claude desktop or the terminal. It can be triggered
inside any Claude session.

## What it does for the user

- Shows **how many agents are actively working** in the session, their **progress**, and other metadata
  (role, model, effort, context use, tokens, cost, time).
- **Visualises the files being edited** by agents (the Edits tree, with a live "being edited" state).
- Shows an **activity log** of what agents did, per agent and per task (Kanban tab).

## Scope and data

- **Session-scoped**: only information from the current session is shown or kept. Nothing persists after it.

## Surfaces

- Crew tab: the agents working, grouped by status. Kanban tab: all tasks as a list grouped by status.
- Agent detail: Edits tree + Activity Log. Task detail: merged agent activity for the task.
- Mode: Operate (the user is monitoring work in progress), within a host pane of any width.

## Identity

- Every agent is a Claude mascot (Clawd) with accessories for its type; Claude can generate new accessories
  from the session's context.
- Assumption: dark UI matches the Claude desktop/terminal host; the Figma frames are dark.
