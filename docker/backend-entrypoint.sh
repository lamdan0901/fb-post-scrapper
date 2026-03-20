#!/bin/sh
set -e

echo "Running database migrations..."
pnpm exec prisma migrate deploy

echo "Seeding default settings (safe to run on every start — uses upsert)..."
pnpm exec prisma db seed

echo "Starting backend server..."
exec node packages/backend/dist/index.js
