<?php
/**
 * RCS ESS - Leaves API
 * GET:  List leave requests & balances
 * POST: Create leave request
 * PUT:  Approve/reject/cancel leave request
 *
 * DB Schema: ess_leaves.employee_id is VARCHAR(50), NOT int!
 * DB Schema: ess_leave_balances.employee_id is VARCHAR(50), NOT int!
 * DB Schema: ess_leaves.approved_by is VARCHAR(50), NOT int!
 * DB Schema: ess_leave_balances.year is CHAR(4) (string), NOT int!
 */

require_once __DIR__ . '/cors.php';
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
// GET - List Leaves / Balances
// ============================================================================
function handleGet($conn) {
    $view       = getQueryParam('view');
    $employeeId = getQueryParam('employee_id');
    $status     = getQueryParam('status');
    $type       = getQueryParam('type');
    $year       = getQueryParam('year', date('Y'));

    // View: balance
    if ($view === 'balance') {
        if (!$employeeId) {
            jsonError('employee_id is required for balance view', 400);
        }

        // employee_id is VARCHAR(50), year is CHAR(4) — both strings
        $stmt = $conn->prepare("SELECT * FROM ess_leave_balances WHERE employee_id = ? AND year = ? ORDER BY leave_type");
        safeBindParam($stmt, 'ss', [$employeeId, $year]);
        $stmt->execute();
        $result = $stmt->get_result();
        $balances = [];
        while ($row = $result->fetch_assoc()) {
            $balances[] = $row;
        }
        $result->free();
        $stmt->close();
        jsonSuccess($balances);
    }

    // Default: list leave requests
    $where  = ['1=1'];
    $params = [];
    $types  = '';

    if ($employeeId) {
        $where[] = 'l.employee_id = ?';
        $params[] = $employeeId;  // VARCHAR(50)
        $types .= 's';
    }
    if ($status) {
        $where[] = 'l.status = ?';
        $params[] = $status;
        $types .= 's';
    }
    if ($type) {
        $where[] = 'l.type = ?';
        $params[] = $type;
        $types .= 's';
    }

    $whereClause = implode(' AND ', $where);
    $pag = getPaginationParams();

    $countSql = "SELECT COUNT(*) as total FROM ess_leaves l WHERE {$whereClause}";
    $dataSql  = "SELECT l.*,
                        e.full_name as employee_name, e.designation as employee_designation, u.name as unit_name,
                        ap.full_name as approver_name
                 FROM ess_leaves l
                 LEFT JOIN employees e ON l.employee_id = e.id
                 LEFT JOIN units u ON e.unit_id = u.id
                 LEFT JOIN employees ap ON l.approved_by = ap.id
                 WHERE {$whereClause}
                 ORDER BY l.created_at DESC
                 LIMIT ? OFFSET ?";

    safePaginatedSelect($conn, $countSql, $dataSql, $params, $types, $pag['page'], $pag['limit']);
}

// ============================================================================
// POST - Create Leave Request
// ============================================================================
function handlePost($conn) {
    $data = getJsonInput();

    $employeeId = getRequiredParam($data, 'employee_id');  // VARCHAR(50)
    $type       = getRequiredParam($data, 'type');
    $startDate  = getRequiredParam($data, 'start_date');
    $endDate    = getRequiredParam($data, 'end_date');
    $reason     = isset($data['reason']) ? $data['reason'] : null;
    $year       = date('Y', strtotime($startDate));  // CHAR(4) in DB

    $validTypes = ['CL', 'SL', 'EL', 'WFH', 'Comp_Off', 'LWP'];
    if (!in_array($type, $validTypes)) {
        jsonError('Invalid leave type. Allowed: ' . implode(', ', $validTypes), 400);
    }
    if ($endDate && $endDate < $startDate) {
        jsonError('End date cannot be before start date', 400);
    }

    $start = new DateTime($startDate);
    $end   = $endDate ? new DateTime($endDate) : new DateTime($startDate);
    $days  = floatval($start->diff($end)->days) + 1;

    // Check balance (skip for LWP)
    if ($type !== 'LWP') {
        // employee_id(VARCHAR), type(string), year(CHAR(4)) = s,s,s
        $stmt = $conn->prepare("SELECT balance FROM ess_leave_balances WHERE employee_id = ? AND leave_type = ? AND year = ? FOR UPDATE");
        safeBindParam($stmt, 'sss', [$employeeId, $type, $year]);
        $stmt->execute();
        $balResult = $stmt->get_result();
        $balanceRow = $balResult->fetch_assoc();
        $balResult->free();
        $stmt->close();

        if (!$balanceRow) {
            jsonError("No leave balance found for type {$type} in year {$year}. Please contact HR.", 400);
        }

        $currentBalance = floatval($balanceRow['balance']);
        if ($currentBalance < $days) {
            jsonError("Insufficient leave balance. You have {$currentBalance} {$type} days remaining but requested {$days} days.", 400);
        }
    }

    $conn->begin_transaction();

    try {
        // INSERT: employee_id(s), type(s), start_date(s), end_date(s), days(d), reason(s), ...
        // 6 bind params: s,s,s,s,d,s = 'ssssds'
        $stmt = $conn->prepare("INSERT INTO ess_leaves (employee_id, type, start_date, end_date, days, reason, status, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())");
        safeBindParam($stmt, 'ssssds', [$employeeId, $type, $startDate, $endDate, $days, $reason]);
        $stmt->execute();
        $leaveId = intval($conn->insert_id);
        $stmt->close();

        if ($type !== 'LWP') {
            // UPDATE: used(d), days(d), employee_id(s), type(s), year(s)
            // 5 bind params: d,d,s,s,s = 'ddsss'
            $stmt = $conn->prepare("UPDATE ess_leave_balances
                                    SET used = used + ?, balance = balance - ?, updated_at = NOW()
                                    WHERE employee_id = ? AND leave_type = ? AND year = ?");
            safeBindParam($stmt, 'ddsss', [$days, $days, $employeeId, $type, $year]);
            $stmt->execute();
            $stmt->close();
        }

        $conn->commit();

        $stmt = $conn->prepare("SELECT l.*, e.full_name as employee_name FROM ess_leaves l LEFT JOIN employees e ON l.employee_id = e.id WHERE l.id = ?");
        safeBindParam($stmt, 'i', [$leaveId]);
        $stmt->execute();
        $result  = $stmt->get_result();
        $record  = $result->fetch_assoc();
        $result->free();
        $stmt->close();

        jsonSuccess($record, 'Leave request created successfully');
    } catch (Exception $e) {
        $conn->rollback();
        throw $e;
    }
}

// ============================================================================
// PUT - Approve/Reject/Cancel Leave
// ============================================================================
function handlePut($conn) {
    $data = getJsonInput();

    $id               = intval(getRequiredParam($data, 'id'));
    $status           = getRequiredParam($data, 'status');
    $approvedBy       = isset($data['approved_by']) ? $data['approved_by'] : null;  // VARCHAR(50)
    $rejectionReason  = isset($data['rejection_reason']) ? $data['rejection_reason'] : null;

    $validStatuses = ['approved', 'rejected', 'cancelled'];
    if (!in_array($status, $validStatuses)) {
        jsonError('Invalid status for update. Allowed: ' . implode(', ', $validStatuses), 400);
    }

    // Get existing leave
    $stmt = $conn->prepare("SELECT * FROM ess_leaves WHERE id = ?");
    safeBindParam($stmt, 'i', [$id]);
    $stmt->execute();
    $result = $stmt->get_result();
    $leave  = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    if (!$leave) {
        jsonError('Leave request not found', 404);
    }
    if ($leave['status'] !== 'pending' && $status !== 'cancelled') {
        jsonError('This leave request has already been processed', 400);
    }

    $conn->begin_transaction();

    try {
        // UPDATE: status(s), approved_by(s), NOW(), rejection_reason(s), NOW() WHERE id(i)
        // 4 bind params: s,s,s,i = 'sssi'
        $stmt = $conn->prepare("UPDATE ess_leaves SET status = ?, approved_by = ?, approved_at = NOW(), rejection_reason = ?, updated_at = NOW() WHERE id = ?");
        safeBindParam($stmt, 'sssi', [$status, $approvedBy, $rejectionReason, $id]);
        $stmt->execute();
        $stmt->close();

        // Restore balance on rejection/cancellation
        if (($status === 'rejected' || $status === 'cancelled') && $leave['type'] !== 'LWP') {
            $leaveYear  = date('Y', strtotime($leave['start_date']));  // CHAR(4)
            $leaveDays  = floatval($leave['days']);
            $leaveEmpId = $leave['employee_id'];  // VARCHAR(50)

            // UPDATE: used(d), days(d), employee_id(s), type(s), year(s)
            // 5 bind params: d,d,s,s,s = 'ddsss'
            $stmt = $conn->prepare("UPDATE ess_leave_balances
                                    SET used = used - ?, balance = balance + ?, updated_at = NOW()
                                    WHERE employee_id = ? AND leave_type = ? AND year = ?");
            safeBindParam($stmt, 'ddsss', [$leaveDays, $leaveDays, $leaveEmpId, $leave['type'], $leaveYear]);
            $stmt->execute();
            $stmt->close();
        }

        // Notification (employee_id is VARCHAR(50))
        $notifTitle = $status === 'approved' ? 'Leave Approved' : ($status === 'rejected' ? 'Leave Rejected' : 'Leave Cancelled');
        $notifMessage = $status === 'approved'
            ? "Your {$leave['type']} leave from {$leave['start_date']} to {$leave['end_date']} ({$leave['days']} days) has been approved."
            : ($status === 'rejected'
                ? "Your {$leave['type']} leave from {$leave['start_date']} to {$leave['end_date']} has been rejected. Reason: {$rejectionReason}"
                : "Your {$leave['type']} leave from {$leave['start_date']} to {$leave['end_date']} has been cancelled.");
        $notifType = $status === 'approved' ? 'success' : ($status === 'rejected' ? 'warning' : 'info');

        $stmt = $conn->prepare("INSERT INTO ess_notifications (employee_id, title, message, type, link, created_at) VALUES (?, ?, ?, ?, '/leaves', NOW())");
        safeBindParam($stmt, 'ssss', [$leave['employee_id'], $notifTitle, $notifMessage, $notifType]);
        $stmt->execute();
        $stmt->close();

        $conn->commit();

        $stmt = $conn->prepare("SELECT l.*, e.full_name as employee_name FROM ess_leaves l LEFT JOIN employees e ON l.employee_id = e.id WHERE l.id = ?");
        safeBindParam($stmt, 'i', [$id]);
        $stmt->execute();
        $result = $stmt->get_result();
        $record = $result->fetch_assoc();
        $result->free();
        $stmt->close();

        $msg = $status === 'approved' ? 'Leave approved successfully' : ($status === 'rejected' ? 'Leave rejected successfully' : 'Leave cancelled successfully');
        jsonSuccess($record, $msg);
    } catch (Exception $e) {
        $conn->rollback();
        throw $e;
    }
}
