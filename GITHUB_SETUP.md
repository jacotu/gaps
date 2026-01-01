# GitHub Setup Instructions

## Step 1: Create a GitHub Repository

1. Go to [GitHub](https://github.com) and sign in
2. Click the "+" icon in the top right corner
3. Select "New repository"
4. Repository name: `gaps-extension` (or any name you prefer)
5. Description: "Advanced text analysis Chrome extension with POS tagging and semantic gap analysis"
6. Choose **Public** or **Private**
7. **DO NOT** initialize with README, .gitignore, or license (we already have these)
8. Click "Create repository"

## Step 2: Connect Local Repository to GitHub

After creating the repository, GitHub will show you commands. Use these:

```bash
cd /Users/daniel/floating-pos-tagger-extension

# Add the remote repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/gaps-extension.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

## Alternative: Using SSH

If you prefer SSH:

```bash
git remote add origin git@github.com:YOUR_USERNAME/gaps-extension.git
git branch -M main
git push -u origin main
```

## Step 3: Update README (Optional)

After pushing, you may want to update the README.md to replace `yourusername` with your actual GitHub username in the clone URL.

## Troubleshooting

If you get authentication errors:
- For HTTPS: Use a [Personal Access Token](https://github.com/settings/tokens) instead of password
- For SSH: Set up [SSH keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)

If you need to force push (not recommended unless necessary):
```bash
git push -u origin main --force
```

