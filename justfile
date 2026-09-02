# Iqia — dev task runner

set shell := ["bash", "-uc"]

# List available recipes
default:
    @just --list

# Install all workspace dependencies
install:
    pnpm install

# Build the TypeScript SDK
sdk:
    pnpm --filter @iqia/sdk build

# First-run setup: install deps + build the SDK
setup: install sdk

# Run the app in dev mode
dev: sdk
    pnpm --filter frontend dev

# Typecheck the frontend without emitting
typecheck:
    pnpm --filter frontend typecheck

# Production build of the frontend
build:
    pnpm --filter frontend build
