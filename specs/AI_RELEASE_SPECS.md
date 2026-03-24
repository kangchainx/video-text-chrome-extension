# AI Release And Changelog Specs

This file constrains AI-generated edits related to releases, changelogs, packaging docs, and version metadata in this repository.

## Scope

These rules apply whenever an AI edits any of the following:

- `README.md`
- `README.zh-CN.md`
- `.github/workflows/release-*.yml`
- `README_ytdlp_SOP.md`
- `native-host/build-macos-zip.sh`
- `native-host/install_*.sh`
- update-checking code or release-note parsing logic

## Hard Rules

1. Do not manually add `Component Versions:` sections to README changelog entries.
   Reason: GitHub Actions appends this section to the GitHub Release body at release time.

2. When updating changelog entries in README files, only add the human-written release notes for that version.
   Do not duplicate content that is generated automatically by workflows.

3. Before editing release-related docs, inspect the active release workflows under `.github/workflows/`.
   Do not assume README and GitHub Release body are generated the same way.

4. If a workflow already derives release content from README, preserve that contract.
   Update README structure only in ways that remain compatible with the extraction regex.

5. Do not claim a component is bundled locally unless the local build script and the CI release workflow both support it.
   If they differ, either align them or document the difference explicitly.

6. If `yt-dlp` is intentionally not pinned in `requirements.txt`, local build instructions and build scripts must explicitly install or upgrade it.
   Local build behavior should match CI expectations.

7. Do not infer release component versions from README text.
   Read them from workflow logic, build commands, or actual installed package versions.

## Release Notes Rules

1. Add new release notes to both:
   - `README.md`
   - `README.zh-CN.md`

2. Keep the English and Chinese entries semantically aligned.

3. Release notes must be concise and grouped by meaningful themes such as:
   - bug fixes
   - packaging
   - update flow
   - documentation

4. Do not insert generated metadata into changelog sections, including:
   - `Component Versions:`
   - CI-only artifact names
   - auto-generated asset lists

## Verification Checklist

Before finalizing release-related edits, AI should verify:

- the relevant release workflow actually matches the documented behavior
- README version-history format still matches workflow extraction logic
- local packaging docs do not contradict build scripts
- update-checking logic matches the release-note format it parses

## Preferred Behavior When Unsure

If there is any ambiguity about how release notes or component versions are produced:

- inspect the workflow first
- prefer the workflow as source of truth
- avoid writing generated metadata into README
