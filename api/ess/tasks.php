<?php
/**
 * RCS ESS - Tasks API
 * GET:  List tasks (filtered by assigned_to, assigned_by, status)
 * POST: Create a new task
 * PUT:  Update task (change status, etc.)
 *
 * DB Schema: ess_tasks.assigned_to is VARCHAR(50), NOT int!
 * DB Schema: ess_tasks.assigned_by is VARCHAR(50), NOT int!
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
// GET - List Tasks
// ============================================================================
function handleGet($conn) {
    $assignedTo = getQueryParam('assigned_to');
    $assignedBy = getQueryParam('assigned_by');
    $status     = getQueryParam('status');
    $priority   = getQueryParam('priority');

    $where  = ['1=1'];
    $params = [];
    $types  = '';

    if ($assignedTo) {
        $where[] = 't.assigned_to = ?';
        $params[] = $assignedTo;  // VARCHAR(50)
        $types .= 's';
    }
    if ($assignedBy) {
        $where[] = 't.assigned_by = ?';
        $params[] = $assignedBy;  // VARCHAR(50)
        $types .= 's';
    }
    if ($status) {
        $where[] = 't.status = ?';
        $params[] = $status;
        $types .= 's';
    }
    if ($priority) {
        $where[] = 't.priority = ?';
        $params[] = $priority;
        $types .= 's';
    }

    $whereClause = implode(' AND ', $where);
    $pag = getPaginationParams();

    $countSql = "SELECT COUNT(*) as total FROM ess_tasks t WHERE {$whereClause}";
    $dataSql  = "SELECT t.*,
                        assigned.full_name as assigned_to_name,
                        creator.full_name as assigned_by_name
                 FROM ess_tasks t
                 LEFT JOIN employees assigned ON t.assigned_to = assigned.id
                 LEFT JOIN employees creator ON t.assigned_by = creator.id
                 WHERE {$whereClause}
                 ORDER BY
                    CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
                    CASE t.status WHEN 'pending' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END,
                    t.deadline ASC, t.created_at DESC
                 LIMIT ? OFFSET ?";

    safePaginatedSelect($conn, $countSql, $dataSql, $params, $types, $pag['page'], $pag['limit']);
}

// ============================================================================
// POST - Create Task
// ============================================================================
function handlePost($conn) {
    $data = getJsonInput();

    $title      = getRequiredParam($data, 'title');
    $priority   = isset($data['priority']) ? $data['priority'] : 'medium';
    $assignedTo = isset($data['assigned_to']) ? $data['assigned_to'] : null;  // VARCHAR(50)
    $assignedBy = isset($data['assigned_by']) ? $data['assigned_by'] : null;  // VARCHAR(50)
    $deadline   = isset($data['deadline']) ? $data['deadline'] : null;
    $description = isset($data['description']) ? $data['description'] : null;

    $validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (!in_array($priority, $validPriorities)) {
        jsonError('Invalid priority. Allowed: ' . implode(', ', $validPriorities), 400);
    }

    // INSERT: title(s), description(s), priority(s), status, assigned_to(s), assigned_by(s), deadline(s), NOW(), NOW()
    // 6 bind params: s,s,s,s,s,s = 'ssssss'
    $stmt = $conn->prepare("INSERT INTO ess_tasks (title, description, priority, status, assigned_to, assigned_by, deadline, created_at, updated_at)
                            VALUES (?, ?, ?, 'pending', ?, ?, ?, NOW(), NOW())");
    safeBindParam($stmt, 'ssssss', [$title, $description, $priority, $assignedTo, $assignedBy, $deadline]);
    $stmt->execute();
    $taskId = intval($conn->insert_id);
    $stmt->close();

    // Fetch the created record with names
    $stmt = $conn->prepare("SELECT t.*, assigned.full_name as assigned_to_name, creator.full_name as assigned_by_name
                            FROM ess_tasks t
                            LEFT JOIN employees assigned ON t.assigned_to = assigned.id
                            LEFT JOIN employees creator ON t.assigned_by = creator.id
                            WHERE t.id = ?");
    safeBindParam($stmt, 'i', [$taskId]);
    $stmt->execute();
    $result = $stmt->get_result();
    $record = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    // Notification to assigned employee (employee_id is VARCHAR(50))
    if ($assignedTo) {
        $notifMessage = "New task assigned: {$title}" . ($deadline ? " (Deadline: {$deadline})" : '');
        $stmt = $conn->prepare("INSERT INTO ess_notifications (employee_id, title, message, type, link, created_at) VALUES (?, 'New Task Assigned', ?, 'info', '/tasks', NOW())");
        safeBindParam($stmt, 'ss', [$assignedTo, $notifMessage]);
        $stmt->execute();
        $stmt->close();
    }

    jsonSuccess($record, 'Task created successfully');
}

// ============================================================================
// PUT - Update Task
// ============================================================================
function handlePut($conn) {
    $data = getJsonInput();

    $id     = intval(getRequiredParam($data, 'id'));
    $status = isset($data['status']) ? $data['status'] : null;

    // Validate task exists
    $stmt = $conn->prepare("SELECT * FROM ess_tasks WHERE id = ?");
    safeBindParam($stmt, 'i', [$id]);
    $stmt->execute();
    $result = $stmt->get_result();
    $task   = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    if (!$task) {
        jsonError('Task not found', 404);
    }

    // Build update fields dynamically
    $fields = [];
    $params = [];
    $types  = '';

    // assigned_to and assigned_by are VARCHAR(50), not int
    $allowedFields = [
        'title'       => 's',
        'description' => 's',
        'priority'    => 's',
        'status'      => 's',
        'assigned_to' => 's',
        'assigned_by' => 's',
        'deadline'    => 's',
    ];

    foreach ($allowedFields as $field => $type) {
        if (isset($data[$field]) && $field !== 'id') {
            $fields[] = "{$field} = ?";
            $params[] = $data[$field];
            $types .= $type;
        }
    }

    if (empty($fields)) {
        jsonError('No fields to update', 400);
    }

    // Validate status
    if ($status) {
        $validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
        if (!in_array($status, $validStatuses)) {
            jsonError('Invalid status. Allowed: ' . implode(', ', $validStatuses), 400);
        }
    }

    // Validate priority
    if (isset($data['priority'])) {
        $validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (!in_array($data['priority'], $validPriorities)) {
            jsonError('Invalid priority. Allowed: ' . implode(', ', $validPriorities), 400);
        }
    }

    $fields[] = "updated_at = NOW()";

    $sql  = "UPDATE ess_tasks SET " . implode(', ', $fields) . " WHERE id = ?";
    $params[] = $id;
    $types .= 'i';

    $stmt = $conn->prepare($sql);
    safeBindParam($stmt, $types, $params);
    $stmt->execute();
    $stmt->close();

    // Fetch updated record
    $stmt = $conn->prepare("SELECT t.*, assigned.full_name as assigned_to_name, creator.full_name as assigned_by_name
                            FROM ess_tasks t
                            LEFT JOIN employees assigned ON t.assigned_to = assigned.id
                            LEFT JOIN employees creator ON t.assigned_by = creator.id
                            WHERE t.id = ?");
    safeBindParam($stmt, 'i', [$id]);
    $stmt->execute();
    $result = $stmt->get_result();
    $record = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    // Notify on status change (assigned_to is VARCHAR(50))
    if ($status && $task['assigned_to'] && $status !== $task['status']) {
        $statusLabel = str_replace('_', ' ', $status);
        $notifMessage = "Task \"{$task['title']}\" status changed to {$statusLabel}";
        $stmt = $conn->prepare("INSERT INTO ess_notifications (employee_id, title, message, type, link, created_at) VALUES (?, 'Task Updated', ?, 'info', '/tasks', NOW())");
        safeBindParam($stmt, 'ss', [$task['assigned_to'], $notifMessage]);
        $stmt->execute();
        $stmt->close();
    }

    jsonSuccess($record, 'Task updated successfully');
}
