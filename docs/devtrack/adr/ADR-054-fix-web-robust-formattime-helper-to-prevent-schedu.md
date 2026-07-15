# ADR — fix(web): robust formatTime helper to prevent schedule page NaNs/crashes

> **Date:** 2026-07-15 | **PR:** #3613 | **Status:** Accepted

## Context
The schedule page was experiencing NaNs/crashes due to an unreliable `formatTime` helper function, which led to the need for a more robust solution to handle time formatting.

## Decision
The decision was made to migrate the `formatTime` helper to a centralized utility function in `@/lib/medicineDateUtils`, implementing robust regex matching for standard time strings and providing a timezone-independent date parsing fallback.

## Alternatives Considered
| Alternative | Why Rejected |
|---|---|
| Localized time formatting in each component | This approach would lead to duplicated code and increased maintenance complexity. |
| Utilizing a third-party date/time library | Adding an external dependency for a single utility function was deemed unnecessary, given the simplicity of the required functionality. |

## Consequences
**Positive:**
- Improved reliability of the schedule page by preventing NaNs/crashes due to invalid time inputs.
- Enhanced code maintainability through the centralization of the `formatTime` helper function.
- Comprehensive Jest tests ensure the correctness of the `formatTime` function.

**Trade-offs:**
- Introduced a new dependency on the `@/lib/medicineDateUtils` module for components using the `formatTime` function.

## Related Issues & PRs
- PR #3613: fix(web): robust formatTime helper to prevent schedule page NaNs/crashes
- Issue #3610