#!/bin/sh
set -e

echo "Running database migrations..."
pnpm exec prisma migrate deploy

echo "Starting backend server..."
exec node packages/backend/dist/index.js
