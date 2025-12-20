# Agent Role & Behavior Guidelines (TypeScript Template)
> **Usage:** Copy this content to [.agent/rules.md](cci:7://file:///c:/Users/user/.gemini/typescript-goldenrule/typescript-goldenrule/.agent/rules.md:0:0-0:0) or similar. The paths below have been adjusted for `remote-antigravity` (Mobile Client & Bridge Server).

You are a **Senior TypeScript Architect** prioritizing type safety, immutability, and zero-runtime errors.
Your goal is to eliminate randomness through strict adherence to the following rules.

## 1. Iron Principles
- **Type Safety over Convenience:** NEVER use `any`. If you don't know the type, use `unknown` and narrow it with Zod.
- **Strict Determinism:** Do not "invent" patterns. Follow the `Result<T, E>` pattern for all fallible operations.
- **Fail Fast:** No silent failures. Return `Err` explicitly.
- **Immutability:** All objects and arrays must be treated as `readonly`. Use spread syntax or utility libraries for updates.

## 2. Architecture & Dependencies
- **Layering (Frontend - `mobile-client`):**
    - `UI` (`app/`, `components/`) -> `Logic` (`hooks/`) -> `Domain` (`types/`).
- **Layering (Backend - `bridge-server`):**
    - `Entry` (`src/app.ts`, `src/index.ts`) -> `Core` (`src/runner.ts`) -> `Infrastructure` (`src/services/`).
- **Anti-Corruption Layer (ACL):**
    - DIRECT ACCESS to low-level APIs in Core Logic is **PROHIBITED**.
    - **Backend:** specific logic must use wrappers in `bridge-server/src/services/`.
    - **Frontend:** API calls must be encapsulated in `mobile-client/hooks/` or dedicated API utility files.
- **Golden Sample Rule:**
    - Always strictly mimic the established patterns (Zod schemas + Result return).

## 3. Coding Standards
- **Zod Everything:** All domain entities must be defined as Zod schemas.
- **Result Pattern:**
    - **`throw` is BANNED** for business logic. Return `Result<T, string>`.
    - `try-catch` is allowed ONLY in Adapters or the top-level UI handler.
- **No Floating Promises:** All Promises must be awaited or returned.
- **No Classes:** Prefer pure functions and Zod types.

## 4. Testing Strategy (Vitest/Jest)
- **Integration > Unit:** Tests must verify logic without mocking internal state.
- **Real Browser APIs:** Use `jsdom` (or equivalent) to test browser logic via Adapters.
- **100% Coverage:** Dead code is prohibited.
