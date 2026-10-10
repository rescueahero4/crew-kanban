<div align="center">

<h1>crew-kanban</h1>

**See your whole crew at a glance: every agent in your Claude session, what it's doing, and which files it's touching.**

[![Version](https://img.shields.io/badge/version-0.1.0-d77757?style=for-the-badge)](mod/crew-kanban/.claude-plugin/plugin.json)
[![Claude Code mod](https://img.shields.io/badge/Claude_Code-mod-black?style=for-the-badge)](#setup)
[![Session-scoped](https://img.shields.io/badge/data-session--scoped-6b4fc8?style=for-the-badge)](#where-your-data-lives)

</div>

## What you can do

- 👀 **See who's working.** A band above the prompt sums up the crew. The **Crew** tab groups every agent by status: Planning, In Progress, Done.
- 📊 **Check each agent's progress.** Role, model, effort, context use, tokens, cost and time sit on each agent's card, along with a progress bar.
- 🗂️ **Watch files change live.** The **Edits** tree shows your project folder. Files an agent changed get an A/M/D badge, and files being written right now shimmer.
- 📜 **Follow what happened.** Each agent has an **Activity Log**. Each task on the **Kanban** tab merges the activity of every agent working on it.
- 🧢 **Tell agents apart.** Every agent is a Clawd mascot whose accessories match its type: a wizard hat for the lead, a detective hat for reviewers, a hard hat for builders, a beret for designers. Claude draws new ones for unfamiliar agent types.

> **Nothing to configure.** Install once, then type `/crew` in any session. Everything it shows comes from the current session and disappears when the session ends.

---

## Contents

- [Setup](#setup): get it running in about a minute
- [How to use it](#how-to-use-it): the band, the tabs and the detail views
- [Reference](#reference): terms, options, file locations, troubleshooting, notes for AI agents

---

# Setup

Two steps.

## Step 1 — Install Claude Code

You need [Claude Code](https://claude.com/claude-code) in the terminal or the desktop app. Crew Kanban is a **mod**: a Claude Code plugin that draws its own interface inside Claude.

## Step 2 — Add the mod

In a Claude session, add this repo's `mod/` folder as a plugin marketplace, then install the plugin:

```sh
/plugin marketplace add ./mod
/plugin install crew-kanban@crew-kanban-mod
```

Use the path to `mod/` from wherever your session is running.

<details>
<summary>What this adds</summary>

- a `/crew` command that opens the Crew pane
- a one-line band above the prompt that appears once the session has agents or tool activity
- a single option, **Reduce motion** (see [Options](#reference))

It doesn't write any files to your project. Everything it tracks is kept in the session's memory.

</details>

---

# How to use it

## Open the Crew pane

Type `/crew`, or click the band above the prompt. Click the band again to close the pane.

| You want to… | Go to |
|---|---|
| See how many agents are working and how far along they are | **Crew** tab |
| See session totals: cost, tokens, time | top of the **Crew** tab |
| See every task, grouped by status | **Kanban** tab |
| See which files one agent changed, and what it did | click the agent → **agent detail** |
| See everything that happened on one task | click the task → **task detail** |
| Jump from a task to one of its agents | click the agent's chip in task detail |

## The detail views

- **Agent detail**: the agent's card at the top, with **Edits** on the left and the **Activity Log** on the right. Drag the divider to make either side wider. The log streams in live, newest at the bottom.
- **Task detail**: the task's id, status and title, a chip for every agent on it, and an **Activity** stream that merges all their log entries. A **Live** indicator shows while the task is in progress.
- **Back** returns you to the tab you came from.

> **Tip:** if you scroll up in a live log, new entries won't pull you back to the bottom. Jump to the latest when you're ready.

---

# Reference

<details>
<summary><b>Terms you'll see</b></summary>

| Term | Meaning |
|---|---|
| **Crew** | All the agents in the current session, including the main session itself. |
| **Band** | The one-line summary above the prompt. Click it to open or close the pane. |
| **Status** | Planning, In Progress or Done, for both agents and tasks. |
| **A / M / D** | Added, modified or deleted, shown next to a file in the Edits tree. |
| **Shimmer** | A file that some agent is writing right now. It stays lit for a moment after the write lands. |
| **Role** | Lead, Review, Implementation or Designer. It's inferred from the agent's type and picks the mascot's accessories. |

</details>

<details>
<summary><b>Options</b></summary>

| Option | Default | What it does |
|---|---|---|
| **Reduce motion** | off | Mascots are drawn still, and files being edited get a static tint instead of the shimmer. |

Set it in the plugin's settings in Claude Code.

</details>

<details>
<summary><b>Where your data lives</b></summary>

| What | Where |
|---|---|
| The mod itself | `mod/crew-kanban/` |
| Plugin manifest and options | `mod/crew-kanban/.claude-plugin/plugin.json` |
| Marketplace entry | `mod/.claude-plugin/marketplace.json` |
| Event handlers, band and pane | `mod/crew-kanban/hooks/register.tsx` |
| Views, data model, mascots, roles | `mod/crew-kanban/hooks/{views.tsx,model.ts,mascot.ts,theme.ts}` |
| Design mockups, the source of truth for UX | `.design-recall/mockups/` |
| Design decisions and PRD | `.design-recall/decisions/`, `.design-recall/specs/PRD.md` |
| Product context | `PRODUCT.md` |

Session data (agents, tasks, edits, activity) is kept only in the session's state. Nothing is written to disk and nothing outlives the session.

</details>

<details>
<summary><b>Troubleshooting</b></summary>

- **I don't see the band.** It only shows up once the session has used a tool or started a subagent. You can still type `/crew` to open the pane.
- **The Edits tree is missing a folder.** `.git` and `node_modules` are skipped on purpose.
- **The motion is distracting.** Turn on **Reduce motion** in the plugin's options.
- **An agent's mascot looks generic at first.** Claude hasn't drawn accessories for that agent type yet. Until it does, the agent wears a placeholder look.

</details>

<details>
<summary><b>For AI agents</b></summary>

Facts for agents working in this repo:

- **Plugin:** `mod/crew-kanban/`, registered by `mod/.claude-plugin/marketplace.json` as `crew-kanban` in the `crew-kanban-mod` marketplace. The entry module is `hooks/register.tsx`, listed in `hooks/hooks.json`.
- **State:** all state lives in `atom`s scoped to `crew-kanban` (`crew`, `nav`, `layout`, `isOpen`, `generated`, `looks`). Keep it session-scoped and never persist it.
- **Surfaces:** the `crew` pane is opened by `/crew` or the band, and the band is rendered into `AbovePrompt`. The roster polls every 1s, and the animation repaints every 250ms unless `reducedMotion` is on.
- **Tests:** `hooks/crew.test.tsx`, using `claude-code/testing`.
- **Design first:** this project uses **design-recall**. Mockups in `.design-recall/mockups/` define the UX. Change them only through the `design-iterate` skill, and read `.design-recall/context/design-principles.md` before any design work. Never run plain `git` against `.design-recall/`. See `CLAUDE.md`.

</details>

---

<div align="center">

**Built for anyone who has ever started five agents and wondered which one is editing that file.**

</div>
