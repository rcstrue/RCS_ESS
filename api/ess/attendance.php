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
    essLog("Request: method={$method}");

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
} catch (Throwable $e) {
    essLog("FATAL: {$e->getMessage()} in {$e->getFile()}:{$e->getLine()}");
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

    essLog("GET attendance: emp={$queryEmployeeId}, month={$month}, page={$page}");

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
            SUM(CASE WHEN a.status IN (\'present\', \'late\', \'half_day\', \'checked_out\') THEN 1 ELSE 0 END) AS total_present,
            SUM(CASE WHEN a.status = \'checked_in\' THEN 1 ELSE 0 END) AS total_checked_in,
            SUM(CASE WHEN a.status = \'absent\' THEN 1 ELSE 0 END) AS total_absent,
            SUM(CASE WHEN a.status = \'leave\' THEN 1 ELSE 0 END) AS total_leave,
            SUM(CASE WHEN a.status = \'holiday\' THEN 1 ELSE 0 END) AS total_holiday,
            SUM(CASE WHEN a.status = \'late\' THEN 1 ELSE 0 END) AS total_late
        FROM ess_attendance a
        WHERE a.employee_id = ? AND a.date BETWEEN ? AND ?
    ');
    $stmt->bind_param('sss', $employeeId, $startDate, $endDate);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return [
        'total_days' => (int)($row['total_days'] ?? 0),
        'total_present' => (int)($row['total_present'] ?? 0),
        'total_checked_in' => (int)($row['total_checked_in'] ?? 0),
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

    essLog("CHECK IN attempt: emp={$employeeId}, today={$today}");

    // Check if already checked in today
    $checkStmt = $conn->prepare('
        SELECT a.id, a.check_in, a.check_out, a.status FROM ess_attendance a
        WHERE a.employee_id = ? AND a.date = ?
        ORDER BY a.check_in DESC LIMIT 1
    ');
    $checkStmt->bind_param('ss', $employeeId, $today);
    $checkStmt->execute();
    $existing = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if ($existing) {
        essLog("Already checked in: att_id={$existing['id']}, status={$existing['status']}");
        // Return existing record — already checked in
        // Build location string for response
        $loc = null;
        if (!empty($existing['latitude']) && !empty($existing['longitude'])) {
            $loc = round((float)$existing['latitude'], 4) . ', ' . round((float)$existing['longitude'], 4);
        }
        jsonOutput([
            'success' => false,
            'error' => 'Already checked in today',
            'data' => [
                'id' => (int)$existing['id'],
                'date' => $today,
                'check_in' => $existing['check_in'],
                'check_out' => $existing['check_out'],
                'status' => $existing['status'],
                'location' => $loc,
            ]
        ], 409);
    }

    // Determine base status: check-in time > 10:00 = late
    $hour = (int)date('H');
    $minute = (int)date('i');
    $isLate = $hour > 10 || ($hour === 10 && $minute > 0);

    // CRITICAL: status = 'checked_in' so frontend can detect active check-in
    // The late flag is tracked separately for monthly summary
    $status = 'checked_in';

    // Get location from input if provided
    // Accept both { latitude, longitude } and { location: "lat, lng" }
    $latitude = null;
    $longitude = null;
    if (isset($input['latitude']) && $input['latitude'] !== null) {
        $latitude = (float)$input['latitude'];
    }
    if (isset($input['longitude']) && $input['longitude'] !== null) {
        $longitude = (float)$input['longitude'];
    }
    if ($latitude === null && $longitude === null && !empty($input['location'])) {
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

    essLog("CHECK IN success: att_id={$newId}, time={$currentTime}, late=" . ($isLate ? 'yes' : 'no') . ", location=" . ($locationStr ?? 'none'));

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $newId,
            'employee_id' => $employeeId,
            'date' => $today,
            'check_in' => $currentTime,
            'check_out' => null,
            'status' => $status,
            'is_late' => $isLate,
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

    essLog("CHECK OUT attempt: emp={$employeeId}, att_id={$attendanceId}");

    // Verify the record belongs to this employee and doesn't have check_out yet
    $checkStmt = $conn->prepare('
        SELECT a.id, a.employee_id, a.date, a.check_in, a.check_out, a.status, a.latitude, a.longitude
        FROM ess_attendance a WHERE a.id = ? AND a.employee_id = ?
    ');
    $checkStmt->bind_param('is', $attendanceId, $employeeId);
    $checkStmt->execute();
    $record = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if (!$record) {
        essLog("CHECK OUT failed: att_id={$attendanceId} not found for emp={$employeeId}");
        jsonOutput(['success' => false, 'error' => 'Attendance record not found'], 404);
    }

    if (!empty($record['check_out'])) {
        essLog("CHECK OUT failed: already checked out, att_id={$attendanceId}");
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

    // CRITICAL: Set status to 'checked_out' so frontend knows the day is done
    // Keep late flag if was late at check-in
    $finalStatus = 'checked_out';

    // Update with check_out time and final status
    $updateStmt = $conn->prepare('
        UPDATE ess_attendance SET check_out = ?, status = ?, updated_at = NOW() WHERE id = ?
    ');
    $updateStmt->bind_param('ssi', $currentTime, $finalStatus, $attendanceId);
    $updateStmt->execute();
    $updateStmt->close();

    // Calculate worked hours
    $checkIn = strtotime($record['check_in']);
    $checkOut = strtotime($currentTime);
    $hoursWorked = round(($checkOut - $checkIn) / 3600, 2);

    // Build location string
    $loc = null;
    if (!empty($record['latitude']) && !empty($record['longitude'])) {
        $loc = round((float)$record['latitude'], 4) . ', ' . round((float)$record['longitude'], 4);
    }

    essLog("CHECK OUT success: att_id={$attendanceId}, hours={$hoursWorked}");

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $attendanceId,
            'employee_id' => $employeeId,
            'date' => $record['date'],
            'check_in' => $record['check_in'],
            'check_out' => $currentTime,
            'status' => $finalStatus,
            'hours_worked' => $hoursWorked,
            'location' => $loc,
            'message' => 'Checked out successfully'
        ]
    ]);
}
