---
'git-pr-ai': patch
---

Fix GitHub fork workflow PR discovery for shared PR commands.

- Resolve current-branch PR by searching upstream first (then current repo) when working in a fork.
- Use explicit repository context when resolving PR details from URL/number to avoid wrong-repo lookups.
- Update `git update-pr-desc` GitHub instructions to use `gh pr edit <number> --repo <owner>/<repo> --body-file description.md`.
