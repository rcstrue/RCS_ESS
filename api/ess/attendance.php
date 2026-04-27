<?php
/**
 * ESS API — Attendance Endpoint
 * GET:    Fetch attendance records with pagination and summary
 * POST:   Check-in (create new attendance record for today)
 * PUT:    Check-out (update existing attendance record)
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    validateApiKey();

    switch ($method) {
        case 'GET':
            _handleGetAttendance();
            break;
        case 'POST':
            _handleCheckIn();
            break;
        case 'PUT':
            _handleCheckOut();
            break;
        default:
            jsonOutput(['success' => false, 'error' => 'Method not allowed'], 405);
    }
} catch (Exception $e) {
    jsonOutput(['success' => false, 'error' => 'Internal server error'], 500);
}

// ─── GET: Fetch Attendance Records ────────────────────────────────────────────

function _handleGetAttendance(): void
{
    $employeeId = requireAuth();
    $conn = getDbConnection();

    // Query params: employee_id (for managers viewing others), month (YYYY-MM), page, limit
    $queryEmployeeId = $_GET['employee_id'] ?? $employeeId;
    $month = $_GET['month'] ?? date('Y-m');
    [$page, $limit, $offset] = getPaginationParams();

    // Validate month format
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        jsonOutput(['success' => false, 'error' => 'Invalid month format. Use YYYY-MM'], 400);
    }

    // Month range
    $startDate = $month . '-01';
    $endDate = $month . '-31';

    // Get total count
    $countStmt = $conn->prepare('
        SELECT COUNT(*) AS total FROM ess_attendance
        WHERE employee_id = ? AND date BETWEEN ? AND ?
    ');
    $countStmt->bind_param('sss', $queryEmployeeId, $startDate, $endDate);
    $countStmt->execute();
    $totalRow = $countStmt->get_result()->fetch_assoc();
    $total = (int)($totalRow['total'] ?? 0);
    $countStmt->close();

    // Fetch records
    $stmt = $conn->prepare('
        SELECT id, employee_id, date, check_in, check_out, status,
               latitude, longitude, note, created_at, updated_at
        FROM ess_attendance
        WHERE employee_id = ? AND date BETWEEN ? AND ?
        ORDER BY date DESC, check_in DESC
        LIMIT ? OFFSET ?
    ');
    $stmt->bind_param('sssii', $queryEmployeeId, $startDate, $endDate, $limit, $offset);
    $stmt->execute();
    $result = $stmt->get_result();

    $records = [];
    while ($row = $result->fetch_assoc()) {
        // Build location string from lat/lng
        $location = null;
        if (!empty($row['latitude']) && !empty($row['longitude'])) {
            $location = round((float)$row['latitude'], 4) . ', ' . round((float)$row['longitude'], 4);
        }
        $records[] = [
            'id' => (int)$row['id'],
            'employee_id' => $row['employee_id'],
            'date' => $row['date'],
            'check_in' => $row['check_in'],
            'check_out' => $row['check_out'],
            'status' => $row['status'],
            'latitude' => $row['latitude'] ? (float)$row['latitude'] : null,
            'longitude' => $row['longitude'] ? (float)$row['longitude'] : null,
            'location' => $location,
            'note' => $row['note'] ?? '',
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }
    $stmt->close();

    // ─── Monthly Summary ──────────────────────────────────────────────────
    $summary = _getAttendanceSummary($conn, $queryEmployeeId, $startDate, $endDate);

    jsonOutput([
        'success' => true,
        'data' => [
            'items' => $records,
            'summary' => $summary,
            ...buildPagination($total, $page, $limit)
        ]
    ]);
}

/**
 * Calculate attendance summary for a month
 */
function _getAttendanceSummary(mysqli $conn, string $employeeId, string $startDate, string $endDate): array
{
    $stmt = $conn->prepare('
        SELECT
            COUNT(*) AS total_days,
            SUM(CASE WHEN status IN (\'present\', \'late\', \'half_day\') THEN 1 ELSE 0 END) AS total_present,
            SUM(CASE WHEN status = \'absent\' THEN 1 ELSE 0 END) AS total_absent,
            SUM(CASE WHEN status = \'leave\' THEN 1 ELSE 0 END) AS total_leave,
            SUM(CASE WHEN status = \'holiday\' THEN 1 ELSE 0 END) AS total_holiday,
            SUM(CASE WHEN status = \'late\' THEN 1 ELSE 0 END) AS total_late
        FROM ess_attendance
        WHERE employee_id = ? AND date BETWEEN ? AND ?
    ');
    $stmt->bind_param('sss', $employeeId, $startDate, $endDate);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return [
        'total_days' => (int)($row['total_days'] ?? 0),
        'total_present' => (int)($row['total_present'] ?? 0),
        'total_absent' => (int)($row['total_absent'] ?? 0),
        'total_leave' => (int)($row['total_leave'] ?? 0),
        'total_holiday' => (int)($row['total_holiday'] ?? 0),
        'total_late' => (int)($row['total_late'] ?? 0),
    ];
}

// ─── POST: Check-In ───────────────────────────────────────────────────────────

function _handleCheckIn(): void
{
    $employeeId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    $today = date('Y-m-d');
    $currentTime = date('H:i:s');

    // Check if already checked in today
    $checkStmt = $conn->prepare('
        SELECT id, check_in, check_out, status FROM ess_attendance
        WHERE employee_id = ? AND date = ?
        ORDER BY check_in DESC LIMIT 1
    ');
    $checkStmt->bind_param('ss', $employeeId, $today);
    $checkStmt->execute();
    $existing = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if ($existing) {
        // Return existing record — already checked in
        jsonOutput([
            'success' => false,
            'error' => 'Already checked in today',
            'data' => [
                'id' => (int)$existing['id'],
                'date' => $today,
                'check_in' => $existing['check_in'],
                'check_out' => $existing['check_out'],
                'status' => $existing['status'],
            ]
        ], 409);
    }

    // Determine status based on check-in time (after 10:00 AM = late)
    $status = 'present';
    $hour = (int)date('H');
    $minute = (int)date('i');
    if ($hour > 10 || ($hour === 10 && $minute > 0)) {
        $status = 'late';
    }

    // Get location from input if provided
    // Accept both { latitude, longitude } and { location: "lat, lng" }
    $latitude = isset($input['latitude']) ? (float)$input['latitude'] : null;
    $longitude = isset($input['longitude']) ? (float)$input['longitude'] : null;
    if (!$latitude && !$longitude && !empty($input['location'])) {
        $parts = explode(',', $input['location']);
        if (count($parts) >= 2) {
            $latitude = (float)trim($parts[0]);
            $longitude = (float)trim($parts[1]);
        }
    }
    $note = trim($input['note'] ?? '');

    // Build location string for response
    $locationStr = null;
    if ($latitude !== null && $longitude !== null) {
        $locationStr = round($latitude, 4) . ', ' . round($longitude, 4);
    }

    // Insert attendance record
    $insertStmt = $conn->prepare('
        INSERT INTO ess_attendance (employee_id, date, check_in, status, latitude, longitude, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');
    $insertStmt->bind_param('sssssds',
        $employeeId, $today, $currentTime, $status, $latitude, $longitude, $note
    );
    $insertStmt->execute();
    $newId = $insertStmt->insert_id;
    $insertStmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $newId,
            'employee_id' => $employeeId,
            'date' => $today,
            'check_in' => $currentTime,
            'check_out' => null,
            'status' => $status,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'location' => $locationStr,
            'message' => 'Checked in successfully'
        ]
    ]);
}

// ─── PUT: Check-Out ───────────────────────────────────────────────────────────

function _handleCheckOut(): void
{
    $employeeId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    $attendanceId = (int)($input['id'] ?? 0);
    if ($attendanceId <= 0) {
        jsonOutput(['success' => false, 'error' => 'Attendance record ID is required'], 400);
    }

    $currentTime = date('H:i:s');

    // Verify the record belongs to this employee and doesn't have check_out yet
    $checkStmt = $conn->prepare('
        SELECT id, employee_id, date, check_in, check_out, status
        FROM ess_attendance WHERE id = ? AND employee_id = ?
    ');
    $checkStmt->bind_param('is', $attendanceId, $employeeId);
    $checkStmt->execute();
    $record = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if (!$record) {
        jsonOutput(['success' => false, 'error' => 'Attendance record not found'], 404);
    }

    if (!empty($record['check_out'])) {
        jsonOutput([
            'success' => false,
            'error' => 'Already checked out for this record',
            'data' => [
                'id' => (int)$record['id'],
                'date' => $record['date'],
                'check_in' => $record['check_in'],
                'check_out' => $record['check_out'],
            ]
        ], 409);
    }

    // Update with check_out time
    $updateStmt = $conn->prepare('
        UPDATE ess_attendance SET check_out = ?, updated_at = NOW() WHERE id = ?
    ');
    $updateStmt->bind_param('si', $currentTime, $attendanceId);
    $updateStmt->execute();
    $updateStmt->close();

    // Calculate worked hours
    $checkIn = strtotime($record['check_in']);
    $checkOut = strtotime($currentTime);
    $hoursWorked = round(($checkOut - $checkIn) / 3600, 2);

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $attendanceId,
            'employee_id' => $employeeId,
            'date' => $record['date'],
            'check_in' => $record['check_in'],
            'check_out' => $currentTime,
            'hours_worked' => $hoursWorked,
            'status' => $record['status'],
            'message' => 'Checked out successfully'
        ]
    ]);
}
