# Git Workflow for Team

Guide to using Git in the terminal.
You can copy and paste the commands exactly as shown, or modify.

## 1. Before You Start

Open your project folder in the terminal.
First, make sure you are on the latest version of main:

```bash
git checkout main
git pull origin main
```

## 2. Create a New Branch

Every change must be done on its own branch.
Use these branch types:

| Type | When to Use |
|------|-------------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `chore/` | Cleanup, refactoring, config changes |

### Examples

```bash
git checkout -b feat/login-page
git checkout -b fix/navbar-bug
git checkout -b chore/update-dependencies
```

## 3. Make Your Changes

Edit your files normally in VS Code or your IDE.

## 4. Check What Changed

```bash
git status
```

This shows:
- modified files
- new files
- deleted files

## 5. Save Your Changes to Git

### Stage all files

```bash
git add .
```

### Create a commit

```bash
git commit -m "feat: add login validation"
```

## 6. Push Your Branch to Azure DevOps

Replace the branch name with your own.

```bash
git push -u origin feat/login-page
```

### Example:

```bash
git push -u origin fix/navbar-bug
```

## 7. Create a Pull Request (PR) in Azure DevOps

After pushing:

1. Go to:
   - Repos
   - Pull Requests
2. Click **New Pull Request**
3. Set:
   - Source branch: your branch
   - Target branch: main
4. Add:
   - a clear title
   - short description
5. Add reviewers
6. Click **Create**

## 8. After Review

If reviewers request changes:

1. Make the changes
2. Run:
   ```bash
   git add .
   git commit -m "fix: address PR comments"
   git push
   ```
   Your PR updates automatically.

## 9. Merge the Pull Request

Once approvals are complete and checks pass:

1. Open the PR
2. Click **Complete / Merge**
3. Delete the branch after merging if prompted

## Commit Message Examples

```bash
git commit -m "feat: add user profile page"
git commit -m "fix: resolve login redirect issue"
git commit -m "chore: clean up unused imports"
```

## Full Example Workflow

```bash
# Get latest main branch
git checkout main
git pull origin main

# Create branch
git checkout -b feat/login-page

# Check changes
git status

# Stage changes
git add .

# Commit changes
git commit -m "feat: add login page"

# Push branch
git push -u origin feat/login-page
```

Then create the Pull Request in Azure DevOps.

## Important Rules

- Never push directly to main
- Always create a new branch first
- Every change must go through a Pull Request
- At least 1 other teammate must review before merging
- Keep branch names short and descriptive
