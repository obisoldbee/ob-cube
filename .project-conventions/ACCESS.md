# Worktree-first collaboration

Task: complete the authorized work without a persistent project-wide admission claim. Existing AGENTS may adopt this workflow without installing a helper. Where an initialized helper governs ordinary work, keep its managed AGENTS block and project.json consistent with `worktree-first`; migrate them together as described below. Explicit runtime-only legacy dependencies are scoped separately. Updating the global Skill does not rewrite project copies.

## Choose the actual output

| Work | Execution |
|---|---|
| Read-only review | Read directly; use a fixed commit or recheck changed inputs. No status/enter/finish and no runtime writes. |
| New independent report | Choose one exact unique filename or task-owned output directory. Create with no-clobber semantics. Two reports may share a parent folder. |
| Code or existing tracked-file changes | One task branch and linked worktree per concurrent writer. Integrate commits afterward. |
| Existing non-Git shared document | One agreed editor; others produce separate proposed changes. Keep canonical input unchanged until that editor integrates. |
| Merge, shared index/config or canonical records | One integrator for that short operation; check current content and preserve other changes. Other independent worktrees continue working. |

Inputs are the user request, current AGENTS.md, actual repository mapping, current Git/disk state, and exact output scope. A different chat does not isolate files. No helper receipt is required for ordinary work under this policy. Old claim rows, their age, or a copied SQLite database are not blockers and do not require recovery. Preserve them as historical data; this does not prove any old process stopped.

## Code workflow

1. Resolve the real Repository Root (a wrapper or `src/` directory is not automatically Git). Inspect `git status --short`, current branch/HEAD and `git worktree list --porcelain`. Pick an existing base commit appropriate to the task, a unique new branch and an absent destination outside another task's worktree. State these bindings before creating it. Use the host's already allocated task worktree if suitable; do not create a nested worktree unnecessarily.
2. Authorized code work includes ordinary local worktree setup. Run `git -C <repo> worktree add -b <task-branch> <task-worktree> <base-commit>`. Pass paths as separate arguments and quote them in a shell. Do not use `--force`, reset another branch, stash another task's work, or require a claim first. This is a linked worktree, not another clone; collection rules prohibiting duplicate clones remain applicable. Distribution maintenance that explicitly requires the one canonical checkout may use a single editor there; do not broaden that exception to concurrent writers.
3. A worktree contains committed files from the selected base. Dirty/untracked material from the original checkout is not automatically included. Preserve it; if needed, identify exact authorized files and transfer a reviewed patch/input copy into the task worktree, or wait for the relevant committed baseline. Never silently treat missing uncommitted inputs as an empty requirement.
4. Read the worktree's rules. Edit/test only the task scope. Keep build outputs, ports, services and databases separate. Worktrees share Git objects/refs/config; avoid unrelated Git maintenance. Large builds may use one dedicated builder against a stable integrated revision, with its own output directory.
5. Commit only the task's changes when authorized. One integrator reviews the diff and validation, checks a clean intended destination or uses a fresh integration worktree, then merges/cherry-picks the exact commits. Resolve real merge conflicts without overwriting peer work, and run affected integration checks. Push/publication follows the user's existing scope; worktree creation does not itself grant publication.
6. Report branch, worktree, base and resulting commit, tests and integration state. After integration and confirmation that no process uses the clean worktree, remove it only within cleanup authority using `git worktree remove <path>` without force. Do not automatically delete its branch or prune other worktrees.

If the branch/path exists, inspect it or choose a new task-specific name. Git errors such as an actual index lock, merge in progress, unavailable disk or missing repository must be diagnosed at that resource. Never delete Git lock files or clear a claim just to bypass an error. `git worktree lock` protects worktree metadata from pruning; it is not an Agent edit lock.

## Reports and records

Use the exact output name the user supplies; if none is supplied, choose a task-specific filename. Use exclusive creation (`open(path, 'x')` or equivalent); an existing file means inspect it or select another authorized name. A hash check before overwriting is not an atomic guarantee. Concurrent changes to the same tracked file belong in separate worktrees; for non-Git files use one integrator.

Agents write separate task records. The integrator updates shared daily logs/indexes and assigns canonical sequence numbers during integration. Do not make every worker rewrite the same daily file or reserve all of conversation/. If the project requires a numbered canonical record immediately, one editor allocates it while others keep their own drafts. Response-only work creates no records.

## Guidance maintenance and execution dependencies

An explicit request to upgrade a workspace's existing AGENTS/guidance selects governance maintenance for that bounded workspace. Inventory current entry points and routed operational guides, preserve project-specific rules, and update stale generated templates along with the authorized existing copies. Updating only the Skill does not migrate copies. Do not initialize missing helpers, rewrite historical evidence, modify third-party upstream instructions, or retarget consumer links as a side effect.

Before changing an adopted helper policy, inspect local callers. A command supervisor or an apply authorization API may require legacy token checks or actual child execution. The worktree-first compatibility helper returns `not_required` without executing commands. Preserve a narrowly documented runtime-only legacy exception until its caller is migrated and behavior-tested; ordinary reads, reports and code maintenance need no such capability. Keep AGENTS, ACCESS and project.json digests consistent. Report retained execution dependencies explicitly instead of claiming full helper migration.

## Existing projects and copied disks

When the user authorizes switching a named project to this policy, use the current package's `scripts/migrate_worktree_policy.py <project-root> --apply`. It computes and checks the four-file change, keeps backups, and replaces only the managed AGENTS block, ACCESS.md, helper and configuration. Calling it without `--apply` only displays the plan. An already authorized policy migration does not need another permission round for its internal plan or old claim recovery.

The migration uses a short OS-held lock only for the governance-file replacement; process exit releases it. It never enters or clears the legacy claim registry. In a shared directory coordinate that short replacement with the actual editor of those governance files. Existing running Agents must reload the new AGENTS/ACCESS policy before editing shared files. Independently allocated worktrees remain the preferred safe continuation.

Copying a directory or attaching an external disk does not prove it is a linked worktree. Verify Git root/common-directory mappings locally; do not dereference stale foreign-machine pointers or contact the source machine merely to clear a copied claim. Keep copied runtime metadata out of source-control/export inputs. A complete independent clone or copied project uses its own working files; migration preserves the copied database without allowing it to gate work. If the original and copy are actually aliases to the same files, treat them as one workspace.

Completion: the authorized output is validated and its integration state is explicit. No claim token or recovery receipt is part of completion. Legacy claim tooling remains only for projects explicitly retaining `legacy-claims`; do not mix its rules into this workflow.

Git behavior reference: [official git-worktree documentation](https://git-scm.com/docs/git-worktree).
