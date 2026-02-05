# yt-dlp Version Lag SOP

This SOP is used when the bundled `yt-dlp` version is behind and a new release is needed.

## Scope
- Trigger: local `/health` shows older `ytdlp_version`.
- Goal: publish a new release so CI builds package the latest `yt-dlp`.

## Steps
1. Update changelog entries in both files:
   - `README.md`
   - `README.zh-CN.md` (equivalent to `README_zh.md`)
2. Create a new branch for this release prep.
3. Commit the changelog changes.
4. Push the branch to remote.
5. Open PR and request review.
6. After PR approval and merge, publish a new tag (use your target version, e.g. `vX.Y.Z`).
7. Wait for GitHub Actions release workflows to finish (macOS / Windows / extension).

## Suggested Commands
```bash
# set target version/tag first
RELEASE_TAG="vX.Y.Z"
RELEASE_NAME="${RELEASE_TAG#v}"
BRANCH_NAME="codex/release-${RELEASE_NAME}"

# 1) create branch
git checkout -b "${BRANCH_NAME}"

# 2) commit changelog updates
git add README.md README.zh-CN.md
git commit -m "docs: add ${RELEASE_TAG} release notes"

# 3) push branch and open PR
git push -u origin "${BRANCH_NAME}"

# 4) after PR merge, create and push tag
git checkout main
git pull --ff-only
git tag "${RELEASE_TAG}"
git push origin "${RELEASE_TAG}"
```

## After Tag Release (User Action)
- After publishing the new tag, users need to reinstall/upgrade the local native service to get the new bundled `yt-dlp`.
- The sidepanel should show an update prompt with installation guidance.
- After reinstall is complete, retry the failed video task and confirm the issue is resolved.
