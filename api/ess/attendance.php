<?php
/**
 * RCS ESS - Attendance API
 * GET:  List attendance records
 * POST: Check in
 * PUT:  Check out
 *
 * DB Schema: ess_attendance.employee_id is VARCHAR(50), NOT int!
 */

@require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

$conn = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':  handleGet($conn);  break;
        case 'POST': handlePost($conn); break;
        case 'PUT':  handlePut($conn);  break;
        default:     jsonError('Method not allowed. Use GET, POST, or PUT.', 405);
    }
} catch (Exception $e) {
    jsonError('Server error: ' . $e->getMessage(), 500);
}

// ============================================================================
// GET - List Attendance Records
// ============================================================================
function handleGet($conn) {
    $employeeId = getQueryParam('employee_id');
    $month      = getQueryParam('month');
    $status     = getQueryParam('status');

    if (!$employeeId) {
        jsonError('employee_id is required', 400);
    }

    // employee_id is VARCHAR(50) in ess_attendance
    $where  = ['a.employee_id = ?'];
    $params = [$employeeId];
    $types  = 's';

    if ($month && preg_match('/^\d{4}-\d{2}$/', $month)) {
        $startDate = $month . '-01';
        $endDate   = date('Y-m-t', strtotime($startDate));
        $where[] = 'a.date BETWEEN ? AND ?';
        $params[] = $startDate;
        $params[] = $endDate;
        $types .= 'ss';
    }

    if ($status) {
        $where[] = 'a.status = ?';
        $params[] = $status;
        $types .= 's';
    }

    $whereClause = implode(' AND ', $where);
    $pag = getPaginationParams();

    $countSql = "SELECT COUNT(*) as total FROM ess_attendance a WHERE {$whereClause}";
    $dataSql  = "SELECT a.*, e.full_name, e.designation, u.name as unit_name
                 FROM ess_attendance a
                 LEFT JOIN employees e ON a.employee_id = e.id
                 LEFT JOIN units u ON e.unit_id = u.id
                 WHERE {$whereClause}
                 ORDER BY a.date DESC
                 LIMIT ? OFFSET ?";

    safePaginatedSelect($conn, $countSql, $dataSql, $params, $types, $pag['page'], $pag['limit']);
}

// ============================================================================
// POST - Check In
// ============================================================================
function handlePost($conn) {
    $data = getJsonInput();

    // employee_id is VARCHAR(50) in ess_attendance
    $employeeId = getRequiredParam($data, 'employee_id');

    // Handle location: frontend sends "lat, lng" string
    $location   = isset($data['location']) ? $data['location'] : null;
    $latitude   = isset($data['latitude']) ? floatval($data['latitude']) : null;
    $longitude  = isset($data['longitude']) ? floatval($data['longitude']) : null;
    $note       = isset($data['note']) ? $data['note'] : null;

    // Parse location string "lat, lng" if lat/lng not provided separately
    if (($latitude === null || $longitude === null) && $location && strpos($location, ',') !== false) {
        $parts = array_map('trim', explode(',', $location, 2));
        if (count($parts) === 2 && is_numeric($parts[0]) && is_numeric($parts[1])) {
            $latitude  = floatval($parts[0]);
            $longitude = floatval($parts[1]);
        }
    }

    // Use location as note if note is empty
    if (empty($note) && !empty($location)) {
        $note = $location;
    }

    $today = date('Y-m-d');

    // Check if already checked in today
    $stmt = $conn->prepare("SELECT * FROM ess_attendance WHERE employee_id = ? AND date = ?");
    safeBindParam($stmt, 'ss', [$employeeId, $today]);
    $stmt->execute();
    $result = $stmt->get_result();
    $existing = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    if ($existing) {
        jsonError('Already checked in today. Use check-out to mark departure.', 400);
    }

    // Determine status: 'checked_in' for on-time, 'late' if after 09:30
    $now = new DateTime();
    $checkInDeadline = new DateTime($today . ' 09:30:00');
    $status = ($now > $checkInDeadline) ? 'late' : 'checked_in';

    // Try INSERT with all columns first, fall back to minimal if columns don't exist
    $insertSuccess = false;
    $insertError = null;

    // Try full INSERT with lat/lng
    $sql = "INSERT INTO ess_attendance (employee_id, date, check_in, status, latitude, longitude, note, created_at, updated_at)
            VALUES (?, ?, NOW(), ?, ?, ?, ?, NOW(), NOW())";
    $stmt = $conn->prepare($sql);
    if ($stmt) {
        safeBindParam($stmt, 'sssdds', [$employeeId, $today, $status, $latitude, $longitude, $note]);
        try {
            $stmt->execute();
            $insertSuccess = true;
        } catch (Exception $e) {
            $insertError = $e->getMessage();
        }
        $stmt->close();
    } else {
        $insertError = $conn->error;
    }

    // Fallback: INSERT without lat/lng/note if columns don't exist
    if (!$insertSuccess) {
        $sql2 = "INSERT INTO ess_attendance (employee_id, date, check_in, status, created_at, updated_at)
                 VALUES (?, ?, NOW(), ?, NOW(), NOW())";
        $stmt2 = $conn->prepare($sql2);
        if ($stmt2) {
            safeBindParam($stmt2, 'ss', [$employeeId, $today, $status]);
            $stmt2->execute();
            $insertSuccess = true;
            $stmt2->close();
        }
    }

    if (!$insertSuccess) {
        jsonError('Failed to create attendance record: ' . ($insertError ?: 'Unknown error'), 500);
    }

    $attendanceId = $conn->insert_id;

    // Fetch created record
    $stmt = $conn->prepare("SELECT a.*, e.full_name, e.designation, u.name as unit_name
                            FROM ess_attendance a
                            LEFT JOIN employees e ON a.employee_id = e.id
                            LEFT JOIN units u ON e.unit_id = u.id
                            WHERE a.id = ?");
    safeBindParam($stmt, 'i', [$attendanceId]);
    $stmt->execute();
    $result = $stmt->get_result();
    $record = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    jsonSuccess($record, 'Checked in successfully');
}

// ============================================================================
// PUT - Check Out
// ============================================================================
function handlePut($conn) {
    $data = getJsonInput();

    $id = intval(getRequiredParam($data, 'id'));

    // Get existing record
    $stmt = $conn->prepare("SELECT * FROM ess_attendance WHERE id = ?");
    safeBindParam($stmt, 'i', [$id]);
    $stmt->execute();
    $result = $stmt->get_result();
    $attendance = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    if (!$attendance) {
        jsonError('Attendance record not found', 404);
    }

    if ($attendance['check_out']) {
        jsonError('Already checked out', 400);
    }

    $stmt = $conn->prepare("UPDATE ess_attendance SET check_out = NOW(), status = 'checked_out', updated_at = NOW() WHERE id = ?");
    safeBindParam($stmt, 'i', [$id]);
    $stmt->execute();
    $stmt->close();

    // Fetch updated record
    $stmt = $conn->prepare("SELECT a.*, e.full_name, e.designation, u.name as unit_name
                            FROM ess_attendance a
                            LEFT JOIN employees e ON a.employee_id = e.id
                            LEFT JOIN units u ON e.unit_id = u.id
                            WHERE a.id = ?");
    safeBindParam($stmt, 'i', [$id]);
    $stmt->execute();
    $result = $stmt->get_result();
    $record = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    jsonSuccess($record, 'Checked out successfully');
}
