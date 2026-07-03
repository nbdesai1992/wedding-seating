# Evidence — Wedding Seating Planner

**Live URL:** https://wedding-seating-ymzs.onrender.com
**Deployed commit (verified live):** `5d1fbe7ba5154121f0f44674bb30a878138b611c` — status `live`

## Render resources
| Resource | Name | ID | Plan |
|---|---|---|---|
| Web service | wedding-seating | `srv-d93lov4vikkc73aidj00` | free (Node, oregon) |
| Postgres | wedding-seating-db | `dpg-d93loha8qa3s73avmrug-a` | basic_256mb (oregon, pg16) |

DATABASE_URL wired at service-create from the DB internal connection string (same region). Migrations run at startup via `src/migrate.js` (numbered SQL + `schema_migrations`).

## Acceptance criteria — verified on the LIVE URL
| # | Criterion | Result |
|---|---|---|
| health | `GET /healthz` | `{"ok":true}` ✓ |
| AC1 | List/create events; persist & visible | Created "Emma & James"; appears in `/api/events` ✓ |
| AC2 | Add round/long tables; drag to reposition; persists | table1 moved to (275,330), seats + position survive reload ✓ |
| AC3 | Import guests via CSV (multipart) | 4 guests imported; quoted-comma name `"Curie, Marie"` parsed; land unassigned ✓ |
| AC4 | Assign / reassign / unassign; persists | Assigned, seat-collision displaced occupant, unassign survived reload ✓ |
| AC5 | Export CSV of assignments | `emma-james-seating.csv`, `text/csv`; Marie→Table 1 seat 2, others Unassigned; quoted name escaped ✓ |
| AC6 | Automated e2e test | `npm test` green (create→tables→import→assign→export over pg-mem) ✓ |
| AC7 | Elegant styled UI | Cormorant serif + blush/ivory/sage; `/styles.css` + `/app.js` served ✓ |

## Live export sample
```
Guest,Email,Table,Seat,Notes
"Curie, Marie",marie@x.com,Table 1,2,
Ada Lovelace,ada@x.com,Unassigned,,
Alan Turing,alan@x.com,Unassigned,,
Grace Hopper,grace@x.com,Unassigned,,
```

## Teardown
`~/.claude/skills/render-cli/scripts/render_teardown.sh --manifest .ship/resources.json --confirm`
