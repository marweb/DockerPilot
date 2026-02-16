# DockPilot Release Guide

This document describes the complete process for creating and publishing releases of DockPilot, including the CI/CD pipeline, versioning, and troubleshooting.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Versioning](#versioning)
- [Creating a Release](#creating-a-release)
- [Verifying the Release](#verifying-the-release)
- [Making Images Public](#making-images-public)
- [Hotfix / Patch Releases](#hotfix--patch-releases)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before creating your first release, ensure:

1. **GitHub Actions enabled** - Your repository has Actions enabled (Settings > Actions > General)
2. **Packages enabled** - GitHub Packages (ghcr.io) is available for your account
3. **Correct permissions** - The workflow uses `GITHUB_TOKEN` with `contents: write` and `packages: write`
4. **Default branch** - The `update-versions` job pushes to `main` or `master`; ensure your default branch matches

---

## Versioning

DockPilot uses [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH):

- **MAJOR** (e.g., 1.0.0 → 2.0.0): Breaking changes, incompatible API changes
- **MINOR** (e.g., 1.0.0 → 1.1.0): New features, backward compatible
- **PATCH** (e.g., 1.0.0 → 1.0.1): Bug fixes, backward compatible

Examples:

- `1.0.0` - Initial release
- `1.1.0` - New tunnel feature
- `1.0.1` - Security fix

---

## Creating a Release

### Step 1: Ensure main is up to date

```bash
git checkout main
git pull origin main
```

### Step 2: Create a tag

```bash
# Replace 1.0.0 with your version
git tag v1.0.0
```

### Step 3: Push the tag

```bash
git push origin v1.0.0
```

**That's it.** Pushing the tag triggers the GitHub Actions workflow:

1. **build-and-push** - Builds 4 Docker images (api-gateway, docker-control, tunnel-control, web) for AMD64 and ARM64, pushes to ghcr.io
2. **update-versions** - Updates `scripts/versions.json` and commits to main
3. **create-release** - Creates a GitHub Release with the version and installation instructions

### Step 4: Monitor the workflow

Go to [https://github.com/marweb/DockPilot/actions](https://github.com/marweb/DockPilot/actions) and monitor the "Release" workflow. The build typically takes 15-25 minutes (ARM64 builds via QEMU are slower).

---

## Verifying the Release

### 1. Check GitHub Actions

- All jobs should complete successfully (green checkmarks)
- If any job fails, check the logs for the specific service

### 2. Check Docker images

Visit [https://github.com/marweb?tab=packages](https://github.com/marweb?tab=packages). You should see:

- `dockpilot-api-gateway`
- `dockpilot-docker-control`
- `dockpilot-tunnel-control`
- `dockpilot-web`

### 3. Verify multi-arch support

```bash
docker manifest inspect ghcr.io/marweb/dockpilot-web:1.0.0
```

The output should show both `linux/amd64` and `linux/arm64` in the manifest.

### 4. Test installation

On a clean server:

```bash
curl -fsSL https://raw.githubusercontent.com/marweb/DockPilot/master/scripts/install.sh | sudo bash
```

---

## Making Images Public

By default, packages published to ghcr.io may be private. To make them publicly pullable:

1. Go to [https://github.com/marweb?tab=packages](https://github.com/marweb?tab=packages)
2. Click on each package (e.g., `dockpilot-web`)
3. Click **Package settings** (right sidebar)
4. Scroll to **Danger Zone**
5. Click **Change visibility** → **Public**

Repeat for all four packages. Public images can be pulled without authentication.

---

## Hotfix / Patch Releases

For urgent bug fixes:

```bash
# 1. Create fix branch
git checkout main
git pull origin main

# 2. Make your fix
# ... edit files ...
git add .
git commit -m "fix: description of the bug"

# 3. Push to main
git push origin main

# 4. Create patch tag
git tag v1.0.1

# 5. Push tag (triggers release)
git push origin v1.0.1
```

---

## Troubleshooting

### Build fails for a specific service

- **api-gateway, docker-control, tunnel-control**: Check that `pnpm-lock.yaml` exists and is committed. The build uses `--frozen-lockfile`.
- **web**: The web Dockerfile copies `infra/nginx-spa.conf`. Ensure this file exists.
- **tunnel-control**: The cloudflared binary is downloaded per-architecture. If ARM64 fails, check that [cloudflared releases](https://github.com/cloudflare/cloudflared/releases) include `cloudflared-linux-arm64`.

### ARM64 build is very slow

ARM64 builds run in QEMU emulation on x86 runners, so they take 2-3x longer than AMD64. This is normal. Total workflow time of 15-25 minutes is expected.

### "Permission denied" when pushing packages

- Ensure the workflow has `packages: write` permission
- For first-time setup, the repository owner may need to approve the workflow

### update-versions job fails on push

- The job pushes to `main` or `master`. If your default branch is different, update the workflow:
  ```yaml
  git push origin HEAD:main || git push origin HEAD:master
  ```
- Ensure `GITHUB_TOKEN` has push access (it does by default for the same repo)

### Images are private and install.sh fails to pull

Make the packages public (see [Making Images Public](#making-images-public)). Alternatively, users can authenticate:

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

---

## Summary

| Step        | Command                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| Create tag  | `git tag v1.0.0`                                                                                                    |
| Push tag    | `git push origin v1.0.0`                                                                                            |
| Verify      | Check [Actions](https://github.com/marweb/DockPilot/actions) and [Packages](https://github.com/marweb?tab=packages) |
| Make public | Package settings → Change visibility → Public                                                                       |
