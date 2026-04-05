#!/usr/bin/env bash
set -e

echo "Building Neuro-Inclusive extension..."
npm run build
echo "Build complete. Load the dist/ folder in chrome://extensions/"
