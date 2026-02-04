# Project Overview

kilocode-backend is the Backend web application for Kilo Code: user auth, payments, credit management, and third-party integrations.

# Tech Stack

- **Framework**: Next.js 15 with App Router
- **Package Manager**: pnpm (required - enforced via preinstall hook)
- **Database**: PostgreSQL with Drizzle ORM
- **Testing**: Jest (not Vitest)
- **Styling**: Tailwind CSS v4
- **State Management**: @tanstack/react-query, Jotai
- **API**: tRPC for type-safe APIs (`src/routers/`)
- **Auth**: Stytch, WorkOS, next-auth
- **Payments**: Stripe
- **Monitoring**: Sentry, PostHog

# Conventions

- We use pnpm as the main package manager
- Errors can be thrown from the code because they'll be caught by Sentry, don't wrap all code in try-catch statements because that silences the errors
- Our application is dark-mode only
- We use Jest for testing (not Vitest); always run tests with `pnpm test` which properly sets up necessary env vars. To target a specific test: `pnpm test -- <path to test file>`
