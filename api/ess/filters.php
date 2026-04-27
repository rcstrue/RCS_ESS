<?php
/**
 * ESS API — Filters / Profile Endpoint
 * Uses `view` query param to determine action:
 *   view=profile    — Employee profile + attendance summary + leave balance + recent attendance
 *   view=clients    — Clients list filtered by scope
 *   view=units      — Units list filtered by scope and client_id
 *   view=balance    — Leave balances for employee
 *   view=employees  — Paginated employee directory (search, filter)
 */

require_once __DIR__ . '/config.php';

try {
    validateApiKey();

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        jsonOutput(['success' => false, 'error' => 'Method not allowed. Use GET.'], 405);
    }

    $view = $_GET['view'] ?? 'profile';

    switch ($view) {
        case 'profile':
            _handleProfile();
            break;
        case 'clients':
            _handleClients();
            break;
        case 'units':
            _handleUnits();
            break;
        case 'balance':
            _handleBalance();
            break;
        case 'employees':
            _handleEmployeeDirectory();
            break;
        default:
            jsonOutput(['success' => false, 'error' => 'Invalid view parameter'], 400);
    }
} catch (Throwable $e) {
    essLog('FATAL filters: ' . $e->getMessage());
    jsonOutput(['success' => false, 'error' => 'Internal server error'], 500);
}

// ─── view=profile: Employee Profile ───────────────────────────────────────────

function _handleProfile(): void
{
    $employeeId = requireAuth();
    $conn = getDbConnection();

    // Fetch employee profile with joins — USE TABLE ALIASES for ALL columns
    $stmt = $conn->prepare('
        SELECT
            e.id AS employee_id,
            e.full_name,
            e.mobile_number,
            e.email,
            e.designation,
            e.department,
            e.district AS emp_city,
            e.state AS emp_state,
            e.date_of_joining,
            e.employee_code,
            e.profile_pic_url,
            e.date_of_birth,
            e.gender,
            e.employee_role,
            e.app_role,
            e.worker_category,
            e.status AS emp_status,
            ec.role AS cache_role,
            ec.unit_id,
            ec.unit_name,
            ec.client_name,
            ec.client_id
        FROM employees e
        LEFT JOIN ess_employee_cache ec ON ec.employee_id = CAST(e.id AS CHAR)
        WHERE e.id = ? AND e.status = ?
    ');
    $approvedStatus = 'approved';
    $intId = (int)$employeeId;
    $stmt->bind_param('is', $intId, $approvedStatus);
    $stmt->execute();
    $employee = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$employee) {
        jsonOutput(['success' => false, 'error' => 'Employee profile not found'], 404);
    }

    // ─── Attendance Summary (current month) ───────────────────────────────
    $currentMonth = date('Y-m');
    $monthStart = $currentMonth . '-01';
    $monthEnd = $currentMonth . '-31';

    $attStmt = $conn->prepare('
        SELECT
            COUNT(*) AS total_days,
            SUM(CASE WHEN status IN (\'present\', \'late\', \'half_day\') THEN 1 ELSE 0 END) AS total_present,
            SUM(CASE WHEN status = \'absent\' THEN 1 ELSE 0 END) AS total_absent,
            SUM(CASE WHEN status = \'leave\' THEN 1 ELSE 0 END) AS total_leave,
            SUM(CASE WHEN status = \'late\' THEN 1 ELSE 0 END) AS total_late
        FROM ess_attendance
        WHERE employee_id = ? AND date BETWEEN ? AND ?
    ');
    $attStmt->bind_param('sss', $employeeId, $monthStart, $monthEnd);
    $attStmt->execute();
    $attSummary = $attStmt->get_result()->fetch_assoc();
    $attStmt->close();

    // ─── Leave Balances ───────────────────────────────────────────────────
    $lbStmt = $conn->prepare('
        SELECT leave_type, total, used, balance, year
        FROM ess_leave_balances
        WHERE employee_id = ? AND year = ?
        ORDER BY leave_type
    ');
    $currentYear = date('Y');
    $lbStmt->bind_param('ss', $employeeId, $currentYear);
    $lbStmt->execute();
    $lbResult = $lbStmt->get_result();
    $leaveBalances = [];
    while ($row = $lbResult->fetch_assoc()) {
        $leaveBalances[] = [
            'type' => $row['leave_type'],
            'total' => (float)$row['total'],
            'used' => (float)$row['used'],
            'balance' => (float)$row['balance'],
            'year' => $row['year'],
        ];
    }
    $lbStmt->close();

    // ─── Recent Attendance (last 7 records) ───────────────────────────────
    $recentStmt = $conn->prepare('
        SELECT id, date, check_in, check_out, status
        FROM ess_attendance
        WHERE employee_id = ?
        ORDER BY date DESC, check_in DESC
        LIMIT 7
    ');
    $recentStmt->bind_param('s', $employeeId);
    $recentStmt->execute();
    $recentResult = $recentStmt->get_result();
    $recentAttendance = [];
    while ($row = $recentResult->fetch_assoc()) {
        $recentAttendance[] = [
            'id' => (int)$row['id'],
            'date' => $row['date'],
            'check_in' => $row['check_in'],
            'check_out' => $row['check_out'],
            'status' => $row['status'],
        ];
    }
    $recentStmt->close();

    // ─── Today's Attendance ───────────────────────────────────────────────
    $today = date('Y-m-d');
    $todayStmt = $conn->prepare('
        SELECT id, check_in, check_out, status
        FROM ess_attendance
        WHERE employee_id = ? AND date = ?
        ORDER BY check_in DESC LIMIT 1
    ');
    $todayStmt->bind_param('ss', $employeeId, $today);
    $todayStmt->execute();
    $todayRecord = $todayStmt->get_result()->fetch_assoc();
    $todayStmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'employee' => [
                'employee_id' => (string)$employee['employee_id'],
                'full_name' => $employee['full_name'],
                'mobile_number' => $employee['mobile_number'],
                'email' => $employee['email'] ?? '',
                'designation' => $employee['designation'] ?? '',
                'department' => $employee['department'] ?? '',
                'city' => $employee['emp_city'] ?? '',
                'state' => $employee['emp_state'] ?? '',
                'date_of_joining' => $employee['date_of_joining'] ?? '',
                'employee_code' => $employee['employee_code'] ?? '',
                'profile_pic_url' => $employee['profile_pic_url'] ?? '',
                'gender' => $employee['gender'] ?? '',
                'role' => $employee['cache_role'] ?? 'employee',
                'unit_name' => $employee['unit_name'] ?? '',
                'client_name' => $employee['client_name'] ?? '',
            ],
            'today_attendance' => $todayRecord ? [
                'id' => (int)$todayRecord['id'],
                'check_in' => $todayRecord['check_in'],
                'check_out' => $todayRecord['check_out'],
                'status' => $todayRecord['status'],
            ] : null,
            'attendance_summary' => [
                'month' => $currentMonth,
                'total_days' => (int)($attSummary['total_days'] ?? 0),
                'total_present' => (int)($attSummary['total_present'] ?? 0),
                'total_absent' => (int)($attSummary['total_absent'] ?? 0),
                'total_leave' => (int)($attSummary['total_leave'] ?? 0),
                'total_late' => (int)($attSummary['total_late'] ?? 0),
            ],
            'leave_balances' => $leaveBalances,
            'recent_attendance' => $recentAttendance,
        ]
    ]);
}

// ─── view=clients: Clients List ───────────────────────────────────────────────

function _handleClients(): void
{
    requireAuth();
    $conn = getDbConnection();

    $scope = $_GET['scope'] ?? 'all';
    $search = trim($_GET['q'] ?? '');

    $query = 'SELECT id, client_code, name, is_active FROM clients WHERE 1=1';
    $types = '';
    $params = [];

    // If search is provided, filter by name
    if (!empty($search)) {
        $query .= ' AND name LIKE ?';
        $types .= 's';
        $params[] = '%' . $search . '%';
    }

    // Active only if not explicitly requesting all
    if ($scope !== 'all') {
        $query .= ' AND is_active = 1';
    }

    $query .= ' ORDER BY name ASC';

    $stmt = $conn->prepare($query);
    if (!empty($params)) {
        $stmt->bind_param($types, ...$params);
    }
    $stmt->execute();
    $result = $stmt->get_result();

    $clients = [];
    while ($row = $result->fetch_assoc()) {
        $clients[] = [
            'id' => (int)$row['id'],
            'client_code' => $row['client_code'] ?? '',
            'name' => $row['name'],
            'is_active' => (int)$row['is_active'] === 1,
        ];
    }
    $stmt->close();

    jsonOutput(['success' => true, 'data' => $clients]);
}

// ─── view=units: Units List ───────────────────────────────────────────────────

function _handleUnits(): void
{
    requireAuth();
    $conn = getDbConnection();

    $clientId = $_GET['client_id'] ?? '';
    $scope = $_GET['scope'] ?? 'all';

    $query = 'SELECT u.id, u.client_id, u.name, u.city, u.state, u.is_active, c.name AS client_name
              FROM units u
              LEFT JOIN clients c ON c.id = u.client_id
              WHERE 1=1';
    $types = '';
    $params = [];

    if (!empty($clientId)) {
        $query .= ' AND u.client_id = ?';
        $types .= 'i';
        $params[] = (int)$clientId;
    }

    if ($scope !== 'all') {
        $query .= ' AND u.is_active = 1';
    }

    $query .= ' ORDER BY u.name ASC';

    $stmt = $conn->prepare($query);
    if (!empty($params)) {
        $stmt->bind_param($types, ...$params);
    }
    $stmt->execute();
    $result = $stmt->get_result();

    $units = [];
    while ($row = $result->fetch_assoc()) {
        $units[] = [
            'id' => (int)$row['id'],
            'client_id' => (int)$row['client_id'],
            'client_name' => $row['client_name'] ?? '',
            'name' => $row['name'],
            'city' => $row['city'] ?? '',
            'state' => $row['state'] ?? '',
            'is_active' => (int)$row['is_active'] === 1,
        ];
    }
    $stmt->close();

    jsonOutput(['success' => true, 'data' => $units]);
}

// ─── view=balance: Leave Balances ─────────────────────────────────────────────

function _handleBalance(): void
{
    $employeeId = requireAuth();
    $conn = getDbConnection();

    $year = $_GET['year'] ?? date('Y');

    $stmt = $conn->prepare('
        SELECT leave_type, total, used, balance, year
        FROM ess_leave_balances
        WHERE employee_id = ? AND year = ?
        ORDER BY leave_type
    ');
    $stmt->bind_param('ss', $employeeId, $year);
    $stmt->execute();
    $result = $stmt->get_result();

    $balances = [];
    while ($row = $result->fetch_assoc()) {
        $balances[] = [
            'type' => $row['leave_type'],
            'total' => (float)$row['total'],
            'used' => (float)$row['used'],
            'balance' => (float)$row['balance'],
            'year' => $row['year'],
        ];
    }
    $stmt->close();

    jsonOutput(['success' => true, 'data' => $balances]);
}

// ─── view=employees: Employee Directory ───────────────────────────────────────

function _handleEmployeeDirectory(): void
{
    $authEmployeeId = requireAuth();
    $conn = getDbConnection();

    $search = trim($_GET['q'] ?? '');
    $clientId = $_GET['client_id'] ?? '';
    $unitId = $_GET['unit_id'] ?? '';
    $department = $_GET['department'] ?? '';
    [$page, $limit, $offset] = getPaginationParams();

    // Build base query with table aliases to avoid ambiguity
    $whereClause = 'WHERE e.status = ?';
    $types = 's';
    $params = [$approvedStatus = 'approved'];

    if (!empty($search)) {
        $whereClause .= ' AND (e.full_name LIKE ? OR e.employee_code LIKE ? OR e.mobile_number LIKE ?)';
        $types .= 'sss';
        $searchTerm = '%' . $search . '%';
        $params[] = $searchTerm;
        $params[] = $searchTerm;
        $params[] = $searchTerm;
    }

    if (!empty($clientId)) {
        $whereClause .= ' AND e.client_id = ?';
        $types .= 'i';
        $params[] = (int)$clientId;
    }

    if (!empty($unitId)) {
        $whereClause .= ' AND e.unit_id = ?';
        $types .= 'i';
        $params[] = (int)$unitId;
    }

    if (!empty($department)) {
        $whereClause .= ' AND e.department = ?';
        $types .= 's';
        $params[] = $department;
    }

    // Count query
    $countQuery = "SELECT COUNT(*) AS total FROM employees e {$whereClause}";
    $countStmt = $conn->prepare($countQuery);
    if (!empty($params)) {
        $countStmt->bind_param($types, ...$params);
    }
    $countStmt->execute();
    $totalRow = $countStmt->get_result()->fetch_assoc();
    $total = (int)($totalRow['total'] ?? 0);
    $countStmt->close();

    // Data query with JOINs — all columns use aliases
    $dataQuery = "
        SELECT
            e.id AS emp_id,
            e.full_name,
            e.mobile_number,
            e.email,
            e.designation,
            e.department,
            e.employee_code,
            e.profile_pic_url,
            e.district AS emp_city,
            e.state AS emp_state,
            e.date_of_joining,
            e.employee_role,
            e.status AS emp_status,
            c.name AS client_name,
            u.name AS unit_name
        FROM employees e
        LEFT JOIN clients c ON c.id = e.client_id
        LEFT JOIN units u ON u.id = e.unit_id
        {$whereClause}
        ORDER BY e.full_name ASC
        LIMIT ? OFFSET ?
    ";

    $dataTypes = $types . 'ii';
    $dataParams = [...$params, $limit, $offset];

    $stmt = $conn->prepare($dataQuery);
    $stmt->bind_param($dataTypes, ...$dataParams);
    $stmt->execute();
    $result = $stmt->get_result();

    $employees = [];
    while ($row = $result->fetch_assoc()) {
        $employees[] = [
            'employee_id' => (string)$row['emp_id'],
            'full_name' => $row['full_name'],
            'mobile_number' => $row['mobile_number'],
            'email' => $row['email'] ?? '',
            'designation' => $row['designation'] ?? '',
            'department' => $row['department'] ?? '',
            'employee_code' => $row['employee_code'] ?? '',
            'profile_pic_url' => $row['profile_pic_url'] ?? '',
            'city' => $row['emp_city'] ?? '',
            'state' => $row['emp_state'] ?? '',
            'date_of_joining' => $row['date_of_joining'] ?? '',
            'employee_role' => $row['employee_role'] ?? '',
            'status' => $row['emp_status'] ?? '',
            'client_name' => $row['client_name'] ?? '',
            'unit_name' => $row['unit_name'] ?? '',
        ];
    }
    $stmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'items' => $employees,
            ...buildPagination($total, $page, $limit)
        ]
    ]);
}
