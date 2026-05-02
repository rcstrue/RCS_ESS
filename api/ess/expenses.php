<?php
/**
 * ESS API — Expense Management Endpoint
 * GET:  List expenses with pagination
 * POST: Create expense
 * PUT:  Approve/reject expense
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    validateApiKey();

    switch ($method) {
        case 'GET':
            _handleGetExpenses();
            break;
        case 'POST':
            _handleCreateExpense();
            break;
        case 'PUT':
            _handleUpdateExpense();
            break;
        default:
            jsonOutput(['success' => false, 'error' => 'Method not allowed'], 405);
    }
} catch (Exception $e) {
    jsonOutput(['success' => false, 'error' => 'Internal server error', '_debug' => ['message' => $e->getMessage(), 'file' => basename($e->getFile()), 'line' => $e->getLine()]], 500);
}

// ─── GET: List Expenses ───────────────────────────────────────────────────────

function _handleGetExpenses(): void
{
    $authId = requireAuth();
    $conn = getDbConnection();

    $view = $_GET['view'] ?? '';

    // Pending team expenses in one query (no N+1)
    if ($view === 'pending_team') {
        _handlePendingTeamExpenses($authId);
        return;
    }

    $queryEmployeeId = $_GET['employee_id'] ?? $authId;
    $statusFilter = $_GET['status'] ?? '';
    $categoryFilter = $_GET['category'] ?? '';
    $typeFilter = $_GET['type'] ?? '';
    $monthFilter = $_GET['month'] ?? ''; // Format: YYYY-MM
    [$page, $limit, $offset] = getPaginationParams();

    // Build where clause
    $where = 'WHERE employee_id = ?';
    $types = 's';
    $params = [$queryEmployeeId];

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

    // Count
    $countStmt = $conn->prepare("SELECT COUNT(*) AS total FROM ess_expenses {$where}");
    $countStmt->bind_param($types, ...$params);
    $countStmt->execute();
    $total = (int)$countStmt->get_result()->fetch_assoc()['total'];
    $countStmt->close();

    // Fetch records
    $dataQuery = "
        SELECT id, employee_id, manager_id, category, type, amount, description,
               bill_url, bill_type, expense_date, status, approved_by, approved_at,
               rejection_reason, settlement_id, created_at, updated_at
        FROM ess_expenses
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

    $expenses = [];
    while ($row = $result->fetch_assoc()) {
        $expenses[] = [
            'id' => (int)$row['id'],
            'employee_id' => $row['employee_id'],
            'manager_id' => $row['manager_id'],
            'category' => $row['category'],
            'type' => $row['type'],
            'amount' => (float)$row['amount'],
            'description' => $row['description'] ?? '',
            'bill_url' => $row['bill_url'] ?? '',
            'bill_type' => $row['bill_type'] ?? '',
            'expense_date' => $row['expense_date'] ?? '',
            'status' => $row['status'],
            'approved_by' => $row['approved_by'],
            'approved_at' => $row['approved_at'],
            'rejection_reason' => $row['rejection_reason'] ?? '',
            'settlement_id' => $row['settlement_id'],
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }
    $stmt->close();

    // Calculate total amount for filtered results
    $sumStmt = $conn->prepare("SELECT COALESCE(SUM(amount), 0) AS total_amount FROM ess_expenses {$where}");
    $sumStmt->bind_param($types, ...$params);
    $sumStmt->execute();
    $totalAmount = (float)$sumStmt->get_result()->fetch_assoc()['total_amount'];
    $sumStmt->close();

    // Monthly summary: total advance received, total approved expenses
    $monthSummary = ['advance_received' => 0, 'approved_expenses' => 0];
    $currentMonth = !empty($monthFilter) ? $monthFilter : date('Y-m');
    if (preg_match('/^\d{4}-\d{2}$/', $currentMonth)) {
        $monthWhere = 'WHERE employee_id = ? AND expense_date LIKE ?';
        $monthParams = [$queryEmployeeId, $currentMonth . '%'];

        // Total approved advances (money received from company)
        $advStmt = $conn->prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM ess_expenses {$monthWhere} AND type = 'advance' AND status IN ('approved', 'reimbursed')");
        $advStmt->bind_param('ss', ...$monthParams);
        $advStmt->execute();
        $monthSummary['advance_received'] = (float)$advStmt->get_result()->fetch_assoc()['total'];
        $advStmt->close();

        // Total approved expenses
        $expStmt = $conn->prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM ess_expenses {$monthWhere} AND type = 'expense' AND status IN ('approved', 'reimbursed')");
        $expStmt->bind_param('ss', ...$monthParams);
        $expStmt->execute();
        $monthSummary['approved_expenses'] = (float)$expStmt->get_result()->fetch_assoc()['total'];
        $expStmt->close();
    }
    $monthSummary['balance'] = $monthSummary['advance_received'] - $monthSummary['approved_expenses'];

    $response = [
        'success' => true,
        'data' => array_merge([
            'items' => $expenses,
            'total_amount' => $totalAmount,
            'month_summary' => $monthSummary,
        ], buildPagination($total, $page, $limit))
    ];
    jsonOutput($response);
}

// ─── GET: Pending Team Expenses (single query) ───────────────────────────────

function _handlePendingTeamExpenses(string $authId): void
{
    $conn = getDbConnection();

    // Get team member IDs from cache (same unit/client)
    $cacheStmt = $conn->prepare('SELECT unit_id, client_id FROM ess_employee_cache WHERE employee_id = ?');
    $cacheStmt->bind_param('s', $authId);
    $cacheStmt->execute();
    $cache = $cacheStmt->get_result()->fetch_assoc();
    $cacheStmt->close();

    if (!$cache) {
        jsonOutput(['success' => true, 'data' => ['items' => []]]);
        return;
    }

    // Build query: find all employees in same unit
    $teamQuery = 'SELECT employee_id FROM ess_employee_cache WHERE employee_id != ?';
    $teamTypes = 's';
    $teamParams = [$authId];

    if (!empty($cache['unit_id'])) {
        $teamQuery .= ' AND unit_id = ?';
        $teamTypes .= 'i';
        $teamParams[] = $cache['unit_id'];
    } elseif (!empty($cache['client_id'])) {
        $teamQuery .= ' AND client_id = ?';
        $teamTypes .= 'i';
        $teamParams[] = $cache['client_id'];
    }

    $teamStmt = $conn->prepare($teamQuery);
    $teamStmt->bind_param($teamTypes, ...$teamParams);
    $teamStmt->execute();
    $teamResult = $teamStmt->get_result();

    $teamIds = [];
    while ($row = $teamResult->fetch_assoc()) {
        $teamIds[] = $row['employee_id'];
    }
    $teamStmt->close();

    if (empty($teamIds)) {
        jsonOutput(['success' => true, 'data' => ['items' => []]]);
        return;
    }

    // Single query: all pending expenses from team members
    $placeholders = implode(',', array_fill(0, count($teamIds), '?'));
    $expQuery = "
        SELECT e.id, e.employee_id, e.category, e.type, e.amount, e.description,
               e.bill_url, e.bill_type, e.expense_date, e.status, e.created_at,
               c.full_name AS employee_name
        FROM ess_expenses e
        LEFT JOIN ess_employee_cache c ON c.employee_id = e.employee_id
        WHERE e.employee_id IN ({$placeholders})
          AND e.status = 'pending'
        ORDER BY e.created_at DESC
        LIMIT 100
    ";

    $expStmt = $conn->prepare($expQuery);
    $expStmt->bind_param(str_repeat('s', count($teamIds)), ...$teamIds);
    $expStmt->execute();
    $result = $expStmt->get_result();

    $expenses = [];
    while ($row = $result->fetch_assoc()) {
        $expenses[] = [
            'id' => (int)$row['id'],
            'employee_id' => $row['employee_id'],
            'employee_name' => $row['employee_name'] ?? 'Unknown',
            'category' => $row['category'] ?? '',
            'type' => $row['type'],
            'amount' => (float)$row['amount'],
            'description' => $row['description'] ?? '',
            'expense_date' => $row['expense_date'] ?? '',
            'status' => $row['status'],
            'created_at' => $row['created_at'],
        ];
    }
    $expStmt->close();

    jsonOutput(['success' => true, 'data' => ['items' => $expenses]]);
}

// ─── POST: Create Expense ─────────────────────────────────────────────────────

function _handleCreateExpense(): void
{
    $employeeId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    // Validate required fields
    $category = strtolower(trim($input['category'] ?? ''));
    $type = strtolower(trim($input['type'] ?? ''));
    $amount = (float)($input['amount'] ?? 0);
    $description = trim($input['description'] ?? '');
    $expenseDate = trim($input['expense_date'] ?? '');
    $billUrl = trim($input['bill_url'] ?? '');
    $billType = trim($input['bill_type'] ?? '');

    $validCategories = ['advance', 'expense', 'employee_advance'];
    $validTypes = ['advance', 'expense'];

    if (empty($category) || !in_array($category, $validCategories)) {
        jsonOutput(['success' => false, 'error' => 'Invalid category. Allowed: ' . implode(', ', $validCategories)], 400);
    }
    if (empty($type) || !in_array($type, $validTypes)) {
        jsonOutput(['success' => false, 'error' => 'Invalid type. Allowed: ' . implode(', ', $validTypes)], 400);
    }
    if ($amount <= 0) {
        jsonOutput(['success' => false, 'error' => 'Amount must be greater than zero'], 400);
    }
    if (empty($description)) {
        jsonOutput(['success' => false, 'error' => 'Description is required'], 400);
    }

    // Default expense date to today if not provided
    if (empty($expenseDate) || !strtotime($expenseDate)) {
        $expenseDate = date('Y-m-d');
    }

    // Find manager from cache
    $managerId = null;
    $managerStmt = $conn->prepare('SELECT manager_id FROM ess_employee_cache WHERE employee_id = ?');
    $managerStmt->bind_param('s', $employeeId);
    $managerStmt->execute();
    $mgr = $managerStmt->get_result()->fetch_assoc();
    $managerStmt->close();
    // Note: manager_id may not be in cache — use null if not found

    // Insert expense
    $stmt = $conn->prepare('
        INSERT INTO ess_expenses (employee_id, manager_id, category, type, amount, description, bill_url, bill_type, expense_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
    $pendingStatus = 'pending';
    $stmt->bind_param('sssddsssss',
        $employeeId, $managerId, $category, $type, $amount, $description,
        $billUrl, $billType, $expenseDate, $pendingStatus
    );
    $stmt->execute();
    $newId = $stmt->insert_id;
    $stmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $newId,
            'employee_id' => $employeeId,
            'category' => $category,
            'type' => $type,
            'amount' => $amount,
            'description' => $description,
            'expense_date' => $expenseDate,
            'status' => 'pending',
            'message' => 'Expense submitted successfully'
        ]
    ]);
}

// ─── PUT: Approve/Reject Expense ──────────────────────────────────────────────

function _handleUpdateExpense(): void
{
    $authId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    $expenseId = (int)($input['id'] ?? 0);
    $status = strtolower(trim($input['status'] ?? ''));
    $approvedBy = trim($input['approved_by'] ?? $authId);
    $rejectionReason = trim($input['rejection_reason'] ?? '');

    if ($expenseId <= 0) {
        jsonOutput(['success' => false, 'error' => 'Expense ID is required'], 400);
    }

    $validStatuses = ['approved', 'rejected', 'reimbursed'];
    if (!in_array($status, $validStatuses)) {
        jsonOutput(['success' => false, 'error' => 'Invalid status. Allowed: ' . implode(', ', $validStatuses)], 400);
    }

    if ($status === 'rejected' && empty($rejectionReason)) {
        jsonOutput(['success' => false, 'error' => 'Rejection reason is required when rejecting an expense'], 400);
    }

    // Verify expense exists and is pending
    $checkStmt = $conn->prepare('SELECT id, employee_id, status, amount FROM ess_expenses WHERE id = ?');
    $checkStmt->bind_param('i', $expenseId);
    $checkStmt->execute();
    $expense = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if (!$expense) {
        jsonOutput(['success' => false, 'error' => 'Expense not found'], 404);
    }

    // Allow updating if pending, or transitioning approved → reimbursed
    $allowedTransitions = [
        'pending' => ['approved', 'rejected'],
        'approved' => ['reimbursed'],
    ];
    $currentStatus = $expense['status'];
    if (!isset($allowedTransitions[$currentStatus]) || !in_array($status, $allowedTransitions[$currentStatus])) {
        jsonOutput(['success' => false, 'error' => "Cannot change expense status from '{$currentStatus}' to '{$status}'"], 409);
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

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $expenseId,
            'status' => $status,
            'approved_by' => $approvedBy,
            'message' => "Expense {$status} successfully"
        ]
    ]);
}
