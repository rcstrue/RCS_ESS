<?php
/**
 * ESS API — Leave Management Endpoint
 * GET:  List leaves with pagination. Use ?view=balance for leave balances.
 * POST: Apply for leave
 * PUT:  Approve/reject leave
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    validateApiKey();

    switch ($method) {
        case 'GET':
            _handleGetLeaves();
            break;
        case 'POST':
            _handleApplyLeave();
            break;
        case 'PUT':
            _handleUpdateLeave();
            break;
        default:
            jsonOutput(['success' => false, 'error' => 'Method not allowed'], 405);
    }
} catch (\Throwable $e) {
    jsonOutput(['success' => false, 'error' => 'Server error: ' . $e->getMessage() . ' in ' . basename($e->getFile()) . ':' . $e->getLine()], 500);
}

// ─── GET: List Leaves ─────────────────────────────────────────────────────────

function _handleGetLeaves(): void
{
    $authId = requireAuth();
    $conn = getDbConnection();

    // Check for view=balance
    if (($_GET['view'] ?? '') === 'balance') {
        _getLeaveBalances($conn, $authId);
        return;
    }

    // Query params
    $queryEmployeeId = $_GET['employee_id'] ?? $authId;
    $statusFilter = $_GET['status'] ?? '';
    $typeFilter = $_GET['type'] ?? '';
    $yearFilter = $_GET['year'] ?? '';
    [$page, $limit, $offset] = getPaginationParams();

    // Build query
    $where = 'WHERE employee_id = ?';
    $types = 's';
    $params = [$queryEmployeeId];

    if (!empty($statusFilter)) {
        $where .= ' AND status = ?';
        $types .= 's';
        $params[] = $statusFilter;
    }

    if (!empty($typeFilter)) {
        $where .= ' AND type = ?';
        $types .= 's';
        $params[] = $typeFilter;
    }

    if (!empty($yearFilter) && preg_match('/^\d{4}$/', $yearFilter)) {
        $where .= ' AND YEAR(start_date) = ?';
        $types .= 'i';
        $params[] = (int)$yearFilter;
    }

    // Count
    $countStmt = $conn->prepare("SELECT COUNT(*) AS total FROM ess_leaves {$where}");
    $countStmt->bind_param($types, ...$params);
    $countStmt->execute();
    $total = (int)$countStmt->get_result()->fetch_assoc()['total'];
    $countStmt->close();

    // Fetch records
    $dataQuery = "
        SELECT id, employee_id, type, start_date, end_date, days, reason,
               status, approved_by, approved_at, rejection_reason, created_at, updated_at
        FROM ess_leaves
        {$where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    ";
    $dataTypes = $types . 'ii';
    $dataParams = [...$params, $limit, $offset];

    $stmt = $conn->prepare($dataQuery);
    $stmt->bind_param($dataTypes, ...$dataParams);
    $stmt->execute();
    $result = $stmt->get_result();

    $leaves = [];
    while ($row = $result->fetch_assoc()) {
        $leaves[] = [
            'id' => (int)$row['id'],
            'employee_id' => $row['employee_id'],
            'type' => $row['type'],
            'start_date' => $row['start_date'],
            'end_date' => $row['end_date'],
            'days' => (float)$row['days'],
            'reason' => $row['reason'] ?? '',
            'status' => $row['status'],
            'approved_by' => $row['approved_by'],
            'approved_at' => $row['approved_at'],
            'rejection_reason' => $row['rejection_reason'] ?? '',
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }
    $stmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'items' => $leaves,
            ...buildPagination($total, $page, $limit)
        ]
    ]);
}

/**
 * Get leave balances for an employee
 */
function _getLeaveBalances(mysqli $conn, string $employeeId): void
{
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

// ─── POST: Apply for Leave ────────────────────────────────────────────────────

function _handleApplyLeave(): void
{
    $employeeId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    // Validate required fields
    $type = strtoupper(trim($input['type'] ?? ''));
    $startDate = trim($input['start_date'] ?? '');
    $endDate = trim($input['end_date'] ?? '');
    $reason = trim($input['reason'] ?? '');

    $validTypes = ['CL', 'SL', 'EL', 'WFH', 'COMP_OFF', 'LWP'];

    if (empty($type) || !in_array($type, $validTypes)) {
        jsonOutput(['success' => false, 'error' => 'Invalid leave type. Allowed: ' . implode(', ', $validTypes)], 400);
    }
    if (empty($startDate) || !strtotime($startDate)) {
        jsonOutput(['success' => false, 'error' => 'Invalid start date'], 400);
    }
    if (empty($endDate) || !strtotime($endDate)) {
        jsonOutput(['success' => false, 'error' => 'Invalid end date'], 400);
    }
    if (strtotime($endDate) < strtotime($startDate)) {
        jsonOutput(['success' => false, 'error' => 'End date cannot be before start date'], 400);
    }
    if (empty($reason)) {
        jsonOutput(['success' => false, 'error' => 'Reason is required'], 400);
    }

    // Calculate leave days
    $start = new DateTime($startDate);
    $end = new DateTime($endDate);
    $days = $start->diff($end)->days + 1;

    // Check for overlapping leaves
    $overlapStmt = $conn->prepare('
        SELECT id FROM ess_leaves
        WHERE employee_id = ? AND status IN (\'pending\', \'approved\')
        AND (
            (start_date <= ? AND end_date >= ?) OR
            (start_date <= ? AND end_date >= ?)
        )
    ');
    bindDynamicParams($overlapStmt, 'sssss', array($employeeId, $startDate, $startDate, $endDate, $endDate));
    $overlapStmt->execute();
    if ($overlapStmt->get_result()->num_rows > 0) {
        $overlapStmt->close();
        jsonOutput(['success' => false, 'error' => 'You already have an overlapping leave request'], 409);
    }
    $overlapStmt->close();

    // Insert leave
    $stmt = $conn->prepare('
        INSERT INTO ess_leaves (employee_id, type, start_date, end_date, days, reason, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');
    $pendingStatus = 'pending';
    bindDynamicParams($stmt, 'ssssdss', array(
        $employeeId, $type, $startDate, $endDate, $days, $reason, $pendingStatus
    ));
    $stmt->execute();
    $newId = $stmt->insert_id;
    $stmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $newId,
            'employee_id' => $employeeId,
            'type' => $type,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'days' => $days,
            'reason' => $reason,
            'status' => 'pending',
            'message' => 'Leave application submitted successfully'
        ]
    ]);
}

// ─── PUT: Approve/Reject Leave ────────────────────────────────────────────────

function _handleUpdateLeave(): void
{
    $authId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    $leaveId = (int)($input['id'] ?? 0);
    $status = strtolower(trim($input['status'] ?? ''));
    $approvedBy = trim($input['approved_by'] ?? $authId);
    $rejectionReason = trim($input['rejection_reason'] ?? '');

    if ($leaveId <= 0) {
        jsonOutput(['success' => false, 'error' => 'Leave ID is required'], 400);
    }

    if (!in_array($status, ['approved', 'rejected', 'cancelled'])) {
        jsonOutput(['success' => false, 'error' => 'Invalid status. Allowed: approved, rejected, cancelled'], 400);
    }

    if ($status === 'rejected' && empty($rejectionReason)) {
        jsonOutput(['success' => false, 'error' => 'Rejection reason is required when rejecting a leave'], 400);
    }

    // Verify leave exists and is pending
    $checkStmt = $conn->prepare('SELECT id, employee_id, type, status, days FROM ess_leaves WHERE id = ?');
    $checkStmt->bind_param('i', $leaveId);
    $checkStmt->execute();
    $leave = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if (!$leave) {
        jsonOutput(['success' => false, 'error' => 'Leave request not found'], 404);
    }

    if ($leave['status'] !== 'pending') {
        jsonOutput(['success' => false, 'error' => 'Leave request is already ' . $leave['status']], 409);
    }

    // Update the leave
    $updateStmt = $conn->prepare('
        UPDATE ess_leaves
        SET status = ?, approved_by = ?, approved_at = NOW(), rejection_reason = ?, updated_at = NOW()
        WHERE id = ?
    ');
    bindDynamicParams($updateStmt, 'sssi', array($status, $approvedBy, $rejectionReason, $leaveId));
    $updateStmt->execute();
    $updateStmt->close();

    // If approved, update leave balance
    if ($status === 'approved') {
        _updateLeaveBalance($conn, $leave['employee_id'], $leave['type'], $leave['days']);
    }

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $leaveId,
            'status' => $status,
            'approved_by' => $approvedBy,
            'message' => $status === 'approved' ? 'Leave approved' : 'Leave rejected'
        ]
    ]);
}

/**
 * Update leave balance when a leave is approved
 */
function _updateLeaveBalance(mysqli $conn, string $employeeId, string $leaveType, float $days): void
{
    $year = date('Y');

    // Check if balance record exists
    $checkStmt = $conn->prepare('
        SELECT id, used, balance FROM ess_leave_balances
        WHERE employee_id = ? AND leave_type = ? AND year = ?
    ');
    $checkStmt->bind_param('sss', $employeeId, $leaveType, $year);
    $checkStmt->execute();
    $balance = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if ($balance) {
        // Update existing balance
        $newUsed = (float)$balance['used'] + $days;
        $newBalance = (float)$balance['balance'] - $days;

        $updateStmt = $conn->prepare('
            UPDATE ess_leave_balances
            SET used = ?, balance = ?, updated_at = NOW()
            WHERE id = ?
        ');
        $updateStmt->bind_param('ddi', $newUsed, $newBalance, $balance['id']);
        $updateStmt->execute();
        $updateStmt->close();
    }
    // If no balance record exists, leave it — balances are managed separately
}
