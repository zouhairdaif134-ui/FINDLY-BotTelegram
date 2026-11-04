# Replica Agent Skills installation

This branch prepares a non-destructive installer for the 11-skill Replica pack.

## Install

From the repository root in GitHub Codespaces or another Bash environment with Git and Python 3 installed:

```bash
bash scripts/install-replica-skills.sh
```

The script clones the MIT-licensed upstream repository, copies all 11 skill folders and their companion files into both supported project locations, adds a project-guardrails pointer to each SKILL.md, preserves the upstream MIT license, and records the exact upstream commit.

## Verify

The script verifies that both locations contain exactly 11 SKILL.md files. Then review:

```bash
git status --short
git diff --stat
```

The installer does not auto-commit, push, merge, install dependencies, run application code, or touch databases/secrets/deployments. Review the changes and commit them to this branch when satisfied.

## Agent compatibility

- Codex: `.agents/skills/`
- GitHub Copilot: `.github/skills/`

Skill discovery depends on the agent host and its settings. The upstream slash-command examples are Claude-oriented; in Codex/Copilot, ask the agent to use a named skill (for example, `replica-recon`) rather than assuming Claude slash commands exist.
