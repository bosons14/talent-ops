# Mode: outreach — draft a first message (draft only, never send)

## Inputs
`reports/profile-<id>.md` (run `profile` first if missing), `modes/_brief.md`, and the channel the recruiter will use (email to the *public* address on their profile, LinkedIn InMail, X DM…).

## Rules
- Check `data/pipeline.md`: never draft for `do-not-contact`.
- Reference **one specific piece of their work** you have actually read, in a sentence that shows you understood it. No generic praise ("I was impressed by your profile").
- Say who you are, who the role is for (or "a confidential client"), and why it fits *their* work, in 2–3 sentences.
- Say where you found them ("I came across your post on DEV about …").
- One clear, low-effort ask (a 20-minute call, or "would you like the JD?").
- Offer an easy opt-out ("If you'd rather not hear about roles, just say so and I won't follow up").
- Under 120 words for DMs, under 180 for email. No emojis, no false urgency, no flattery.
- Never mention anything personal, and never imply knowledge gained from outside their professional public work.

## Output
Give 2 variants (e.g. "direct" and "curious, lighter ask"). Then offer to record the contact: `node tracker.mjs set <id> contacted --note "<channel, date>"` once the recruiter has sent it.
