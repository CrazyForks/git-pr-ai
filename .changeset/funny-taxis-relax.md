---
'git-pr-ai': patch
---

Fix `open-pr --no-web` on GitHub by providing an explicit empty PR body in non-interactive mode.

Optimize `open-pr` flow by checking for an existing PR before fetching branch/JIRA metadata, so existing PRs open immediately without unnecessary JIRA requests.
