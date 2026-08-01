# Project Guidelines for Claude

## Project Overview

Elegant frontend-only wedding seating planner: room layout with tables and fixtures, drag-and-drop guest seating, CSV import, all persisted in the browser (localStorage). No backend, no database, no login.

## Design Context

Editorial fine-stationery feel carried by the planner palette: rose/cream/gold/warm-gray, Playfair Display headings + Inter body. Calm, low-density, ornamental dividers, pill controls, warm shadows. Never generic SaaS, never the old blush/sage hues.

## Architecture

- **Frontend**: static-html
- **Backend**: none
- **Database**: none
- **Deployment**: render
- **Auth**: none

## Deployment

- Platform: render
- Dev server port: 3000
- Dev server command: `npx serve public -l 3000`
- Backend API URL: (discovered at runtime — Render adds random suffixes to URLs)
- Frontend URL: (discovered at runtime)

### Environment
- Shared env group: `general_builder_keys` (linked to all services via render.yaml `fromGroup`)
- Cross-service URLs: `API_URL` on frontend, `FRONTEND_URL` + `CORS_ORIGINS` on backend — declared in render.yaml as `sync: false`, set by infra-worker via Render API with actual `https://` URLs after discovering real service URLs
- render.yaml is the **complete, authoritative declaration** of all service configuration. Every env var, env group link, and runtime setting must be in render.yaml. If a worker adds a new env var dependency, it must update render.yaml.



### Development Workflow

Backend and database run on Render. Frontend runs locally during development for fast visual iteration, proxying API calls to the deployed backend. The orchestrator deploys backend code before starting frontend tasks, so the frontend always hits a real API with a real database.

## Operating Structure: The Brief Board

This project is developed through goal briefs on a Kanban board at `briefs/` (committed to git). **Folder location IS status** — the brief file is the card and it moves; nothing else does.

```
briefs/
  1-backlog/    scoped briefs, not started (any number)
  2-active/     being executed (WIP limit: exactly 1)
  3-blocked/    NEEDS HUMAN INTERVENTION — distinct terminal, NOT done
  4-done/       completed — every requirement verified
```

Key commands:

- `/spec create` — Interview → goal brief in `1-backlog/` + a ready-to-paste `/goal` prompt
- `/spec update {id}` — Modify a brief's requirements
- `/orchestrate` — Run the board one turn: select/resume a brief, delegate subtasks, route
- `/status` — Board diagnostic: where everything stands
- `/goal <generated prompt>` — Autonomous mode: keeps running turns until the brief reaches a terminal folder

### How It Works

1. Human creates a brief with `/spec create "description"` and pastes the generated `/goal` prompt (or runs `/orchestrate` manually per turn)
2. The runner moves the brief to `2-active/`, decomposes it into a Task Breakdown, and delegates each subtask to worker subagents (frontend-worker, backend-worker, infra-worker) via the Task tool
3. The brief itself carries all state: requirement checkboxes, Task Breakdown statuses, an append-only Progress Log (a Stop hook enforces per-turn updates), and Blockers
4. Human blockers are parked, not fatal: the runner records the question and keeps executing everything not downstream of it
5. Terminal routing is by requirement state — all boxes checked → `4-done/`; requirements remain with zero runnable subtasks → `3-blocked/` with a "NEEDS HUMAN INTERVENTION" announcement. Blocked and done are DIFFERENT outcomes; a blocked brief is never presented as complete
6. To resume a blocked brief: answer its `Resolution:` lines, then run `/orchestrate`
7. Machine state (trajectory logs for evals) lives in `session/{brief-id}/`, gitignored; `session/design-direction.md` is the shared design direction

### Single-Writer Rule

Only the main (runner) session edits briefs or moves them between folders. Worker subagents read the brief but never write it — they return structured reports and the runner records the results.

## Testing Policy

- **Local testing**: Use dev-browser for UI verification (`/verify-ui`)
- **Backend testing**: Workers write and run tests as part of task execution
- **User feedback**: The user reports back with results from deployment
