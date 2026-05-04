<?php
/**
 * ESS API — Expense Management Endpoint
 * GET:  List expenses with pagination, monthly summary, pending team
 * POST: Create expense
 * PUT:  Approve/reject expense
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    validateApiKey();

    switch ($method) {
        case 'GET':
            handleGetExpenses();
            break;
        case 'POST':
            handleCreateExpense();
            break;
        case 'PUT':
            handleUpdateExpense();
            break;
        default:
            jsonOutput(array('success' => false, 'error' => 'Method not allowed'), 405);
    }
} catch (\Throwable $e) {
    jsonOutput(array(
        'success' => false,
        'error' => 'Server error: ' . $e->getMessage() . ' in ' . basename($e->getFile()) . ':' . $e->getLine()
    ), 500);
}

/**
 * Helper: bind params using call_user_func_array (handles variable param count)
 */
function safeBindParam($stmt, $types, $params)
{
    $bindParams = array_merge(array($types), $params);
    call_user_func_array(array($stmt, 'bind_param'), $bindParams);
}

// ─── GET: List Expenses ───────────────────────────────────────────────────────

function handleGetExpenses(): void
{
    $authId = requireAuth();
    $conn = getDbConnection();

    $view = isset($_GET['view']) ? $_GET['view'] : '';

    // Pending team expenses in one query (no N+1)
    if ($view === 'pending_team') {
        handlePendingTeamExpenses($authId);
        return;
    }

    $queryEmployeeId = isset($_GET['employee_id']) ? $_GET['employee_id'] : $authId;
    $statusFilter    = isset($_GET['status']) ? $_GET['status'] : '';
    $categoryFilter  = isset($_GET['category']) ? $_GET['category'] : '';
    $typeFilter      = isset($_GET['type']) ? $_GET['type'] : '';
    $monthFilter     = isset($_GET['month']) ? $_GET['month'] : '';

    list($page, $limit, $offset) = getPaginationParams();

    // Build where clause
    $where = 'WHERE employee_id = ?';
    $types = 's';
    $params = array($queryEmployeeId);

    if (!empty($monthFilter) && preg_match('/^\d{4}-\d{2}$/', $monthFilter)) {
        $where .= ' AND expense_date LIKE ?';
        $types .= 's';
        $params[] = $monthFilter . '%';
    }

    if (!empty($statusFilter)) {
        $where .= ' AND status = ?';
        $types .= 's';
        $params[] = $statusFilter;
    }

    if (!empty($categoryFilter)) {
        $where .= ' AND category = ?';
        $types .= 's';
        $params[] = $categoryFilter;
    }

    if (!empty($typeFilter)) {
        $where .= ' AND type = ?';
        $types .= 's';
        $params[] = $typeFilter;
    }

    // Count query
    $countSql = "SELECT COUNT(*) AS total FROM ess_expenses {$where}";
    $countStmt = $conn->prepare($countSql);
    safeBindParam($countStmt, $types, $params);
    $countStmt->execute();
    $total = (int)$countStmt->get_result()->fetch_assoc()['total'];
    $countStmt->close();

    // Fetch records — use SELECT * to avoid column mismatch
    $dataSql = "SELECT * FROM ess_expenses {$where} ORDER BY created_at DESC LIMIT ? OFFSET ?";
    $dataTypes = $types . 'ii';
    $dataParams = $params;
    $dataParams[] = $limit;
    $dataParams[] = $offset;

    $stmt = $conn->prepare($dataSql);
    safeBindParam($stmt, $dataTypes, $dataParams);
    $stmt->execute();
    $result = $stmt->get_result();

    $expenses = array();
    while ($row = $result->fetch_assoc()) {
        $expenses[] = array(
            'id'               => (int)$row['id'],
            'employee_id'      => isset($row['employee_id']) ? $row['employee_id'] : '',
            'manager_id'       => isset($row['manager_id']) ? $row['manager_id'] : '',
            'category'         => isset($row['category']) ? $row['category'] : '',
            'type'             => isset($row['type']) ? $row['type'] : '',
            'amount'           => isset($row['amount']) ? (float)$row['amount'] : 0.0,
            'description'      => isset($row['description']) ? $row['description'] : '',
            'bill_url'         => isset($row['bill_url']) ? $row['bill_url'] : '',
            'bill_type'        => isset($row['bill_type']) ? $row['bill_type'] : '',
            'expense_date'     => isset($row['expense_date']) ? $row['expense_date'] : '',
            'status'           => isset($row['status']) ? $row['status'] : '',
            'approved_by'      => isset($row['approved_by']) ? $row['approved_by'] : '',
            'approved_at'      => isset($row['approved_at']) ? $row['approved_at'] : '',
            'rejection_reason' => isset($row['rejection_reason']) ? $row['rejection_reason'] : '',
            'settlement_id'    => isset($row['settlement_id']) ? $row['settlement_id'] : '',
            'created_at'       => isset($row['created_at']) ? $row['created_at'] : '',
            'updated_at'       => isset($row['updated_at']) ? $row['updated_at'] : '',
        );
    }
    $stmt->close();

    // Calculate total amount for filtered results
    $sumSql = "SELECT COALESCE(SUM(amount), 0) AS total_amount FROM ess_expenses {$where}";
    $sumStmt = $conn->prepare($sumSql);
    safeBindParam($sumStmt, $types, $params);
    $sumStmt->execute();
    $totalAmount = (float)$sumStmt->get_result()->fetch_assoc()['total_amount'];
    $sumStmt->close();

    // Monthly summary (safe — failure won't break the response)
    $monthSummary = array('advance_received' => 0, 'approved_expenses' => 0, 'balance' => 0);
    $currentMonth = !empty($monthFilter) ? $monthFilter : date('Y-m');
    if (preg_match('/^\d{4}-\d{2}$/', $currentMonth)) {
        try {
            $monthLike = $currentMonth . '%';

            // Total approved advances (money received from company)
            $advSql = "SELECT COALESCE(SUM(amount), 0) AS total FROM ess_expenses WHERE employee_id = ? AND expense_date LIKE ? AND type = 'advance' AND status IN ('approved', 'reimbursed')";
            $advStmt = $conn->prepare($advSql);
            $advStmt->bind_param('ss', $queryEmployeeId, $monthLike);
            $advStmt->execute();
            $monthSummary['advance_received'] = (float)$advStmt->get_result()->fetch_assoc()['total'];
            $advStmt->close();

            // Total approved expenses
            $expSql = "SELECT COALESCE(SUM(amount), 0) AS total FROM ess_expenses WHERE employee_id = ? AND expense_date LIKE ? AND type = 'expense' AND status IN ('approved', 'reimbursed')";
            $expStmt = $conn->prepare($expSql);
            $expStmt->bind_param('ss', $queryEmployeeId, $monthLike);
            $expStmt->execute();
            $monthSummary['approved_expenses'] = (float)$expStmt->get_result()->fetch_assoc()['total'];
            $expStmt->close();
        } catch (\Throwable $e) {
            // Monthly summary failure should not break the whole request
            error_log('expenses monthly_summary error: ' . $e->getMessage());
        }
    }
    $monthSummary['balance'] = $monthSummary['advance_received'] - $monthSummary['approved_expenses'];

    $response = array(
        'success' => true,
        'data' => array_merge(
            array(
                'items' => $expenses,
                'total_amount' => $totalAmount,
                'month_summary' => $monthSummary,
            ),
            buildPagination($total, $page, $limit)
        )
    );
    jsonOutput($response);
}

// ─── GET: Pending Team Expenses (single query) ───────────────────────────────

function handlePendingTeamExpenses($authId): void
{
    $conn = getDbConnection();

    try {
        // Get team member IDs from cache (same unit/client)
        $cacheStmt = $conn->prepare('SELECT unit_id, client_id FROM ess_employee_cache WHERE employee_id = ?');
        $cacheStmt->bind_param('s', $authId);
        $cacheStmt->execute();
        $cache = $cacheStmt->get_result()->fetch_assoc();
        $cacheStmt->close();
    } catch (\Throwable $e) {
        jsonOutput(array('success' => true, 'data' => array('items' => array())));
        return;
    }

    if (!$cache) {
        jsonOutput(array('success' => true, 'data' => array('items' => array())));
        return;
    }

    // Build query: find all employees in same unit
    $teamQuery = 'SELECT employee_id FROM ess_employee_cache WHERE employee_id != ?';
    $teamTypes = 's';
    $teamParams = array($authId);

    if (!empty($cache['unit_id'])) {
        $teamQuery .= ' AND unit_id = ?';
        $teamTypes .= 'i';
        $teamParams[] = (int)$cache['unit_id'];
    } elseif (!empty($cache['client_id'])) {
        $teamQuery .= ' AND client_id = ?';
        $teamTypes .= 'i';
        $teamParams[] = (int)$cache['client_id'];
    }

    try {
        $teamStmt = $conn->prepare($teamQuery);
        safeBindParam($teamStmt, $teamTypes, $teamParams);
        $teamStmt->execute();
        $teamResult = $teamStmt->get_result();

        $teamIds = array();
        while ($row = $teamResult->fetch_assoc()) {
            $teamIds[] = $row['employee_id'];
        }
        $teamStmt->close();
    } catch (\Throwable $e) {
        jsonOutput(array('success' => true, 'data' => array('items' => array())));
        return;
    }

    if (empty($teamIds)) {
        jsonOutput(array('success' => true, 'data' => array('items' => array())));
        return;
    }

    // Single query: all pending expenses from team members
    $placeholders = implode(',', array_fill(0, count($teamIds), '?'));
    $expQuery = "
        SELECT e.*, c.full_name AS employee_name
        FROM ess_expenses e
        LEFT JOIN ess_employee_cache c ON c.employee_id = e.employee_id
        WHERE e.employee_id IN ({$placeholders})
          AND e.status = 'pending'
        ORDER BY e.created_at DESC
        LIMIT 100
    ";

    $bindTypes = str_repeat('s', count($teamIds));
    $expStmt = $conn->prepare($expQuery);
    $expStmt->bind_param($bindTypes, ...$teamIds);
    $expStmt->execute();
    $result = $expStmt->get_result();

    $expenses = array();
    while ($row = $result->fetch_assoc()) {
        $expenses[] = array(
            'id'             => (int)$row['id'],
            'employee_id'    => isset($row['employee_id']) ? $row['employee_id'] : '',
            'employee_name'  => isset($row['employee_name']) ? $row['employee_name'] : 'Unknown',
            'category'       => isset($row['category']) ? $row['category'] : '',
            'type'           => isset($row['type']) ? $row['type'] : '',
            'amount'         => isset($row['amount']) ? (float)$row['amount'] : 0.0,
            'description'    => isset($row['description']) ? $row['description'] : '',
            'expense_date'   => isset($row['expense_date']) ? $row['expense_date'] : '',
            'status'         => isset($row['status']) ? $row['status'] : '',
            'created_at'     => isset($row['created_at']) ? $row['created_at'] : '',
        );
    }
    $expStmt->close();

    jsonOutput(array('success' => true, 'data' => array('items' => $expenses)));
}

// ─── POST: Create Expense ─────────────────────────────────────────────────────

function handleCreateExpense(): void
{
    $employeeId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    // Validate required fields
    $category = strtolower(trim(isset($input['category']) ? $input['category'] : ''));
    $type = strtolower(trim(isset($input['type']) ? $input['type'] : ''));
    $amount = (float)(isset($input['amount']) ? $input['amount'] : 0);
    $description = trim(isset($input['description']) ? $input['description'] : '');
    $expenseDate = trim(isset($input['expense_date']) ? $input['expense_date'] : '');
    $billUrl = trim(isset($input['bill_url']) ? $input['bill_url'] : '');
    $billType = trim(isset($input['bill_type']) ? $input['bill_type'] : '');

    $validCategories = array('advance', 'expense', 'employee_advance');
    $validTypes = array('advance', 'expense');

    if (empty($category) || !in_array($category, $validCategories)) {
        jsonOutput(array('success' => false, 'error' => 'Invalid category. Allowed: ' . implode(', ', $validCategories)), 400);
        return;
    }
    if (empty($type) || !in_array($type, $validTypes)) {
        jsonOutput(array('success' => false, 'error' => 'Invalid type. Allowed: ' . implode(', ', $validTypes)), 400);
        return;
    }
    if ($amount <= 0) {
        jsonOutput(array('success' => false, 'error' => 'Amount must be greater than zero'), 400);
        return;
    }
    if (empty($description)) {
        jsonOutput(array('success' => false, 'error' => 'Description is required'), 400);
        return;
    }

    // Default expense date to today if not provided
    if (empty($expenseDate) || !strtotime($expenseDate)) {
        $expenseDate = date('Y-m-d');
    }

    // Find manager from cache
    $managerId = null;
    try {
        $managerStmt = $conn->prepare('SELECT manager_id FROM ess_employee_cache WHERE employee_id = ?');
        $managerStmt->bind_param('s', $employeeId);
        $managerStmt->execute();
        $mgr = $managerStmt->get_result()->fetch_assoc();
        $managerStmt->close();
        if ($mgr && isset($mgr['manager_id'])) {
            $managerId = $mgr['manager_id'];
        }
    } catch (\Throwable $e) {
        // manager lookup failure is not critical
    }

    // Insert expense
    // Types: s=employee_id, s=manager_id(null ok), s=category, s=type,
    //        d=amount, s=description, s=bill_url, s=bill_type, s=expense_date, s=status
    $stmt = $conn->prepare('
        INSERT INTO ess_expenses (employee_id, manager_id, category, type, amount, description, bill_url, bill_type, expense_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
    $pendingStatus = 'pending';
    $stmt->bind_param('ssssdsssss',
        $employeeId, $managerId, $category, $type, $amount, $description,
        $billUrl, $billType, $expenseDate, $pendingStatus
    );
    $stmt->execute();
    $newId = $stmt->insert_id;
    $stmt->close();

    jsonOutput(array(
        'success' => true,
        'data' => array(
            'id' => $newId,
            'employee_id' => $employeeId,
            'category' => $category,
            'type' => $type,
            'amount' => $amount,
            'description' => $description,
            'expense_date' => $expenseDate,
            'status' => 'pending',
            'message' => 'Expense submitted successfully'
        )
    ));
}

// ─── PUT: Approve/Reject Expense ──────────────────────────────────────────────

function handleUpdateExpense(): void
{
    $authId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    $expenseId = (int)(isset($input['id']) ? $input['id'] : 0);
    $status = strtolower(trim(isset($input['status']) ? $input['status'] : ''));
    $approvedBy = trim(isset($input['approved_by']) ? $input['approved_by'] : $authId);
    $rejectionReason = trim(isset($input['rejection_reason']) ? $input['rejection_reason'] : '');

    if ($expenseId <= 0) {
        jsonOutput(array('success' => false, 'error' => 'Expense ID is required'), 400);
        return;
    }

    $validStatuses = array('approved', 'rejected', 'reimbursed');
    if (!in_array($status, $validStatuses)) {
        jsonOutput(array('success' => false, 'error' => 'Invalid status. Allowed: ' . implode(', ', $validStatuses)), 400);
        return;
    }

    if ($status === 'rejected' && empty($rejectionReason)) {
        jsonOutput(array('success' => false, 'error' => 'Rejection reason is required when rejecting an expense'), 400);
        return;
    }

    // Verify expense exists and is pending
    $checkStmt = $conn->prepare('SELECT id, employee_id, status, amount FROM ess_expenses WHERE id = ?');
    $checkStmt->bind_param('i', $expenseId);
    $checkStmt->execute();
    $expense = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if (!$expense) {
        jsonOutput(array('success' => false, 'error' => 'Expense not found'), 404);
        return;
    }

    // Allow updating if pending, or transitioning approved → reimbursed
    $allowedTransitions = array(
        'pending' => array('approved', 'rejected'),
        'approved' => array('reimbursed'),
    );
    $currentStatus = $expense['status'];
    if (!isset($allowedTransitions[$currentStatus]) || !in_array($status, $allowedTransitions[$currentStatus])) {
        jsonOutput(array('success' => false, 'error' => "Cannot change expense status from '{$currentStatus}' to '{$status}'"), 409);
        return;
    }

    // Update
    $updateStmt = $conn->prepare('
        UPDATE ess_expenses
        SET status = ?, approved_by = ?, approved_at = NOW(), rejection_reason = ?, updated_at = NOW()
        WHERE id = ?
    ');
    $updateStmt->bind_param('sssi', $status, $approvedBy, $rejectionReason, $expenseId);
    $updateStmt->execute();
    $updateStmt->close();

    jsonOutput(array(
        'success' => true,
        'data' => array(
            'id' => $expenseId,
            'status' => $status,
            'approved_by' => $approvedBy,
            'message' => "Expense {$status} successfully"
        )
    ));
}
