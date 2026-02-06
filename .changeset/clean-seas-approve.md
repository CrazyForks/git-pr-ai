---
'git-pr-ai': patch
---

Standardize `git create-branch` diff mode flag to `--diff`.

- Make `--diff` the primary option for diff-based branch naming in `git create-branch`.
- Keep `--git-diff` as a legacy alias for backward compatibility.
- Update command examples and usage docs to prefer `--diff`.
