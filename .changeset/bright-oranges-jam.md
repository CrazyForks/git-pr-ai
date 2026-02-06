---
'git-pr-ai': patch
---

Replace Prettier with Oxfmt for repository formatting.

- Switch `format` and `format:check` scripts to `oxfmt`.
- Update `lint-staged` formatting commands to use `oxfmt --write`.
- Remove Prettier config/dependencies and add `.oxfmtrc.json`.
