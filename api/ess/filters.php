<?php
/**
 * RCS ESS - Filters & Profile API
 * GET:  Various filter views (clients, units, profile, etc.)
 *
 * DB Schema:
 * - clients table: has is_active (tinyint), NO status column
 * - units table: has is_active (tinyint), NO status column
 * - ess_attendance.employee_id is VARCHAR(50), NOT int!
 * - ess_leave_balances.employee_id is VARCHAR(50), NOT int!
 * - employees table: has state, district, NO city column
 */

require_once __DIR__ . '/cors.php';
@require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

$conn = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET') {
    jsonError('Method not allowed. Use GET.', 405);
}

$view       = getQueryParam('view');
$employeeId = getQueryParam('employee_id');
$scope      = getQueryParam('scope');
$requesterId = getQueryParam('requester_id');
$clientId   = getQueryParam('client_id');

switch ($view) {
    case 'profile':
        handleProfile($conn, $employeeId);
        break;
    case 'clients':
        handleClients($conn, $scope, $requesterId);
        break;
    case 'units':
        handleUnits($conn, $scope, $requesterId, $clientId);
        break;
    default:
        jsonError('Invalid view. Allowed: profile, clients, units', 400);
}

// ============================================================================
// View: Profile
// ============================================================================
function handleProfile($conn, $employeeId) {
    if (!$employeeId) {
        jsonError('employee_id is required for profile view', 400);
    }

    $empId = intval($employeeId);  // employees.id is int

    // Get employee details
    $stmt = $conn->prepare("SELECT * FROM employees WHERE id = ?");
    safeBindParam($stmt, 'i', [$empId]);
    $stmt->execute();
    $result   = $stmt->get_result();
    $employee = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    if (!$employee) {
        jsonError('Employee not found', 404);
    }

    // Remove sensitive fields
    unset($employee['pin']);

    // Attendance summary (current month) — employee_id is VARCHAR(50)
    $currentMonth = date('Y-m');
    $stmt = $conn->prepare("SELECT
        COUNT(*) as total_days,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_days,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_days,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late_days,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave_days
    FROM ess_attendance WHERE employee_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?");
    safeBindParam($stmt, 'ss', [$employeeId, $currentMonth]);
    $stmt->execute();
    $result = $stmt->get_result();
    $summary = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    $attendanceSummary = [
        'total_days'  => intval($summary['total_days'] ?? 0),
        'present_days' => intval($summary['present_days'] ?? 0),
        'absent_days'  => intval($summary['absent_days'] ?? 0),
        'late_days'    => intval($summary['late_days'] ?? 0),
        'leave_days'   => intval($summary['leave_days'] ?? 0),
    ];

    // Leave balances (current year) — employee_id is VARCHAR(50), year is CHAR(4)
    $year = date('Y');
    $stmt = $conn->prepare("SELECT * FROM ess_leave_balances WHERE employee_id = ? AND year = ? ORDER BY leave_type");
    safeBindParam($stmt, 'ss', [$employeeId, $year]);
    $stmt->execute();
    $result = $stmt->get_result();
    $leaveBalance = [];
    while ($row = $result->fetch_assoc()) {
        $leaveBalance[] = $row;
    }
    $result->free();
    $stmt->close();

    // Pending leaves — employee_id is VARCHAR(50)
    $stmt = $conn->prepare("SELECT * FROM ess_leaves WHERE employee_id = ? AND status = 'pending' ORDER BY created_at DESC");
    safeBindParam($stmt, 's', [$employeeId]);
    $stmt->execute();
    $result = $stmt->get_result();
    $pendingLeaves = [];
    while ($row = $result->fetch_assoc()) {
        $pendingLeaves[] = $row;
    }
    $result->free();
    $stmt->close();

    // Recent attendance (last 7 records) — employee_id is VARCHAR(50)
    $stmt = $conn->prepare("SELECT date, check_in, check_out, status FROM ess_attendance WHERE employee_id = ? ORDER BY date DESC LIMIT 7");
    safeBindParam($stmt, 's', [$employeeId]);
    $stmt->execute();
    $result = $stmt->get_result();
    $recentAttendance = [];
    while ($row = $result->fetch_assoc()) {
        $recentAttendance[] = $row;
    }
    $result->free();
    $stmt->close();

    jsonSuccess([
        'employee'           => $employee,
        'attendance_summary' => $attendanceSummary,
        'leave_balance'      => $leaveBalance,
        'pending_leaves'     => $pendingLeaves,
        'recent_attendance'  => $recentAttendance,
    ], 'Profile loaded');
}

// ============================================================================
// View: Clients
// DB: clients table has is_active (tinyint), NO status column
// ============================================================================
function handleClients($conn, $scope, $requesterId) {
    // Return active clients ordered by name
    $sql = "SELECT id, client_code, name, city, state FROM clients WHERE is_active = 1 ORDER BY name";
    $stmt = $conn->prepare($sql);
    $stmt->execute();
    $result = $stmt->get_result();
    $clients = [];
    while ($row = $result->fetch_assoc()) {
        $clients[] = $row;
    }
    $result->free();
    $stmt->close();

    jsonSuccess($clients);
}

// ============================================================================
// View: Units
// DB: units table has is_active (tinyint), NO status column
// ============================================================================
function handleUnits($conn, $scope, $requesterId, $clientId) {
    $params = [];
    $types  = '';
    $where  = ['is_active = 1'];

    if ($clientId) {
        $where[] = 'u.client_id = ?';
        $params[] = intval($clientId);
        $types .= 'i';
    }

    $whereClause = implode(' AND ', $where);

    $sql = "SELECT u.id, u.unit_code, u.name, u.city, u.state, u.client_id, c.name as client_name
            FROM units u
            LEFT JOIN clients c ON u.client_id = c.id
            WHERE {$whereClause}
            ORDER BY u.name";

    $stmt = $conn->prepare($sql);
    if (!empty($params)) {
        safeBindParam($stmt, $types, $params);
    }
    $stmt->execute();
    $result = $stmt->get_result();
    $units = [];
    while ($row = $result->fetch_assoc()) {
        $units[] = $row;
    }
    $result->free();
    $stmt->close();

    jsonSuccess($units);
}
