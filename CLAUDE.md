# CLAUDE.md — piano_rebellion_apps (public repo)

This repo is PUBLIC and its gh-pages branch is the live studio app site.

## Names (LOCKED 2026-11-13, Derek, relaying a beta tester's request)
- Never put a student's or beta tester's name in a commit message, PR title or body, branch name, code comment, file name or app text.
- Credit feedback generically: "beta tester request", "student feedback".
- The only names allowed in app credits are the ones Derek approves (Derek Berg, Evan Dunn).
- **Check before you ask (LOCKED 2026-11-17, Derek, all repos):** before any question to Derek, buttons included, search this repo, the sibling repos, Notion, the connected mailbox and anything already in the chat; derive the answer when the data supports it and cite the source in one line. Ask only what no source answers. Source of truth: `dereks-dashboard` CLAUDE.md §HARD RULES (reference only).

## Changelog (LOCKED 2026-11-20, Derek)
- Every version bump adds an entry to `CHANGELOG.html` in the same commit (newest first, Added/Changed/Fixed, folder path).
- `CHANGELOG.html` is never linked from the hub or any page.

## Beta lane and app feedback (LOCKED 2026-11-20, Derek, button "Beta lane first")
- Student and Claude-scan requests live in Notion APP UPDATES (DB); the public Jotform feeds it; the daily Routine "Apps - Daily Feedback & Update Run" (7:41 PM CT) triages, builds and ships.
- Every auto-shipped change goes to the beta copy first: `python3 tools/make_beta.py <folder> <gh-pages worktree>` writes `<folder>-beta/index.html` on gh-pages (noindex, BETA ribbon, never linked). The next run promotes it to the live folder after 24 hours with no new errors and no Declined.
- main can hold a change that is still in beta. Before publishing any app folder from main to gh-pages by hand, check APP UPDATES rows with Status "Beta" for that app; publish only what is meant to go live.

