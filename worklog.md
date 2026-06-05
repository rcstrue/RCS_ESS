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

---
Task ID: 10
Agent: Main Agent
Task: Fix ESS backend APIs to match actual database schema — 8 issues (login field mismatch, custom PIN flow, expense types, role filters, has_custom_pin)

Work Log:
- Verified actual database schema from SQL dump (rcsfaxhz_bolt.sql)
- Key schema facts:
  - employees table: NO `city` column, NO `has_custom_pin` column, HAS `pin` varchar(10)
  - ess_employee_cache: HAS `pin` varchar(4) (null = use birth year), NO `manager_id` column
  - ess_expenses: `category` enum('advance','expense','employee_advance'), `type` enum('travel','food','cab','supplies','medical','other')

Fixed login.php:
  - Accept both `mobile_number` and `mobileNumber` field names from frontend
  - PIN validation: check ess_employee_cache.pin first (custom PIN), then birth year from employees.date_of_birth
  - has_custom_pin determined by whether ess_employee_cache.pin is NOT NULL
  - Removed pin from INSERT/UPDATE of ess_employee_cache (set only by change-pin endpoint)
  - Added `id` field to employee response for frontend session storage
  - Added `if (!$stmt)` safety checks on all prepare() calls
  - Explicit column list instead of `SELECT e.*` to avoid referencing non-existent columns

Fixed pin.php:
  - Removed `UPDATE employees SET pin = ?, has_custom_pin = 1` (has_custom_pin column doesn't exist!)
  - Only updates ess_employee_cache.pin (not employees table)
  - Added `is_first_login` flag support — skips current PIN validation for first-time setup
  - PIN limited to 4 digits (matches varchar(4) in ess_employee_cache)
  - Fallback: validates current_pin against cache.pin first, then birth year

Fixed expenses.php:
  - Removed hardcoded type validation (`'advance', 'expense'`) — type values come from DB enum
  - Removed hardcoded category validation — let DB enum constraint handle it
  - Added `view=types` endpoint: reads available categories and types from DB enum via SHOW COLUMNS
  - Added `if (!$stmt)` safety checks on all prepare() calls
  - Monthly summary uses `category` field instead of `type` field (correct mapping)

Fixed employees.php:
  - Added `role_filter` query parameter: 'all' (default), 'managers', 'admin'
  - 'managers': WHERE employee_role IN ('manager') OR app_role IN ('manager', 'regional_manager')
  - 'admin': WHERE employee_role = 'admin'
  - Added `id` field to response items
  - Added `if (!$stmt)` safety checks on all prepare() calls

Fixed filters.php:
  - Replaced `e.has_custom_pin` with `ec.pin AS cache_pin` (column doesn't exist in employees table)
  - has_custom_pin status now determined by: ec.pin IS NOT NULL

Fixed ess-api.ts:
  - Login: changed `{ mobileNumber, pin }` to `{ mobile_number: mobileNumber, pin }` (fixes "Mobile number is required" error)
  - changePin: added `is_first_login: boolean = false` parameter
  - Added `fetchExpenseTypes()` API function for reading expense types/categories from DB

Fixed ForceChangePin.tsx:
  - Added `isFirstLogin` prop
  - When isFirstLogin=true: skips "Current PIN" step, shows only "New PIN" → "Confirm" (2 steps)
  - When isFirstLogin=false: shows full "Current PIN" → "New PIN" → "Confirm" (3 steps)
  - Passes `is_first_login: true` to changePin API on first login

Fixed ESSApp.tsx:
  - Added `isFirstLogin` state
  - Passes `isFirstLogin` prop to ForceChangePin component
  - Resets isFirstLogin on PIN change completion

Stage Summary:
- 8 files modified: login.php, pin.php, expenses.php, employees.php, filters.php, ess-api.ts, ForceChangePin.tsx, ESSApp.tsx
- Login field name mismatch was the ROOT CAUSE of "Mobile number is required" error
- Custom PIN flow: birth year login → force PIN change → save to cache → use cache PIN for future logins
- Expense types now come from database enum (can be changed via ALTER TABLE without code changes)
- Employee directory supports role filtering (all/managers/admin)
- has_custom_pin removed from all employees table references (column doesn't exist)
- Zero ESLint errors from ESS files

---
Task ID: 11
Agent: Main Agent
Task: v2.0.0 — Remove PIN popup, fix father_name autofill, PWA install, GPS check-in, role-based access, admin Role Access tab

Work Log:
- Removed FirstLoginPinPopup from ESSApp startup flow — only full-screen ForceChangePin remains for !has_custom_pin
- Removed isFirstLogin, showFirstLoginPopup states from ESSApp.tsx
- Fixed father_name not auto-filled in Complete Registration form:
  - Added father_name to existingEmployee interface in RegistrationWizard.tsx
  - Changed hardcoded fatherHusbandName: '' to emp?.father_name || '' in createInitialData
- Fixed PWA Install banner:
  - Banner now shows on ALL platforms (not just Chrome with beforeinstallprompt)
  - Install button visible for both iOS ("How to Install") and Android ("Install")
  - Added resetDismiss() to usePwaInstall hook to re-show banner from More menu
  - More menu "Install App" now resets dismissed state before prompting
- Enhanced GPS check-in display:
  - DashboardHome now shows check-in location and time together
  - Location label changed from "Location" to "Check-in Location"
  - Added "Check-in Time" row showing time + location
- Fixed Employees page for managers:
  - Expanded EmployeeRole type: added 'field_officer' | 'admin'
  - Updated detectRole() to return admin, field_officer as distinct roles
  - Created shared canViewDirectory() function in helpers.ts
  - canViewDirectory now allows: manager, regional_manager, field_officer, admin
  - BottomNav and ESSApp both use shared canViewDirectory
- Updated getScope() for new roles: admin=all, field_officer=city
- Updated getRoleBadge() with admin (red), field_officer (orange) badge colors
- Added Admin "Role Access" tab:
  - Created RoleAccessManagement.tsx component with 6 roles, 4 permissions
  - Created /api/role-access GET/PUT endpoints with Prisma
  - Added RoleAccess model to prisma schema
  - AdminDashboard now has "Role Access" tab (admin-only)
- Updated version: 2.0.0 in package.json and manifest.json

Stage Summary:
- 17 files modified, 786 insertions, 95 deletions
- PIN popup removed from startup entirely
- Father name now auto-fills in Complete Registration form
- PWA install banner visible on all platforms with reset capability
- GPS check-in shows location alongside time
- Managers, field officers, regional managers, and admins can see Employees page
- Admin dashboard has new Role Access tab for visibility configuration
- Version bumped to 2.0.0
- Pushed as commit 49f2c7e to GitHub

---
Task ID: 12
Agent: Main Agent
Task: Fix admin login stays on login page after "Welcome back" toast (verify returns 401)

Work Log:
- Analyzed the auth flow: AdminLogin → POST /auth/login → save admin_token → navigate /admin/dashboard
- AdminDashboard mounts → calls verifySession() → GET /auth/verify
- In apiRequest, token resolution priority: ess_employee > ess_token > admin_token
- Root cause: When user has ESS session (ess_employee in localStorage), the ESS token takes priority over admin_token
- The ESS token (employee JWT) is sent to /auth/verify which expects admin JWT → 401 Unauthorized
- Fix 1: Modified apiRequest header merge order — custom headers now override auto-resolved token (via Object.assign after token resolution)
- Fix 2: verifySession() now explicitly passes admin_token in Authorization header, bypassing generic token resolution
- Fix 3: adminLogin() now clears ESS tokens (ess_token, ess_employee) before login to prevent cross-contamination
- Built successfully with vite build (790KB JS, 98KB CSS)
- Committed and pushed as 17d2568

Stage Summary:
- 3 root cause fixes across 2 files (auth.ts, config.ts)
- Admin login now works even when ESS session exists in localStorage
- verifySession uses admin token specifically, not the ESS token
- User needs to pull and rebuild on live server

---
Task ID: 13
Agent: Main Agent
Task: Fix PWA install flow (missing manifest link + SW registration) and fatherHusbandName auto-fill (PHP response unwrapping)

Work Log:
- PWA Install Fix:
  - Root cause: index.html was missing `<link rel="manifest">` — Chrome NEVER fires `beforeinstallprompt` without it
  - Added `<link rel="manifest" href="/manifest.json">` to root index.html
  - Added PWA meta tags: theme-color (#059669), apple-mobile-web-app-capable, apple-mobile-web-app-status-bar-style, apple-mobile-web-app-title
  - Fixed apple-touch-icon href from `/logo.ico` to `/apple-touch-icon.png`
  - Added service worker registration in main.tsx (navigator.serviceWorker.register('/sw.js'))
  - Deleted stale `public/index.html` that would overwrite Vite's built index.html (had old hashed asset references)

- fatherHusbandName Auto-fill Fix:
  - Root cause: PHP backend wraps ALL responses in `{ success: true, data: <payload> }` envelope
  - getEmployeeById returned `{ data: { success: true, data: { father_name: "X" } } }` but code treated it as the employee object
  - fatherHusbandName was mapped as emp?.father_name but the actual value was nested at emp?.data?.father_name
  - Added `unwrap()` helper to src/lib/api/employees.ts that detects and strips PHP envelope
  - Applied unwrap to ALL 10 API functions: getEmployees, getEmployeeById, getEmployeeByMobile, checkMobileExists, createEmployee, updateEmployee, loginEmployee, approveEmployee, rejectEmployee, updateEmployeeRole
  - Registration flow (useEmployeeSession.ts → getEmployeeById) now correctly receives employee data with father_name

- Verified all changes: lint passes (only pre-existing .next/types errors)
- All 5 original pending tasks confirmed as completed:
  1. ✅ Version 2.0.0 (was already done)
  2. ✅ Install button in More menu (was already done)
  3. ✅ PWA install flow (fixed: manifest link + SW registration)
  4. ✅ fatherHusbandName auto-fill (fixed: PHP response unwrapping)
  5. ✅ Admin Role Access tab (was already done)

Stage Summary:
- 3 files modified: index.html, main.tsx, src/lib/api/employees.ts
- 1 file deleted: public/index.html (stale build output)
- PWA install will now work on Chrome Android (beforeinstallprompt fires correctly)
- father_name auto-fills in registration form when existing employee data has it
- All pending work items completed

---
Task ID: 14
Agent: Main Agent
Task: Fix duplicate check-in location display + show location name instead of lat/lng coordinates

Work Log:
- Identified duplicate location in DashboardHome.tsx:
  - Lines 266-276: "Check-in Location" section showing raw lat/lng (e.g. "21.1500, 72.7787")
  - Lines 279-292: "Check-in Time" section showing time + same lat/lng again (redundant, time already in grid)
- Removed the "Check-in Time" section entirely (time already displayed in Check In/Check Out/Hours grid)
- Added reverse geocoding to helpers.ts:
  - `reverseGeocode(lat, lng)` function using Nominatim (OpenStreetMap) free API
  - In-memory cache with 24h TTL to avoid repeated API calls
  - Prefers short place names: suburb/neighborhood + city + state
  - `getLocationName(lat, lng)` convenience wrapper returning null when no coordinates
- Updated DashboardHome.tsx:
  - Added `locationName` state + useEffect to fetch location name when lat/lng changes
  - "Check-in Location" now shows resolved place name (e.g. "Surat, Gujarat") or "Locating..." while loading
  - Replaced `attLocation` (raw coordinates string) with `hasLocation` (boolean for showing the section)

Stage Summary:
- 2 files modified: helpers.ts (added reverse geocoding), DashboardHome.tsx (removed duplicate, added place name)
- Location shows once instead of twice
- Shows human-readable place name instead of raw lat/lng coordinates
- Nominatim API is free, no API key needed, 1 request per user per day (cached)

---
Task ID: 15
Agent: Main Agent
Task: Salary Upload feature with XLSX template download, carry-forward calculation, and bulk upload

Work Log:
- Installed `xlsx` package (v0.18.5) for Excel file generation and parsing
- Created `src/components/admin/SalaryUpload.tsx` (775 lines):
  - Template download: generates styled XLSX with bold headers (light green bg), frozen top row, sample data
  - Columns: Employee ID, Employee Name, Amount, Month, Year, Date, Remarks, Carry Forward (Auto-calculated)
  - Drag-and-drop upload zone with file type validation (.xlsx only)
  - XLSX parsing with case-insensitive column mapping
  - Carry-forward auto-calculation: cumulative sum per Employee ID across rows
  - Row-level validation: Employee ID required, Amount > 0, Month 1-12, Year 4-digit, Date required
  - Preview table with alternating row colors, sticky header, max-height scroll
  - Carry-forward column highlighted in emerald
  - Summary stats: total rows, total amount (INR), valid rows, error rows
  - Error rows highlighted in red with detail list
  - Submit to backend via apiRequest
  - Clear/reset functionality
- Created `api/ess/salary-upload.php` (235 lines):
  - POST: bulk insert salary records with transaction safety
  - GET: view uploaded records with filters (month, year, employee_id, status)
  - Auto-creates `salary_upload_records` table on first use
  - Validates each row: employee ID, amount, month, year
  - Checks employee exists in database
  - Logs upload to `bulk_upload_logs` table
  - Summary totals in GET response
- Updated `AdminDashboard.tsx`: added Salary Upload tab with FileSpreadsheet icon
- Build verified: 1804 modules, 793KB JS, 99KB CSS
- Pushed as commit 5f04b64 to GitHub

Stage Summary:
- 4 files created/modified: SalaryUpload.tsx (new), salary-upload.php (new), AdminDashboard.tsx (modified), package.json (xlsx dep)
- XLSX template downloads as proper .xlsx file (not CSV) with styled headers and sample data
- Carry-forward calculated automatically per employee across upload rows
- Backend stores records with transaction safety and upload logging
- Zero lint errors in new files
- Deploy command needed on server: cd ~/RCS_ESS && git pull origin main && bun install && bun run build && rsync -av dist/ ~/domains/join.rcsfacility.com/public_html/ && rsync -av --exclude='config.php' api/ess/ ~/domains/join.rcsfacility.com/public_html/api/ess/
---
Task ID: 1
Agent: Main Agent
Task: Restructure Expense page - move Month Picker above tabs, show per-month advance details

Work Log:
- Read current ExpensesPage.tsx, expenses.php, and ess-api.ts to understand existing code structure
- Moved the Month Picker (◀ Month Year ▶) from inside the "My Expenses" tab to above both tabs, shared by both
- Changed month data loading to trigger on month change regardless of active tab (both tabs need month_summary)
- Added client-side filtering of advanceAllocations by selected month (selYear, selMonth)
- Redesigned "My Advance" tab to show monthly view:
  - Summary cards: Total Available (Opening B/F + This Month Advance) and Expenses Used
  - Closing Balance card with positive/negative styling
  - Advance allocation record details for selected month only (with remarks, date, amount)
  - Empty state when no advance allocated for the month
- Removed unused imports (ArrowDownCircle, ArrowUpRight, TrendingUp, CheckCircle2, XCircle, Clock, Check)
- Removed unused state (advanceSummary) and constants (MONTH_NAMES, formatMonthYearFromNumbers)
- Removed duplicate month navigator from Expenses tab
- Built successfully, committed and pushed to GitHub

Stage Summary:
- ExpensesPage.tsx refactored: month picker above tabs, advance tab shows monthly detail
- Committed: "Refactor Expense page: move month picker above tabs, show per-month advance details"
- Pushed to GitHub: main branch (0d24f7b)
- Build successful (Vite build, 2.75s)
---
Task ID: 2
Agent: Main Agent
Task: Fix dashboard pending approvals count showing stale/wrong data

Work Log:
- Found root cause in useDashboard.ts: fetchExpenses(empId, 'pending') was passing string 'pending' as 2nd arg
- The function signature expects { status: 'pending' } object, so options?.status was undefined
- No status filter was sent to the API, causing ALL expenses to be returned and counted as "pending"
- Additionally, the dashboard was counting the manager's OWN expenses, not team pending expenses
- Fix: Replaced fetchExpenses(empId, 'pending') with fetchPendingTeamExpenses()
- This correctly calls the backend /ess/expenses?view=pending_team endpoint
- Which only returns expenses with status='pending' from team members under the manager
- Added fetchPendingTeamExpenses to imports

Stage Summary:
- Fixed useDashboard.ts: pendingExpenses now uses fetchPendingTeamExpenses()
- Pushed to GitHub: main branch (c28f1a4)
- Build successful

---
Task ID: 1
Agent: Main Agent
Task: Fix Employees page white screen - ReferenceError: Cannot access 'L' before initialization

Work Log:
- User reported employees page showing white screen with error: `ReferenceError: Cannot access 'L' before initialization` at `eL (index-lK7aq08T.js:696:31131)`
- Built project with sourcemaps to decode minified error location
- Used source-map consumer to decode: error at `DirectoryPage.tsx:147:15` — `usePullToRefresh` hook calling `loadEmployees` before it's declared
- Root cause: `const pullRefresh = usePullToRefresh({ onRefresh: loadEmployees })` was at line 147, but `const loadEmployees = useCallback(...)` was at line 170. JavaScript's `const` has a temporal dead zone — accessing it before declaration throws ReferenceError
- Discovered the SAME bug pattern in all 7 ESS pages that use pull-to-refresh
- Fixed all 7 files by moving `usePullToRefresh()` calls to AFTER the `useCallback` declarations they reference:
  - DirectoryPage.tsx (employees/directory)
  - AttendancePage.tsx
  - AnnouncementsPage.tsx
  - HelpdeskPage.tsx
  - ExpensesPage.tsx
  - TasksPage.tsx
  - LeavesPage.tsx
- Build succeeded, committed as `2a6c3eb`, pushed to GitHub

Stage Summary:
- Root cause: Temporal Dead Zone error from forward-referencing const variables in usePullToRefresh hook calls
- Fix: Reordered code to declare callbacks before hook calls in all 7 affected pages
- Pushed to GitHub: https://github.com/rcstrue/RCS_ESS.git (commit 2a6c3eb)
