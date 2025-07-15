#!/bin/bash

echo "=== Sauvegarder sur GitHub ==="

# Get commit message from user
read -p "Message de commit: " commit_message

# Add all changes
git add .

# Commit with the provided message
git commit -m "$commit_message"

# Push to remote repository
echo "Pushing changes to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed to GitHub!"
else
    echo "❌ Error: Failed to push to GitHub"
    exit 1
fi