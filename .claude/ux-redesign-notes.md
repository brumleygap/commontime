# CommonTime UX Redesign — Working Notes

## Audience (decided)

Primary: **Small purposeful groups** — subcommittees, working groups, committees, neighborhood/volunteer organizations. Could be 4–10 people; most often 4–6.

Secondary: **Social/friends** scheduling dinners, movies, etc.

These groups are currently using **email threads or Slack** to coordinate. They've tried Doodle — the ads and clutter were a bad fit. CommonTime's clean design is the competitive advantage.

Anonymous voting is a legacy concern — not important for either audience. Do not invest in it.

---

## Voter Experience (decided)

### Vote states
- Replace Yes / Maybe / Busy tristate with **Yes / If needed / No**
- "If needed" = "I can make it work if this is the only time that works for everyone" — a preference expression, not uncertainty about availability
- Render as a **segmented pill** (single connected control, not three separate buttons) — better mobile tap targets

### Default state
- **No default** — the pill starts with nothing selected
- Unvoted slots submit as **"no response"** — shown as a gray dash in the availability grid
- Distinct from an explicit "No" — the organizer can tell the difference between "didn't answer this slot" and "said No"

### Anonymous voting
- Require **email at minimum** for anyone voting without an invite token or login
- Name remains optional
- No login wall — don't block voting, just require identity
- Anonymous (no email, no name) votes eliminated

---

## Organizer Experience (decided)

### Meeting duration
- Add **duration field** to the create form
- Default: **60 minutes**
- Options: 15, 30, 45, 60, 90, 120 min
- All time slots display as ranges throughout: "Mon Apr 27 · 2:00 – 3:00 PM"
- Duration used in calendar export (.ics)

### Invite
- Replace one-at-a-time invite form with **bulk email paste**
- Text area: paste emails one per line or comma-separated
- Names optional — grid shows email until person fills in name when voting
- Individual tracking tokens still generated per person behind the scenes
- Email is the primary invite channel (not share-sheet — audience uses email/Slack)

### Poll page layout
- Main scroll stays clean for everyone: poll header → voting form → results grid
- Organizer sees a **fixed bottom bar**: `Invite · Finalize · Cancel`
- Each button opens a **bottom drawer** (panel slides up from bottom)
- Participants never see the bottom bar
- Same URL for everyone (`/poll/[token]`)

### Post-create flow
- After creating a poll, land on a **"Your poll is ready — invite people"** screen
- Not on the poll page directly
- Primary action: bulk invite form
- Secondary: **share link** — behavior depends on device:
  - iPad/iPhone/mobile: native share sheet (`navigator.share()`) — opens iOS panel to share directly to Slack, Messages, Mail, etc.
  - Desktop: visible pre-selected URL field + "Copy" button that changes to "Copied ✓" for 2 seconds
  - Detection: one JS check (`navigator.share` available?) switches between the two
- Tertiary: "Go to poll →" — no warning if skipped, organizer may be sharing via Slack instead
- "Send invites" shows confirmation ("Invites sent to X people") then "Go to poll →"
- Same bulk invite form lives in the bottom drawer for adding people later

---

## Visual Design (decided)

### Glyphs
- **Musical note glyphs retired** (♩ ♪ ♫) — too domain-specific, don't carry over to committee context
- Replace with **centered dot `·`** for inline UI elements (slot bullets, section dividers, eyebrow labels)
- The CommonTime logo mark (calligraphic C with dot) is kept and is the musical reference

### Logo
- `public/commontime-logo.svg` — ink fill (`#0f0f0e`), transparent background — for light/cream backgrounds
- `public/commontime-logo-light.svg` — cream fill (`#f5f2ec`), transparent background — for dark/ink backgrounds
- Staff line background texture: **keep**

### Color palette
- **Ink** `#0f0f0e`, **Cream** `#f5f2ec`, **Staff** `#d4cfc6`, **Muted** `#5c5752` — unchanged, all good
- **Red** `#c8102e` — keep on cream backgrounds (CTAs, borders, accents)
- **Red on ink backgrounds** — REMOVE. Red text/borders on dark fail contrast (~2.5:1, need 4.5:1). Replace with cream for text and borders; red button fills with white text are fine.
- **Green** `#1a6b3a` — unchanged

### PWA Icons (done)
- `public/icon.png` (512×512) — mark on cream background (replaces black-on-black)
- `public/icon-192.png` (192×192) — same
- `public/icon-maskable.png` (512×512) — mark with safe-zone padding for OS masking
- `public/apple-touch-icon.png` (180×180) — mark on cream, fixes iPad black-on-black bug
- `public/manifest.json` — fixed: split "any maskable" into two entries, background_color → cream

---

### Vote deadline and reminders (decided)
- **Deadline**: optional field on the create form — "Respond by [date]"
  - Shows on the voting form: "The organiser needs responses by [date]"
  - Not a hard lock — voting stays open, it's informational/accountability
- **Reminders**: one-tap button in the bottom drawer — "Remind non-responders"
  - Sends a nudge email to all invitees who haven't voted yet
  - Manual only — organiser triggers it when they want, no scheduling

---

### Home dashboard (decided)
- **Heat map removed** — too much visual noise for groups of 4–6; not meaningful at that scale
- **Status rename**: "date set" → "confirmed" (or "confirmed dates" if multiple)
- **Pending respondents replace heat map** — show names of who hasn't responded yet, e.g. "Pending: David · Eve" — more actionable than a count for committees where everyone knows each other. Show "All responded ✓" when complete.
- Status badges: "open" · "confirmed" · "past" · "cancelled" (drop "date set")

---

### Admin experience (decided)
- **Now**: system stats (total polls, users, votes this week) + push notifications (already exists)
- **Later**: full polls list + user list (deferred)
- **Nav shell**: build sidebar navigation now (Overview · Polls · Users · Notifications) so sections can be added without restructuring
- **Test poll cleanup**: organizer can hard-delete their own polls with zero participants — no notification risk, natural self-serve cleanup. Shows as "Delete" alongside Cancel for polls with no responses yet. Admin hard-delete of any poll deferred to when the polls section is built.

---

## Implementation Priority

### Tier 1 — Visual polish (no schema changes, low risk)
1. PWA icons + manifest — **done**, uncommitted on `ux-redesign` branch
2. Red-on-ink → cream (CSS/template fixes throughout)
3. Musical note glyphs → centered dot `·` (template changes)
4. Status rename: "date set" → "confirmed" (template + DB value)
5. Home dashboard: remove heat map, add pending names

### Tier 2 — Voter experience (schema changes, affects all polls)
6. Vote state rename: Yes / If needed / No + segmented pill UI
7. No-default vote state + gray "no response" in grid
8. Email required for anonymous voters

### Tier 3 — Organizer workflow (schema changes + new routes)
9. Meeting duration field (create form + DB column + display everywhere + .ics)
10. Delete poll (organizer, zero-participant polls only)
11. Optional response deadline (create form + display on vote page)
12. Bottom drawer for organizer controls (poll page restructure)
13. Bulk email invite (replace one-at-a-time invite form)
14. Post-create flow (new screen + share sheet vs. URL field)
15. Remind non-responders button (bottom drawer)

### Tier 4 — Admin
16. Admin stats overview (total polls / users / votes this week)
17. Admin nav shell (sidebar: Overview · Polls · Users · Notifications)
