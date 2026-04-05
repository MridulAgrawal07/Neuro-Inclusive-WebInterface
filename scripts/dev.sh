#!/usr/bin/env bash
set -e

if [ ! -f .env ]; then
  echo "No .env found. Copying .env.example..."
  cp .env.example .env
  echo "Edit .env and add your VITE_CLAUDE_API_KEY, then re-run."
  exit 1
fi

echo "Starting Neuro-Inclusive dev server..."
npm run dev
