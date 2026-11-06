# Replica Skill integration

- Upstream: https://github.com/Jakeschincariol/replica-skill
- License: MIT; original LICENSE is preserved alongside this note.
- Imported: 2026-11-04 from the upstream `main` branch.
- The 11 upstream skills and their helper files are vendored unchanged in both `.agents/skills/` (Codex) and `.github/skills/` (GitHub Copilot).
- Codex can invoke a skill explicitly as `$replica-recon` (replace with another skill name). Copilot can select skills based on each `SKILL.md` description.

## Project safety overlay

The upstream pack was written primarily for Claude. Its `SKILL.md` files use the portable Agent Skills format, but some examples mention Claude slash commands and generic stack defaults. Adapt those examples to the active agent and the actual repository; do not blindly replace the existing stack or architecture.

For these existing projects, inspect before editing. Work on a feature branch, preserve each project's existing database and deployment boundaries, and do not run migrations, change production configuration or secrets, deploy, merge to `main`, or overwrite user data without explicit approval. Use only official APIs and authorized public/user-provided material. Keep each repository isolated.
