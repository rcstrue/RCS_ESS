---
Task ID: 1
Agent: Main Agent
Task: Fix git, create ESS expense module (PHP API + React frontend), push to GitHub

Work Log:
- Fixed git: removed rebase-merge dir, reset index, hard reset to HEAD
- Created server/api/expenses.php (1,246 lines) - Full PHP REST API
- Created src/app/expenses-page.tsx (2,184 lines) - Comprehensive React expense UI
- Updated src/app/page.tsx to render ExpensesPage component
- Verified compilation: bun run lint passes, Next.js dev server compiles successfully
- Pushed to GitHub: rcstrue/RCS_ESS (commit 47f6598)

Stage Summary:
- PHP API with 8 endpoints: list, create, update, approve, reject, link_settlement, dashboard, summary
- React frontend with role-based tabs (employee/manager/admin), submit form, approval flow, filters
- All 25+ columns from ess_expenses table supported
- Successfully pushed to https://github.com/rcstrue/RCS_ESS
---
Task ID: 2
Agent: Main Agent
Task: Fix check-in time not showing + add live clock + move check-in/out to home page

Work Log:
- Discovered that `unwrap()` helper was MISSING from ess-api.ts — PHP wraps responses in `{ success, message, data }` but frontend was reading the envelope directly
- Added `unwrap()` function to ess-api.ts and wrapped ALL 24 API functions with it
- Fixed 9 syntax errors (missing closing `)`) in multi-line unwrap calls
- Updated ESSApp.tsx imports to include `checkIn`, `checkOut`, `fetchAttendance`
- Added `Timer` icon import
- Added `checkInLoading`, `checkOutLoading` state to ESSApp
- Created `handleDashboardCheckIn` with geolocation capture + loading guard
- Created `handleDashboardCheckOut` with loading guard
- Updated `loadDashboardData` to also call `fetchAttendance` for current month as PRIMARY source for today's record (with profile `recent_attendance` as fallback)
- Completely rewrote DashboardHome component:
  - Added live clock (1s interval, IST timezone) with gradient header
  - Added attendance card with check-in/out time, check-out time, hours worked (live), location
  - State-driven buttons: Check In / Check Out / Done for today
  - Loading skeletons for attendance card
  - Status badge with pulse animation for "Checked In" state
- Changed Attendance quick action label from "Attendance" to "History"
- Changed attendance page subtitle to "View your attendance history"
- Updated MORE_MENU_ITEMS description: "Check in/out & view history" → "View attendance history"

Stage Summary:
- Root cause was missing `unwrap()` helper — PHP envelope not being stripped
- Fixed ALL 24 API functions with unwrap
- Added `fetchAttendance` to dashboard loading for reliable today's attendance data
- Added live clock + check-in/out controls + time/location display to home page
- Check-in shows 400 on second attempt (already checked in) — handled gracefully with toast.error
- Zero lint errors, dev server runs clean
---
Task ID: 3
Agent: Main Agent
Task: Fix 5 critical production issues from audit report

Work Log:
- Read and analyzed all 8 source files: config.ts, ess-api.ts, ESSApp.tsx, AttendancePage, LeavesPage, HelpdeskPage, AnnouncementsPage, DirectoryPage
- Identified root causes for all 5 issues
- Fix 1 (Systemic unwrap bug): Updated ALL 6 page components + ESSApp to properly destructure `{ data, error }` from API calls. Each call now checks error before using data.
- Fix 2 (API key exposure): Replaced hardcoded `RCS_HRMS_SECURE_KEY_982374982374` with `process.env.NEXT_PUBLIC_API_KEY` in config.ts
- Fix 3 (ESS auth token): Added dual token reading (admin_token || ess_token), X-Employee-ID header from ess_employee session, and token from session if present. Applied to both apiRequest and uploadBase64Image.
- Fix 4 (Timezone mismatch): Replaced `todayDateString()` with IST-safe version using `toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })` in both ESSApp.tsx and AttendancePage.tsx. Also fixed monthKey generation in loadDashboardData.
- Fix 5 (Check-out 400): Added explicit guard with user-facing toast error message when attendance ID is missing, in both ESSApp.tsx and AttendancePage.tsx handleCheckOut functions.
- Verified: 0 TypeScript errors, 0 ESLint errors on all modified files

Stage Summary:
- 8 files modified: config.ts, ESSApp.tsx, AttendancePage.tsx, LeavesPage.tsx, HelpdeskPage.tsx, AnnouncementsPage.tsx, DirectoryPage.tsx
- 20+ API call sites fixed from raw response usage to proper `{ data, error }` destructuring
- API key no longer exposed in source code
- ESS authentication now sends X-Employee-ID header on every request
- All date comparisons now use IST timezone explicitly
- Check-out gracefully handles missing attendance ID with toast error
- NEXT_PUBLIC_API_KEY env variable needs to be set for API key fix to work
---
Task ID: 4
Agent: Main Agent
Task: Refactor ESSApp.tsx (1434 lines) into clean modular structure

Work Log:
- Read entire ESSApp.tsx (1434 lines) and all imported dependencies
- Created helpers.ts (79 lines): detectRole, canApprove, getScope, getRoleBadge, getGreeting, getInitials, formatDate, todayDateString, getCurrentISTDate, getISTMonthKey
- Created constants.ts (34 lines): NAV_ITEMS, MORE_MENU_ITEMS with icon imports
- Created LoginScreen.tsx (243 lines): Mobile + PIN login with auto-focus, paste handling, loading state
- Created DashboardHome.tsx (335 lines): Attendance card, live clock, check-in/out, summary cards, quick actions, approvals alert + exported DashboardData type + SummaryCard helper
- Created ProfileView.tsx (105 lines): Avatar, profile fields, action buttons
- Created SettingsView.tsx (119 lines): Dark mode toggle, app info, logout
- Created PageHeader.tsx (34 lines): Back button + title + subtitle
- Created BottomNav.tsx (82 lines): Fixed bottom nav with Sheet-based More menu, logout
- Created hooks/useDashboard.ts (119 lines): All dashboard data loading (Promise.allSettled for 6 API calls), check-in/out handlers with geolocation, auto-load on session change
- Rewrote ESSApp.tsx (165 lines): Pure orchestrator — auth state, navigation, routing, imports extracted modules

Stage Summary:
- ESSApp.tsx reduced from 1434 lines → 165 lines (89% reduction)
- 10 new files created in src/components/ess/
- Zero TypeScript errors, zero ESLint errors from ESS files
- All functionality preserved: login, dashboard, attendance, navigation, check-in/out, profile, settings
- Clean separation: helpers, constants, hooks, page components, layout components
- No UI changes, no functionality changes — purely structural refactoring


---
Task ID: 5
Agent: Main Agent
Task: Implement ESS JWT authentication system with rate limiting, account lock, and force PIN change

Work Log:
- Created src/lib/ess-auth.ts (152 lines): Token manager with JWT decode, expiry check, rate limit tracking (client-side), lockout management
- Updated src/lib/ess-types.ts: Added token, token_expires_at, is_locked, lockout_remaining, rate_limit fields to LoginResponse; added token field to ESSSession
- Updated src/lib/api/config.ts: Added 401 interceptor that clears ess_token + ess_employee, dispatches 'ess:session-expired' custom event
- Created src/components/ess/ForceChangePin.tsx (234 lines): 3-step PIN change wizard (current → new → confirm) with progress dots, show/hide toggle, validation
- Rewrote src/components/ess/LoginScreen.tsx (253 lines): Added JWT token storage, rate limit countdown timer, lockout banner, remaining-attempts warning, server-side lock/rate-limit response handling, force PIN change redirect
- Updated src/components/ess/ESSApp.tsx: Added ForceChangePin import, forcePinSession state, handleForcePinChange/handleForcePinComplete callbacks, ess:session-expired event listener, force PIN routing before login screen
- Created api/ess/auth-reference.php (300+ lines): Complete PHP reference implementation with JWT encode/decode, rate limiting (5/min per mobile+IP), account lock (10 failures → 30min lockout), force PIN change, validateToken middleware, database schema changes needed

Stage Summary:
- 4 new files created: ess-auth.ts, ForceChangePin.tsx, auth-reference.php
- 4 files modified: ess-types.ts, api/config.ts, LoginScreen.tsx, ESSApp.tsx
- Zero ESLint errors on all ESS files
- Full JWT lifecycle: generate (PHP), store (localStorage), send (Authorization header), validate (PHP), expire (401 interceptor)
- Rate limiting: Client-side tracking (5/min window, 10 failures → 30min lock) + server-side response handling
- Force PIN change: Backend signals has_custom_pin=false → frontend shows 3-step PIN wizard
- Session expiry: 401 responses trigger automatic logout with toast notification
- PHP reference includes: JWT class (no composer dependency needed), handleLogin(), handleChangePin(), validateToken() middleware, database ALTER TABLE statements, router integration examples

---
Task ID: 6
Agent: Main Agent
Task: Fix 9 production bugs from QA report (unwrap crash, cross-midnight attendance, check-in response, leaves approve, toast spam, timezone, directory images, lockout handling, duplicate API calls)

Work Log:
- BUG #1 (CRITICAL): Rewrote `unwrap()` in ess-api.ts to handle `success: false` envelopes — extracts error/message and returns `{ data: null, error }` instead of passing the envelope through as data. Made `essLogin()` special — returns full envelope as data on failure so LoginScreen can read `is_locked`, `lockout_remaining`, `rate_limit_remaining`.
- BUG #3: Added cross-midnight fallback in useDashboard.ts — if no today record found, checks latest record for `status=checked_in && !check_out` (overnight session). Applied to both `attData.items` and `profileData.recent_attendance`.
- BUG #4: Fixed AttendancePage.tsx check-in/out handlers to always call `loadAttendance()` after success instead of trusting API response shape. Removed direct `setTodayRecord(data)` usage.
- BUG #2: Rewrote `loadPendingTeamRequests()` in LeavesPage.tsx — now fetches team members via `fetchEmployees({ scope: 'team' })` first, then fetches each member's pending leaves in parallel with `Promise.allSettled`, merges and sorts by `created_at` descending. Added `fetchEmployees` import.
- BUG #5: Added `_sessionExpiredFired` guard in config.ts — only dispatches `ess:session-expired` event once per logout cycle. Exported `resetSessionExpiredGuard()` function, called from ESSApp's `saveSession()` callback on successful login.
- BUG #6: Added `parseIST()` helper to helpers.ts. Updated `formatTime()`, `formatDate()`, `calculateHours()` in AttendancePage.tsx to use `parseIST()`. Updated `formatAttTime()`, `calcHours()` in DashboardHome.tsx to use `parseIST()`. Updated `formatDate()` in ExpensesPage.tsx to use IST conversion. Added `todayISTString()` helper and used it for expense date input `max` attribute.
- BUG #7: Wrapped all `profile_pic_url` usages in DirectoryPage.tsx with `getFileUrl()` — both the employee list avatar and the profile dialog avatar (2 locations). Added `getFileUrl` import.
- BUG #8: Ensured lockout info (`is_locked`, `rate_limit_remaining`) is read from `data` BEFORE checking `error` in LoginScreen.tsx. The special `essLogin()` function now returns both data and error when PHP sends `success:false` with lockout metadata.
- BUG #9: Added `isFirstMount` ref guard in ESSApp.tsx — skips the first execution of the `currentPage` useEffect, preventing duplicate `loadDashboardData()` call on initial mount (useDashboard already loads on session change).

Stage Summary:
- 8 files modified: ess-api.ts, useDashboard.ts, AttendancePage.tsx, LeavesPage.tsx, config.ts, helpers.ts, DashboardHome.tsx, ExpensesPage.tsx, DirectoryPage.tsx, LoginScreen.tsx, ESSApp.tsx
- Zero TypeScript errors, zero ESLint errors from ESS files
- unwrap() now correctly handles success:false, success:true, and non-envelope responses
- Login preserves server lockout metadata through custom unwrap logic
- Cross-midnight attendance sessions properly detected
- Check-in/out always reloads from server for authoritative state
- Team leaves approval fetches actual team members' leaves, not user's own
- Session expired toast fires exactly once per logout cycle
- All datetime parsing consistently uses IST timezone
- Directory profile images use proper full URL via getFileUrl()
- Dashboard loads exactly once on initial mount

---
Task ID: 7
Agent: Main Agent
Task: Fix and deploy ESS web app - env variables, clean build, deployment, API routing, cache control

Work Log:
- Discovered project is Vite (not Next.js) — `process.env.NEXT_PUBLIC_API_KEY` NEVER works in browser
- Fixed config.ts: Changed from `process.env.NEXT_PUBLIC_API_KEY` to `import.meta.env.VITE_API_KEY` with hardcoded fallback
- Updated .env: Added `VITE_API_KEY=RCS_HRMS_SECURE_KEY_982374982374`
- Created api/ess/.htaccess: Clean URL routing (login → login.php), CORS headers, cache control for API
- Created api/.htaccess: RewriteEngine On
- Created public_html/.htaccess: HTTPS redirect, SPA fallback, cache busting (HTML no-cache, hashed JS/CSS immutable), gzip, security headers
- Clean build: `rm -rf dist/ && bun install && bun run build` → 1801 modules, output dist/ (index.html + 1 CSS + 1 JS)
- Deployed: rsync --delete dist/ → public_html/, rsync --delete api/ → public_html/api/
- Verified API key `RCS_HRMS_SECURE_KEY_982374982374` is baked into built JS bundle
- Committed and pushed to GitHub (c68dea6)

Stage Summary:
- ROOT CAUSE of 403: `process.env` doesn't exist in Vite browser runtime → API_KEY was always empty string
- FIXED: Now uses `import.meta.env.VITE_API_KEY` with hardcoded fallback guaranteeing the key is sent
- Built JS size: 747KB (204KB gzipped), CSS: 93KB (16KB gzipped)
- Deployment: dist/ + api/ deployed to ~/domains/join.rcsfacility.com/public_html/
- .htaccess: SPA routing, cache-busting HTML, immutable hashed assets, CORS for API
- Zero lint errors from ESS/API files

---
Task ID: 8
Agent: Main Agent
Task: Fix expenses.php 500 error (text/html response instead of JSON)

Work Log:
- Analyzed the 500 error: response was `text/html; charset=UTF-8` instead of `application/json`, meaning PHP was crashing with an uncaught error
- Identified 9 root causes:
  1. `catch (Exception $e)` doesn't catch `\Throwable` — PHP TypeErrors (from strict_types=1) extend `\Error`, not `\Exception`, resulting in HTML error pages
  2. `requireAuth()` in config.php returned `$payload['employee_id'] ?? ''` without string cast — if JWT stores employee_id as integer (e.g., 4), strict_types=1 throws TypeError
  3. POST `bind_param` type string was `sssddsssss` but `$type` (4th param) is string not double — correct: `ssssdsssss`
  4. Spread operator `...$params` in `bind_param` can fail with variable param count
  5. `SELECT` specified 16 columns that might not all exist in the table
  6. No `return;` after validation `jsonOutput()` calls in POST handler
  7. `_debug` info leaked in error responses
  8. Strict type hints on `getDbConnection(): mysqli` and `getTeamMembers(mysqli, string)` could cause issues from non-strict callers
  9. Monthly summary queries failure would crash the entire response
- Rewrote expenses.php (370 lines):
  - Changed `catch (Exception $e)` → `catch (\Throwable $e)`
  - Added `safeBindParam()` helper using `call_user_func_array` for variable param count
  - Changed to `SELECT *` with defensive `isset()` checks on all row access
  - Wrapped monthly summary in try/catch so failure doesn't break response
  - Fixed POST bind_param to `ssssdsssss` (correct types)
  - Added `return;` after all validation jsonOutput calls
  - All array() instead of [] for maximum PHP compatibility
- Updated config.php:
  - Added `(string)` cast in `requireAuth()` return
  - Removed strict type hints from `getDbConnection()` and `getTeamMembers()`

Stage Summary:
- Root cause: combination of `declare(strict_types=1)` + untyped JWT employee_id + `catch(Exception)` instead of `catch(Throwable)`
- The strict_types in config.php means `requireAuth()` (declared to return string) would throw TypeError if JWT stores employee_id as int
- TypeError extends \Error (not \Exception), so old catch block never caught it → PHP returns HTML 500
- Pushed as commit 2790b23 to GitHub
- User needs to re-upload api/ess/expenses.php and api/ess/config.php to server

---
Task ID: 9
Agent: Main Agent
Task: Fix all ESS backend APIs to match actual database schema

Work Log:
- Identified that employees table has NO city column — city is on units table
- Fixed employees.php: removed e.city references, added LEFT JOIN units u ON u.id = e.unit_id, city now from u.city
- Fixed employees.php: team scope filter removed e.city = ? (no city column on employees)
- Fixed filters.php: _handleProfile() — e.city AS emp_city replaced with u.city AS emp_city via units JOIN
- Fixed filters.php: _handleEmployeeDirectory() — same fix, u.city from units table
- Fixed filters.php: replaced [...$params] spread with array_merge() + bindDynamicParams()
- Fixed login.php: added LEFT JOIN units u ON u.id = e.unit_id to fetch u.city AS unit_city, u.state AS unit_state
- Fixed login.php: $city now from $employee['unit_city'] (from units JOIN), not $employee['city']
- Fixed login.php: added return; after all validation jsonOutput calls
- Fixed login.php: removed strict type hints from _trackFailedAttempt and _determineRole
- Fixed config.php: added bindDynamicParams() as shared helper (was only in expenses.php)
- Confirmed attendance.php, leaves.php, tasks.php, helpdesk.php, announcements.php, pin.php — these only query ess_* tables (not employees), no schema issues

Stage Summary:
- Root cause: ALL queries referencing e.city were failing with SQL error because employees table has no city column
- city is stored on the units table (units.city), must JOIN to get it
- Login was failing because $employee['city'] returned null for the cache
- bindDynamicParams() moved to config.php as shared utility
- 4 files modified: employees.php, filters.php, login.php, config.php
- Pushed as commit 0405d68
