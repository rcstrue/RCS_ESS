<?php
/**
 * ESS API — Task Management Endpoint
 * GET:  List tasks (filter by assigned_to, assigned_by, status)
 * POST: Create task
 * PUT:  Update task status or fields
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    validateApiKey();

    switch ($method) {
        case 'GET':
            _handleGetTasks();
            break;
        case 'POST':
            _handleCreateTask();
            break;
        case 'PUT':
            _handleUpdateTask();
            break;
        default:
            jsonOutput(['success' => false, 'error' => 'Method not allowed'], 405);
    }
} catch (Throwable $e) {
    essLog('FATAL tasks: ' . $e->getMessage());
    jsonOutput(['success' => false, 'error' => 'Internal server error'], 500);
}

// ─── GET: List Tasks ──────────────────────────────────────────────────────────

function _handleGetTasks(): void
{
    $authId = requireAuth();
    $conn = getDbConnection();

    $assignedTo = $_GET['assigned_to'] ?? '';
    $assignedBy = $_GET['assigned_by'] ?? '';
    $statusFilter = $_GET['status'] ?? '';
    $priorityFilter = $_GET['priority'] ?? '';
    [$page, $limit, $offset] = getPaginationParams();

    // Build where clause — always filter so user sees relevant tasks
    // Use t. prefix since data query JOINs ess_employee_cache
    $where = 'WHERE (t.assigned_to = ? OR t.assigned_by = ?)';
    $types = 'ss';
    $params = [$authId, $authId];

    if (!empty($assignedTo)) {
        $where .= ' AND t.assigned_to = ?';
        $types .= 's';
        $params[] = $assignedTo;
    }

    if (!empty($assignedBy)) {
        $where .= ' AND t.assigned_by = ?';
        $types .= 's';
        $params[] = $assignedBy;
    }

    if (!empty($statusFilter)) {
        $where .= ' AND t.status = ?';
        $types .= 's';
        $params[] = $statusFilter;
    }

    if (!empty($priorityFilter)) {
        $where .= ' AND t.priority = ?';
        $types .= 's';
        $params[] = $priorityFilter;
    }

    // Count query uses t alias
    $countQuery = "SELECT COUNT(*) AS total FROM ess_tasks t {$where}";
    $countStmt = $conn->prepare($countQuery);
    $countStmt->bind_param($types, ...$params);
    $countStmt->execute();
    $total = (int)$countStmt->get_result()->fetch_assoc()['total'];
    $countStmt->close();

    // Fetch records
    $dataQuery = "
        SELECT t.id, t.title, t.description, t.assigned_to, t.assigned_by,
               t.priority, t.status, t.deadline, t.unit_id, t.created_at, t.updated_at,
               ec_assignee.full_name AS assignee_name,
               ec_assigner.full_name AS assigner_name
        FROM ess_tasks t
        LEFT JOIN ess_employee_cache ec_assignee ON ec_assignee.employee_id = t.assigned_to
        LEFT JOIN ess_employee_cache ec_assigner ON ec_assigner.employee_id = t.assigned_by
        {$where}
        ORDER BY
            CASE t.priority
                WHEN 'urgent' THEN 1
                WHEN 'high' THEN 2
                WHEN 'medium' THEN 3
                WHEN 'low' THEN 4
            END,
            t.deadline ASC,
            t.created_at DESC
        LIMIT ? OFFSET ?
    ";
    $dataTypes = $types . 'ii';
    $dataParams = [...$params, $limit, $offset];

    $stmt = $conn->prepare($dataQuery);
    $stmt->bind_param($dataTypes, ...$dataParams);
    $stmt->execute();
    $result = $stmt->get_result();

    $tasks = [];
    while ($row = $result->fetch_assoc()) {
        $tasks[] = [
            'id' => (int)$row['id'],
            'title' => $row['title'],
            'description' => $row['description'] ?? '',
            'assigned_to' => $row['assigned_to'],
            'assigned_by' => $row['assigned_by'],
            'assignee_name' => $row['assignee_name'] ?? '',
            'assigner_name' => $row['assigner_name'] ?? '',
            'priority' => $row['priority'],
            'status' => $row['status'],
            'deadline' => $row['deadline'] ?? '',
            'unit_id' => $row['unit_id'] ?? null,
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }
    $stmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'items' => $tasks,
            ...buildPagination($total, $page, $limit)
        ]
    ]);
}

// ─── POST: Create Task ────────────────────────────────────────────────────────

function _handleCreateTask(): void
{
    $employeeId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    // Validate required fields
    $title = trim($input['title'] ?? '');
    $assignedTo = trim($input['assigned_to'] ?? '');
    $priority = strtolower(trim($input['priority'] ?? 'medium'));
    $deadline = trim($input['deadline'] ?? '');
    $description = trim($input['description'] ?? '');
    $unitId = !empty($input['unit_id']) ? (string)$input['unit_id'] : null;

    $validPriorities = ['low', 'medium', 'high', 'urgent'];

    if (empty($title)) {
        jsonOutput(['success' => false, 'error' => 'Title is required'], 400);
    }
    if (empty($assignedTo)) {
        jsonOutput(['success' => false, 'error' => 'assigned_to is required'], 400);
    }
    if (!in_array($priority, $validPriorities)) {
        jsonOutput(['success' => false, 'error' => 'Invalid priority. Allowed: ' . implode(', ', $validPriorities)], 400);
    }

    if (!empty($deadline) && !strtotime($deadline)) {
        jsonOutput(['success' => false, 'error' => 'Invalid deadline format'], 400);
    }

    // Insert task
    $stmt = $conn->prepare('
        INSERT INTO ess_tasks (title, description, assigned_to, assigned_by, priority, deadline, unit_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');
    $pendingStatus = 'pending';
    $stmt->bind_param('sssssss',
        $title, $description, $assignedTo, $employeeId, $priority, $deadline ?: null, $unitId
    );
    $stmt->execute();
    $newId = $stmt->insert_id;
    $stmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $newId,
            'title' => $title,
            'assigned_to' => $assignedTo,
            'assigned_by' => $employeeId,
            'priority' => $priority,
            'status' => 'pending',
            'deadline' => $deadline,
            'message' => 'Task created successfully'
        ]
    ]);
}

// ─── PUT: Update Task ─────────────────────────────────────────────────────────

function _handleUpdateTask(): void
{
    $employeeId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    $taskId = (int)($input['id'] ?? 0);
    if ($taskId <= 0) {
        jsonOutput(['success' => false, 'error' => 'Task ID is required'], 400);
    }

    // Verify task exists
    $checkStmt = $conn->prepare('SELECT id, assigned_to, assigned_by, status FROM ess_tasks WHERE id = ?');
    $checkStmt->bind_param('i', $taskId);
    $checkStmt->execute();
    $task = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if (!$task) {
        jsonOutput(['success' => false, 'error' => 'Task not found'], 404);
    }

    // Build dynamic update query based on provided fields
    $updateFields = [];
    $types = '';
    $params = [];

    $allowedFields = [
        'title' => 's',
        'description' => 's',
        'assigned_to' => 's',
        'priority' => 's',
        'status' => 's',
        'deadline' => 's',
        'unit_id' => 's',
    ];

    $validPriorities = ['low', 'medium', 'high', 'urgent'];
    $validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];

    foreach ($allowedFields as $field => $type) {
        if (array_key_exists($field, $input) && $field !== 'id') {
            $value = $input[$field];

            // Validate status and priority enums
            if ($field === 'priority' && !in_array($value, $validPriorities)) {
                jsonOutput(['success' => false, 'error' => 'Invalid priority value'], 400);
            }
            if ($field === 'status' && !in_array($value, $validStatuses)) {
                jsonOutput(['success' => false, 'error' => 'Invalid status value'], 400);
            }

            $updateFields[] = "{$field} = ?";
            $types .= $type;
            $params[] = $type === 'i' ? (int)$value : (is_null($value) ? null : trim((string)$value));
        }
    }

    if (empty($updateFields)) {
        jsonOutput(['success' => false, 'error' => 'No fields to update'], 400);
    }

    // Always update updated_at
    $updateFields[] = 'updated_at = NOW()';

    $query = 'UPDATE ess_tasks SET ' . implode(', ', $updateFields) . ' WHERE id = ?';
    $types .= 'i';
    $params[] = $taskId;

    $stmt = $conn->prepare($query);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $stmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $taskId,
            'message' => 'Task updated successfully'
        ]
    ]);
}
