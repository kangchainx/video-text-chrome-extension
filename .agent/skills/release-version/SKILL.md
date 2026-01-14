---
name: Release Version
description: Complete workflow for releasing a new version of the Chrome extension, including version bumping, documentation updates, building, and publishing
---

# Release Version Skill

This skill provides a standardized workflow for releasing new versions of the Video Text Chrome Extension.

## Overview

This skill automates the complete release process:
1. Version number updates across all files
2. Documentation updates (README, product-details)
3. Build process
4. Git commits and tagging
5. Publishing to Chrome Web Store

---

## Prerequisites

Before running this skill, ensure:
- [ ] All code changes are committed
- [ ] You are on the correct feature branch
- [ ] All tests pass (if applicable)
- [ ] `npm install` completed successfully

---

## Input Required

You will need to provide:
1. **New version number** (e.g., `1.0.2`, `1.1.0`, `2.0.0`)
2. **Release date** (e.g., `2026-01-20`)
3. **Changelog content** with categorized changes:
   - ✨ New Features
   - 🚀 Performance Improvements
   - 💡 UX Enhancements  
   - 🐛 Bug Fixes

---

## Step-by-Step Workflow

### 1️⃣ Update Version Numbers

Update version in the following files:

**Files to modify:**
- `manifest.json` - Line 4: `"version": "X.X.X"`
- `package.json` - Line 3: `"version": "X.X.X"`

**Example:**
```json
"version": "1.0.2"
```

### 2️⃣ Update product-details.txt

**Location:** `/product-details.txt`

**Changes needed:**
1. Update current version line (Line 1)
2. Add new version changelog section after line 6

**Template:**
```
📌 当前版本：vX.X.X (YYYY-MM-DD)

【vX.X.X 更新内容】

✨ 新功能
• [Feature 1 description]
• [Feature 2 description]

🚀 性能优化
• [Performance improvement 1]
• [Performance improvement 2]

💡 体验改进
• [UX improvement 1]
• [UX improvement 2]

🐛 问题修复
• [Bug fix 1]
• [Bug fix 2]

【v1.0.1 更新内容】
...
```

### 3️⃣ Update README.md Version History

**Files to modify:**
- `README.md` (English)
- `README.zh-CN.md` (Chinese)

**Location:** Find the "Version History" / "版本历史" section

**Add new version entry at the top:**

**Chinese (README.zh-CN.md):**
```markdown
### vX.X.X (YYYY-MM-DD)

**✨ 新功能**
- [Feature description]

**🚀 性能优化**
- [Performance improvement]

**💡 用户体验改进**
- [UX improvement]

**🐛 问题修复**
- [Bug fix]
```

**English (README.md):**
```markdown
### vX.X.X (YYYY-MM-DD)

**✨ New Features**
- [Feature description]

**🚀 Performance Improvements**
- [Performance improvement]

**💡 UX Enhancements**
- [UX improvement]

**🐛 Bug Fixes**
- [Bug fix]
```

### 4️⃣ Build the Extension

Run the build command:

```bash
npm run build
```

**Expected output:**
- ✅ TypeScript compilation successful
- ✅ Vite build completed
- ✅ Files generated in `dist/` directory

**Verify dist/ contains:**
- `manifest.json` (with correct version)
- `assets/`
- `*.html` files
- `service-worker-loader.js`

### 5️⃣ Create Release Package

Create a zip file for Chrome Web Store:

```bash
cd dist && zip -r ../video-text-chrome-extension-vX.X.X.zip . -x "*.DS_Store" -x "__MACOSX" -x ".vite/*"
```

**Verify:**
- Zip file created in project root
- Size is reasonable (typically 2-3 MB)

### 6️⃣ Git Commits

Create organized commits for better history:

**Commit 1: Version bump**
```bash
git add manifest.json package.json
git commit -m "chore: bump version to X.X.X"
```

**Commit 2: Documentation updates**
```bash
git add product-details.txt README.md README.zh-CN.md
git commit -m "docs: update version history and product details for vX.X.X

- Add vX.X.X changelog to README
- Update product-details.txt with latest changes
- Document new features and improvements"
```

### 7️⃣ Create Git Tag (Optional but Recommended)

```bash
git tag -a vX.X.X -m "Release version X.X.X

[Copy changelog summary here]"
```

### 8️⃣ Push to Remote

Push commits and tags:

```bash
git push origin <branch-name>
git push origin vX.X.X  # If you created a tag
```

### 9️⃣ Upload to Chrome Web Store

**Manual Steps:**

1. **Navigate to Developer Dashboard**
   - Go to: https://chrome.google.com/webstore/devconsole
   - Sign in with your developer account

2. **Select Extension**
   - Click on "视频转文字助手"

3. **Upload New Package**
   - Go to "Package" tab
   - Click "Upload new package"
   - Select `video-text-chrome-extension-vX.X.X.zip`

4. **Fill Update Information**
   
   **What's new in this version?** (Chinese):
   ```
   打开 product-details.txt
   复制 "【vX.X.X 更新内容】" 部分
   粘贴到此字段
   ```

5. **Submit for Review**
   - Review all information
   - Click "Submit for review"
   - Wait for approval (typically 1-3 days)

---

## 🔟 Create GitHub Release (Optional)

**Steps:**

1. Go to: https://github.com/kangchainx/video-text-chrome-extension/releases/new

2. **Fill in details:**
   - **Tag:** vX.X.X (should already exist if you created it)
   - **Title:** `Release vX.X.X - [Brief Description]`
   - **Description:** Copy from README version history

3. **Attach Files:**
   - Upload `video-text-chrome-extension-vX.X.X.zip`

4. **Publish Release**

---

## ✅ Post-Release Checklist

After successful release:

- [ ] Chrome Web Store package submitted
- [ ] Git commits pushed to remote
- [ ] Git tag created and pushed
- [ ] GitHub Release created (if applicable)
- [ ] PR merged to main branch (if working on feature branch)
- [ ] Delete feature branch (if applicable)
- [ ] Announce update to users (social media, Discord, etc.)

---

## 📝 Example Full Execution

```bash
# 1. Update version numbers in manifest.json and package.json manually

# 2. Update product-details.txt manually

# 3. Update README files manually

# 4. Build
npm run build

# 5. Create zip
cd dist && zip -r ../video-text-chrome-extension-v1.0.2.zip . -x "*.DS_Store" -x "__MACOSX" -x ".vite/*" && cd ..

# 6. Commit version bump
git add manifest.json package.json
git commit -m "chore: bump version to 1.0.2"

# 7. Commit documentation
git add product-details.txt README.md README.zh-CN.md
git commit -m "docs: update version history and product details for v1.0.2"

# 8. Create tag
git tag -a v1.0.2 -m "Release version 1.0.2"

# 9. Push everything
git push origin feature/my-new-feature
git push origin v1.0.2

# 10. Upload to Chrome Web Store manually
```

---

## 🚨 Common Issues

### Issue: Build fails with TypeScript errors
**Solution:** Fix TypeScript errors before building

### Issue: Zip file too large (>5MB)
**Solution:** Check for unnecessary files in dist/. The .vite folder should be excluded.

### Issue: Version mismatch after upload
**Solution:** Ensure manifest.json in the zip has the correct version

### Issue: Chrome Web Store rejects package
**Solution:** Review rejection email for specific issues. Common causes:
- Missing permissions justification
- Privacy policy not updated
- Manifest format issues

---

## 📚 Related Files

- `manifest.json` - Extension manifest with version
- `package.json` - NPM package configuration  
- `product-details.txt` - Chrome Web Store product description
- `README.md` - English documentation
- `README.zh-CN.md` - Chinese documentation
- `.agent/workflows/` - Related workflows

---

## 💡 Tips

1. **Semantic Versioning**: Follow semver (MAJOR.MINOR.PATCH)
   - MAJOR: Breaking changes
   - MINOR: New features (backward compatible)
   - PATCH: Bug fixes

2. **Changelog Quality**: Be specific and user-focused in changelogs

3. **Testing**: Always test the built extension locally before uploading

4. **Timing**: Submit during weekdays for faster review

5. **Backup**: Keep a copy of the zip file for records

---

## 🔄 Automation Potential

Future improvements could include:
- Automated version bumping script
- Automated changelog generation from commits
- CI/CD pipeline for building and testing
- Automated Chrome Web Store upload (via API)
