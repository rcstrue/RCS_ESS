# RCS Facility Services — Employee Portal

**Live URL:** [join.rcsfacility.com](https://join.rcsfacility.com)

A comprehensive employee self-service web application for RCS Facility Services Pvt. Ltd. The portal combines a **Registration Wizard** for new employee onboarding, a full **ESS (Employee Self-Service) suite** for attendance, leaves, expenses, and more, plus an **Admin Dashboard** for HR and management operations.

---

## Features

### Employee Registration (`/`)
Multi-step wizard for new employee onboarding:
- Mobile number verification with OTP
- Personal details capture
- Aadhaar card front & back document upload
- Bank account details with IFSC auto-verification
- Client & unit assignment
- Profile photo capture (camera/gallery)
- Profile completion tracking
- Digital ID card generation
- Registration PDF export

### Employee Self-Service — ESS (`/#/ess`)
PIN-based mobile-first interface for daily employee operations:

| Module | Description |
|--------|-------------|
| **Dashboard** | Welcome banner, leave balance, pending approvals, today's attendance status, quick action grid |
| **Attendance** | Real-time check-in/out with geolocation, live hours counter, monthly calendar view with colour-coded status dots |
| **Leave** | Apply for CL/SL/EL/WFH/Comp-Off/LWP, view balance, manager approval flow, status tracking |
| **Tasks** | Create and manage tasks with priority levels, assign to team members, track completion |
| **Expenses** | Submit expense claims and advance requests, manager approval/rejection, status filters, summary cards |
| **Help Desk** | Submit support tickets (IT/HR/Admin/Facility/Payroll), track resolution status |
| **Announcements** | View company-wide notices scoped by role (All / Managers / Admin), post new announcements (managers+) |
| **Employee Directory** | Search & browse co-workers, filter by client and unit, view detailed profiles |
| **Profile** | View personal details, employment info, profile photo |
| **Settings** | Dark mode toggle, change login PIN (3-step verification), app info, logout |

### Admin Dashboard (`/#/admin`)
Management interface for HR and administrators:
- Employee management with search, filters, and detailed views
- Client and designation management
- User access management
- Document viewer for uploaded KYC documents
- Registration verification queue

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 18 with TypeScript |
| **Build Tool** | Vite 5 with SWC plugin |
| **Styling** | Tailwind CSS 4 + shadcn/ui (New York style) |
| **Routing** | React Router v6 (HashRouter) |
| **Icons** | Lucide React |
| **State** | React hooks + localStorage session |
| **Forms** | React Hook Form + Zod validation |
| **Notifications** | Sonner toast library |
| **Backend** | PHP REST API (separate server) |
| **Database** | MySQL (via PHP API) |
| **Deployment** | GitHub Actions → FTP (lftp mirror) |

---

## Project Structure

```
src/
├── App.tsx                          # Root app with HashRouter routes
├── main.tsx                         # Entry point
│
├── app/                             # Next.js pages (not used in Vite build)
│
├── components/
│   ├── ess/                         # ★ ESS Module — core employee app
│   │   ├── ESSApp.tsx               # Main ESS shell (login, header, nav, routing)
│   │   ├── AttendancePage.tsx        # Check-in/out, calendar, live hours
│   │   ├── LeavesPage.tsx            # Leave apply/balance/approve
│   │   ├── ExpensesPage.tsx          # Expense claims & approval
│   │   ├── TasksPage.tsx             # Task management
│   │   ├── HelpdeskPage.tsx          # Support tickets
│   │   ├── AnnouncementsPage.tsx     # Company notices
│   │   ├── DirectoryPage.tsx         # Employee search & profiles
│   │   └── (no pin dialog - it's in ESSApp.tsx)
│   │
│   ├── registration/                 # New employee onboarding wizard
│   │   ├── RegistrationWizard.tsx    # Multi-step orchestration
│   │   ├── MobileEntry.tsx           # Step 1: Mobile + OTP
│   │   ├── ProfileCompletion.tsx     # Step 2: Personal details form
│   │   ├── steps/                    # Individual wizard steps
│   │   │   ├── Step2AadhaarFront.tsx
│   │   │   ├── Step3AadhaarBack.tsx
│   │   │   ├── Step4BankDocument.tsx
│   │   │   ├── Step5BankVerification.tsx
│   │   │   ├── Step6AdditionalDetails.tsx
│   │   │   ├── Step7ClientUnit.tsx
│   │   │   └── Step8Review.tsx
│   │   ├── ProfilePhotoCapture.tsx   # Camera/gallery photo upload
│   │   ├── SuccessPage.tsx           # Completion screen
│   │   ├── EmployeeProfile.tsx       # Profile display component
│   │   ├── IDCard.tsx                # Digital ID card generator
│   │   ├── CameraCapture.tsx         # Camera capture utility
│   │   └── StepIndicator.tsx         # Progress bar for wizard
│   │
│   ├── admin/                        # Admin dashboard components
│   │   ├── AdminLogin.tsx            # Admin authentication
│   │   ├── AdminDashboard.tsx        # Main admin layout
│   │   ├── EmployeeManagement.tsx    # Employee CRUD
│   │   ├── ClientManagement.tsx      # Client CRUD
│   │   ├── DesignationManagement.tsx # Designation CRUD
│   │   ├── UserManagement.tsx        # User access control
│   │   ├── EmployeeDetailDialog.tsx  # Employee detail view
│   │   └── DocumentViewerDialog.tsx  # KYC document viewer
│   │
│   └── ui/                           # shadcn/ui components (60+)
│
├── lib/
│   ├── ess-api.ts                    # ESS API helper functions (17 endpoints)
│   ├── ess-types.ts                  # TypeScript types & enums for ESS
│   ├── api/                          # Registration & admin API layer
│   │   ├── config.ts                 # Base URL, API key, fetch helper
│   │   ├── auth.ts                   # Authentication
│   │   ├── employees.ts              # Employee CRUD
│   │   ├── clients.ts                # Client fetch
│   │   ├── designations.ts           # Designation fetch
│   │   └── ifsc.ts                   # IFSC code lookup
│   ├── pdf/                          # PDF generation
│   │   └── generateRegistrationPDF.ts
│   ├── db.ts                         # Client-side DB helpers
│   └── utils.ts                      # Utility functions (cn, etc.)
│
├── pages/                            # Route-level page components
│   ├── Index.tsx                     # Landing / registration entry
│   ├── AdminLogin.tsx                # Admin login page
│   ├── AdminDashboard.tsx            # Admin dashboard page
│   ├── VerifyPage.tsx                # Mobile verification page
│   └── NotFound.tsx                  # 404 page
│
└── hooks/                            # Custom React hooks
    ├── use-mobile.ts(x)              # Mobile viewport detection
    ├── use-toast.ts                  # Toast notification hook
    └── useEmployeeSession.ts         # Employee session management
```

---

## Routes

| Route | Page |
|-------|------|
| `/#/` | Registration wizard / landing page |
| `/#/verify` | Mobile OTP verification |
| `/#/ess` | ESS login (PIN-based) |
| `/#/admin/login` | Admin login |
| `/#/admin` | Admin dashboard |
| `/#/admin/dashboard` | Admin dashboard (alias) |

---

## ESS Login Flow

1. Employee enters their **10-digit mobile number**
2. Enters their **4-digit PIN**
3. Default PIN for first-time login: **birth year** (e.g. `1990`)
4. System authenticates against `ess_employee_cache` table
5. Role is auto-detected from `worker_category` / `employee_role` fields
6. Session stored in `localStorage` as `ess_employee`
7. Employees can change their PIN from **Settings**

### Role Detection

| Worker Category / Role | Detected As |
|------------------------|-------------|
| Contains "regional" | Regional Manager |
| Contains "manager" | Manager |
| Contains "supervisor" / "team lead" | Supervisor |
| Default | Employee |

---

## Backend API

The frontend communicates with a PHP REST API hosted at:
```
https://join.rcsfacility.com/api/ess/
```

### ESS Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/login.php` | Authenticate with mobile + PIN |
| GET | `/attendance.php` | Fetch attendance records |
| POST | `/attendance.php` | Check in (with location) |
| PUT | `/attendance.php` | Check out |
| GET | `/leaves.php` | List leaves / balance |
| POST | `/leaves.php` | Apply for leave |
| PUT | `/leaves.php` | Approve/reject leave |
| GET | `/tasks.php` | List tasks |
| POST | `/tasks.php` | Create task |
| PUT | `/tasks.php` | Update task |
| GET | `/expenses.php` | List expenses |
| POST | `/expenses.php` | Submit expense |
| PUT | `/expenses.php` | Approve/reject expense |
| GET | `/helpdesk.php` | List tickets |
| POST | `/helpdesk.php` | Create ticket |
| GET | `/announcements.php` | List announcements |
| POST | `/announcements.php` | Post announcement |
| GET | `/filters.php` | Profile, clients, units |
| GET | `/employees.php` | Employee directory |
| POST | `/pin.php` | Change login PIN |

---

## Getting Started

### Prerequisites

- **Bun** (recommended) or Node.js 18+
- Git

### Install & Run

```bash
# Clone the repository
git clone https://github.com/rcstrue/RCS_ESS.git
cd RCS_ESS

# Install dependencies
bun install

# Start development server (port 8080)
bun run dev

# Build for production
bun run build

# Lint code
bun run lint
```

### Environment

No environment variables are required for the frontend — the API base URL and key are embedded in `src/lib/api/config.ts`. For the PHP backend, the server's `config.php` contains database credentials and should **never be overwritten**.

---

## Deployment

Automated via **GitHub Actions** on push to `main`:

1. Checkout code
2. Setup Bun
3. Install dependencies (`bun install`)
4. Build (`bun run build`)
5. Upload `dist/` to server via FTP (lftp mirror)

### FTP Secrets Required

| Secret | Description |
|--------|-------------|
| `FTP_HOST` | Server hostname |
| `FTP_USER` | FTP username |
| `FTP_PASS` | FTP password |

---

## Important Notes

- **`employee_id` is `VARCHAR(50)`** — never use `intval()` or bind type `'i'` in PHP
- **`config.php` on server** has real DB credentials — must NEVER be overwritten
- **Service worker** (`sw.js`) handles PWA caching — update the cache version constant to force client refresh
- **Expense menu** is visible only to managers/admins, not regular employees
- **Announcement visibility**: "All" = poster's allocated unit employees + all managers/admins; "Managers" = managers only; "Admin" = admins only
- **Dark mode** toggle is available in ESS Settings

---

## License

Private — RCS Facility Services Pvt. Ltd. All rights reserved.
