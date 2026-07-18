# Blueprint: Keyboard Shortcuts — Complete Reference
**Document:** BP-19  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Design Principles

1. **Global shortcuts override page shortcuts.** `⌘K`, `⌘/`, `⌘.` work everywhere, always.
2. **Single keys are page-scoped.** `A`, `R`, `D`, `E` only fire when focus is not in a text input.
3. **Escape is layered.** `Escape` dismisses from innermost context outward (toast → panel → modal → palette → page deselect).
4. **No shortcut requires three modifier keys.** All shortcuts use at most two: `⌘` + one key.
5. **Shortcuts are discoverable.** Hovering any interactive element with a shortcut shows the key in a tooltip.

---

## Global Shortcuts (Active on All Pages)

| Shortcut | Action | Notes |
|---|---|---|
| `⌘K` | Open CommandPalette | Always. Cannot be suppressed. |
| `⌘/` | Focus StickyCommandCenter | Always (except `/council`). |
| `⌘Enter` | Submit focused form / input | Context-sensitive. |
| `⌘.` | Cancel in-progress AI request | Cancels SSE stream + Brain/Council call. |
| `Escape` | Dismiss innermost context | See Escape chain below. |
| `?` (shift+/) | Open keyboard shortcut reference | Opens modal with this document's shortcuts. |

---

## Escape Chain (Priority Order)

When `Escape` is pressed, the first condition that matches wins:

1. Toast visible → dismiss toast
2. Modal open (invite, confirm, detail) → close modal
3. CommandPalette open → close CommandPalette
4. Side panel open (EventDetail, CustomerDetail, PersonDetail) → close panel
5. Evidence panel expanded → collapse evidence panel
6. Input focused → blur input
7. Item selected in a list → deselect item
8. Nothing above → no-op

---

## Navigation Shortcuts (Within CommandPalette)

| Key | Action |
|---|---|
| `⌘K` | Open palette |
| `↓` / `↑` | Navigate results |
| `Enter` | Execute focused item |
| `Escape` | Close palette |
| `Tab` | No action (focus stays in palette) |

---

## Page: Home (`/`)

| Key | Action | Condition |
|---|---|---|
| `↓` / `↑` | Navigate between NOW cards | Focus not in input |
| `Enter` | Expand focused card options | Card focused |
| `Space` | Execute primary action on focused card | Card focused, not confirming |
| `E` | Expand/collapse evidence panel | Card focused |
| `D` | Dismiss focused card | Card focused |
| `1`–`5` | Focus NOW card by position | Focus not in input |

---

## Page: Inbox (`/inbox`)

| Key | Action | Condition |
|---|---|---|
| `↓` / `↑` | Navigate inbox items | |
| `Enter` | Open selected item detail | |
| `A` | Approve (approval items only) | Item focused, type=approval |
| `R` | Reject (approval items only) | Item focused, type=approval |
| `E` | Archive / mark as read | Item focused |
| `M` | Mark unread | Item focused |
| `Escape` | Close detail panel | Panel open |

---

## Page: Engineering (`/projects`)

| Key | Action | Condition |
|---|---|---|
| `↓` / `↑` | Navigate PR list | |
| `Enter` | Open PR DecisionSlideOver | PR focused |
| `M` | Open merge modal | PR focused, merge-ready |
| `[1]`–`[5]` | Switch repo tab | |
| `Escape` | Close DecisionSlideOver | Slide-over open |

---

## Page: Meetings (`/meetings`)

| Key | Action | Condition |
|---|---|---|
| `↓` / `↑` | Navigate meeting list | |
| `Enter` | Open meeting detail | |
| `P` | Go to meeting prep (`/prep`) | Meeting focused |
| `L` | Go to live meeting (`/live`) | Meeting focused |
| `Escape` | Back to list (from sub-page) | On sub-page |

Sub-page `/live`:
| Key | Action |
|---|---|
| `N` | Focus notes textarea |
| `Escape` | Blur notes textarea |

---

## Page: Knowledge (`/knowledge`)

| Key | Action | Condition |
|---|---|---|
| `⌘F` | Focus entity search | |
| `↓` / `↑` | Navigate entity list | |
| `Enter` | Select entity, load graph | |
| `⌘Enter` | Open `/entity/:id` for selected entity | Entity selected |
| `Escape` | Clear selection; clear search | |
| `+` | Zoom in on graph | Graph visible |
| `-` | Zoom out on graph | Graph visible |
| `0` | Reset graph zoom to fit | Graph visible |

---

## Page: Chief of Staff (`/chief`)

| Key | Action | Condition |
|---|---|---|
| `↓` / `↑` | Navigate cards (NOW, then NEXT) | |
| `Enter` | Expand card / open multi-option dropdown | Card focused |
| `Space` | Execute primary action | Card focused, default state |
| `E` | Expand/collapse evidence panel | Card focused |
| `D` | Dismiss card | Card focused |
| `N` | Expand/collapse NEXT section | |
| `Escape` | Deselect card; collapse if expanded | |

---

## Page: Weekly Review (`/review`)

| Key | Action |
|---|---|
| `↓` / `↑` | Navigate sections |
| `E` | Expand/collapse focused section |
| `⌘P` | Print / export review |

---

## Page: People (`/people`)

| Key | Action | Condition |
|---|---|---|
| `⌘F` | Focus search input | |
| `↓` / `↑` | Navigate people list | |
| `Enter` | Open PersonDetailPanel | Person focused |
| `S` | Run departure simulation | Person focused |
| `Escape` | Close PersonDetailPanel | Panel open |

---

## Page: Customers (`/customers`)

| Key | Action | Condition |
|---|---|---|
| `⌘F` | Focus search | |
| `↓` / `↑` | Navigate health grid | |
| `Enter` | Open CustomerDetailPanel | Customer focused |
| `S` | Run churn simulation | Customer focused |
| `Escape` | Close CustomerDetailPanel | Panel open |

---

## Page: Executive Council (`/council`)

| Key | Action | Condition |
|---|---|---|
| `⌘Enter` | Submit question in AskCouncilInput | Input focused |
| `Escape` | Clear AskCouncilInput or close debate panel | |
| `⌘.` | Cancel in-progress Council analysis | Analysis running |
| `↓` / `↑` | Navigate agent response cards | Debate panel open |
| `E` | Expand evidence on focused agent card | Card focused |
| `1`–`6` | Focus agent health card by position | |

---

## Page: Activity (`/activity`)

| Key | Action | Condition |
|---|---|---|
| `F` | Toggle filter bar focus | |
| `R` | Toggle Replay mode | |
| `↓` / `↑` | Navigate events | |
| `Enter` | Open EventDetailPanel | Event focused |
| `Escape` | Close EventDetailPanel | Panel open |
| `Space` | Play/pause | Replay mode |
| `←` | Step backward one event | Replay mode |
| `→` | Step forward one event | Replay mode |
| `1` | Set replay speed to 1× | Replay mode |
| `2` | Set replay speed to 2× | Replay mode |
| `5` | Set replay speed to 5× | Replay mode |

---

## Trust Center (`/integrations`)

| Key | Action | Condition |
|---|---|---|
| `⌘F` | Focus resource search | |
| `↓` / `↑` | Navigate resource rows | |
| `Space` | Toggle focused resource allow/hide | Resource focused |
| `D` | Trigger discovery for focused connector | Connector header focused |
| `A` | Allow all (with confirmation) | Connector header focused |
| `H` | Hide all (with confirmation) | Connector header focused |
| `Escape` | Close audit log panel | Panel open |

---

## Settings (`/settings/*`)

| Key | Action |
|---|---|
| `1`–`6` | Jump to settings sub-page by position |
| `⌘F` | Focus search/filter on current sub-page |
| `↓` / `↑` | Navigate list |
| `Enter` | Open detail panel or modal |
| `Escape` | Close modal or panel |

---

## Onboarding (`/welcome`)

| Key | Action |
|---|---|
| `→` or `Enter` | Continue to next step |
| `←` | Back to previous step |
| `Escape` | Skip confirmation dialog |

---

## Shortcut Reference Modal (`?`)

Pressing `?` on any page opens a shortcut reference modal:

```
┌────────────────────────────────────────────────────┐
│  Keyboard Shortcuts                          [✕]   │
├────────────────────────────────────────────────────┤
│                                                    │
│  GLOBAL                                            │
│  ⌘K    Open Command Palette                        │
│  ⌘/    Focus Command Center                        │
│  ⌘.    Cancel AI request                           │
│  ?     This reference                              │
│                                                    │
│  THIS PAGE: CHIEF OF STAFF                         │
│  ↓/↑   Navigate cards                             │
│  Space Execute primary action                      │
│  E     Expand evidence                             │
│  D     Dismiss card                                │
│  N     Toggle NEXT section                         │
│                                                    │
│  NAVIGATION                                        │
│  ↓/↑   Navigate results                           │
│  Enter Execute / open                              │
│  Esc   Close / dismiss                             │
│                                                    │
└────────────────────────────────────────────────────┘
```

Modal always shows global shortcuts + the current page's shortcuts.

---

## Conflict Resolution

| Shortcut | Global Owner | Page Override Allowed? |
|---|---|---|
| `⌘K` | CommandPalette | No |
| `⌘/` | StickyCommandCenter | No |
| `⌘.` | Cancel AI | No |
| `Escape` | Layered dismiss | No (chain is fixed) |
| `Enter` | Submit | Yes (text inputs own Enter) |
| `Space` | Execute card | Yes (text inputs own Space) |
| Single letters (`A`, `D`, `E`, etc.) | Page-scoped | N/A — only fire when focus not in input |

**Rule:** Single-letter shortcuts MUST check:
```js
if (document.activeElement.tagName === 'INPUT' || 
    document.activeElement.tagName === 'TEXTAREA' ||
    document.activeElement.isContentEditable) {
  return; // let the character type normally
}
```

---

## Accessibility Notes

- All keyboard shortcuts are **supplementary** — every action reachable by keyboard shortcuts is also reachable by mouse/touch.
- Shortcuts are announced in `aria-keyshortcuts` attributes on relevant elements:
  ```html
  <button aria-keyshortcuts="Space">Execute</button>
  ```
- The shortcut reference modal (`?`) is discoverable via the `[?]` button in the PageHeader.
- Screen readers should announce that shortcuts are available via the `aria-keyshortcuts` attribute.

---

## Acceptance Criteria

- [ ] `⌘K` opens CommandPalette from any page and any focus state.
- [ ] `⌘/` focuses StickyCommandCenter from any page (except `/council`).
- [ ] `⌘.` cancels any in-progress AI request (SSE stream drops).
- [ ] `Escape` chain is correct in order; each level dismisses without bubbling past.
- [ ] Single-letter shortcuts do not fire when focus is in an input or textarea.
- [ ] `?` opens the shortcut reference modal with global + current-page shortcuts.
- [ ] All per-page shortcuts documented work on their respective pages.
- [ ] Replay mode shortcuts (`Space`, `←`, `→`, `1`, `2`, `5`) only active in Replay mode.
- [ ] `aria-keyshortcuts` attribute is set on elements with keyboard shortcuts.
