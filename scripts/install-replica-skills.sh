#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Run this script from inside the Git repository." >&2
  exit 1
}
cd "$ROOT"

UPSTREAM="https://github.com/Jakeschincariol/replica-skill.git"
SKILLS=(
  replica-recon
  replica-architect
  replica-design
  replica-build
  replica-backend
  replica-test
  replica-diff
  replica-entrepreneur
  replica-brand
  replica-launch
  replica-deploy
)

for skill in "${SKILLS[@]}"; do
  if [[ -e ".agents/skills/$skill" || -e ".github/skills/$skill" ]]; then
    echo "Refusing to overwrite an existing skill path: $skill" >&2
    echo "Review the existing files first; this installer is intentionally non-destructive." >&2
    exit 1
  fi
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git clone --depth 1 "$UPSTREAM" "$TMP/upstream" >/dev/null
UPSTREAM_COMMIT="$(git -C "$TMP/upstream" rev-parse HEAD)"

FOUND=0
mkdir -p "$TMP/stage/.agents/skills" "$TMP/stage/.github/skills"

for skill in "${SKILLS[@]}"; do
  SOURCE="$TMP/upstream/$skill"
  [[ -f "$SOURCE/SKILL.md" ]] || {
    echo "Upstream skill missing SKILL.md: $skill" >&2
    exit 1
  }

  for target in .agents/skills .github/skills; do
    mkdir -p "$TMP/stage/$target"
    cp -a "$SOURCE" "$TMP/stage/$target/$skill"
    python3 - "$TMP/stage/$target/$skill/SKILL.md" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding="utf-8")
directive = (
    "\n## Repository-specific operating constraints\n\n"
    "Before taking action, read and obey the repository-root file "
    "`REPLICA-PROJECT-GUARDRAILS.md`. If it conflicts with these generic "
    "instructions, the project guardrails and explicit user approvals take precedence.\n"
)
if "REPLICA-PROJECT-GUARDRAILS.md" not in text:
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end < 0:
            raise SystemExit(f"Invalid YAML frontmatter in {p}")
        insert_at = end + 5
        text = text[:insert_at] + directive + text[insert_at:]
    else:
        text = directive + text
    p.write_text(text, encoding="utf-8")
PY
  done
  FOUND=$((FOUND + 1))
done

[[ "$FOUND" -eq 11 ]] || {
  echo "Expected 11 skills, found $FOUND. No staged files were installed." >&2
  exit 1
}

cp "$TMP/upstream/LICENSE" "$TMP/stage/.agents/skills/REPLICA-UPSTREAM-LICENSE"
cp "$TMP/upstream/LICENSE" "$TMP/stage/.github/skills/REPLICA-UPSTREAM-LICENSE"

# Move only after every source skill has passed validation.
mkdir -p .agents/skills .github/skills
for skill in "${SKILLS[@]}"; do
  mv "$TMP/stage/.agents/skills/$skill" .agents/skills/
  mv "$TMP/stage/.github/skills/$skill" .github/skills/
done
mv "$TMP/stage/.agents/skills/REPLICA-UPSTREAM-LICENSE" .agents/skills/
mv "$TMP/stage/.github/skills/REPLICA-UPSTREAM-LICENSE" .github/skills/

cat > REPLICA-SKILLS-UPSTREAM.md <<EOF
# Replica skills — upstream provenance

- Source: $UPSTREAM
- Upstream commit installed: $UPSTREAM_COMMIT
- License: MIT (see REPLICA-UPSTREAM-LICENSE in each skills directory)
- Skills installed: 11
- Codex location: .agents/skills/
- GitHub Copilot location: .github/skills/
- The upstream skill instructions are retained; each SKILL.md includes a pointer to REPLICA-PROJECT-GUARDRAILS.md.

The installer does not modify application source code, dependencies, database schemas, environment variables, secrets, deployment settings, or production services.
EOF

for target in .agents/skills .github/skills; do
  COUNT="$(find "$target" -mindepth 2 -maxdepth 2 -name SKILL.md -type f | wc -l | tr -d ' ')"
  [[ "$COUNT" -eq 11 ]] || {
    echo "Validation failed: $target contains $COUNT SKILL.md files, expected 11." >&2
    exit 1
  }
done

echo "Replica installation staged successfully."
echo "Upstream commit: $UPSTREAM_COMMIT"
echo "Verified: 11 skills for Codex and 11 skills for GitHub Copilot."
echo "Review with: git status --short"
