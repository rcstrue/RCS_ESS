<?php
/**
 * RCS ESS - Helpdesk/Tickets API
 * GET:  List helpdesk tickets
 * POST: Create a new ticket
 * PUT:  Update ticket (add resolution, change status)
 *
 * DB Schema: Table name is ess_helpdesk_tickets (NOT ess_helpdesk)
 * DB Schema: ess_helpdesk_tickets.employee_id is VARCHAR(50), NOT int!
 * DB Schema: ess_helpdesk_tickets.resolved_by is VARCHAR(50), NOT int!
 * DB Schema: No resolved_at column exists
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
// GET - List Helpdesk Tickets
// ============================================================================
function handleGet($conn) {
    $employeeId = getQueryParam('employee_id');
    $status     = getQueryParam('status');
    $category   = getQueryParam('category');
    $priority   = getQueryParam('priority');

    $where  = ['1=1'];
    $params = [];
    $types  = '';

    if ($employeeId) {
        $where[] = 'h.employee_id = ?';
        $params[] = $employeeId;  // VARCHAR(50)
        $types .= 's';
    }
    if ($status) {
        $where[] = 'h.status = ?';
        $params[] = $status;
        $types .= 's';
    }
    if ($category) {
        $where[] = 'h.category = ?';
        $params[] = $category;
        $types .= 's';
    }
    if ($priority) {
        $where[] = 'h.priority = ?';
        $params[] = $priority;
        $types .= 's';
    }

    $whereClause = implode(' AND ', $where);
    $pag = getPaginationParams();

    $countSql = "SELECT COUNT(*) as total FROM ess_helpdesk_tickets h WHERE {$whereClause}";
    $dataSql  = "SELECT h.*, e.full_name as employee_name, e.designation as employee_designation, u.name as unit_name,
                        resolver.full_name as resolved_by_name
                 FROM ess_helpdesk_tickets h
                 LEFT JOIN employees e ON h.employee_id = e.id
                 LEFT JOIN units u ON e.unit_id = u.id
                 LEFT JOIN employees resolver ON h.resolved_by = resolver.id
                 WHERE {$whereClause}
                 ORDER BY
                    CASE h.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
                    CASE h.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'resolved' THEN 3 WHEN 'closed' THEN 4 ELSE 5 END,
                    h.created_at DESC
                 LIMIT ? OFFSET ?";

    safePaginatedSelect($conn, $countSql, $dataSql, $params, $types, $pag['page'], $pag['limit']);
}

// ============================================================================
// POST - Create Helpdesk Ticket
// ============================================================================
function handlePost($conn) {
    $data = getJsonInput();

    $employeeId  = getRequiredParam($data, 'employee_id');  // VARCHAR(50)
    $category    = getRequiredParam($data, 'category');
    $subject     = getRequiredParam($data, 'subject');
    $priority    = isset($data['priority']) ? $data['priority'] : 'medium';
    $description = isset($data['description']) ? $data['description'] : null;

    $validCategories = ['IT', 'HR', 'Admin', 'Facility', 'Payroll', 'Other'];
    if (!in_array($category, $validCategories)) {
        jsonError('Invalid category. Allowed: ' . implode(', ', $validCategories), 400);
    }

    $validPriorities = ['low', 'medium', 'high'];
    if (!in_array($priority, $validPriorities)) {
        jsonError('Invalid priority. Allowed: ' . implode(', ', $validPriorities), 400);
    }

    // INSERT: employee_id(s), category(s), subject(s), description(s), priority(s), ...
    // 5 bind params: s,s,s,s,s = 'sssss'
    $stmt = $conn->prepare("INSERT INTO ess_helpdesk_tickets (employee_id, category, subject, description, priority, status, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, 'open', NOW(), NOW())");
    safeBindParam($stmt, 'sssss', [$employeeId, $category, $subject, $description, $priority]);
    $stmt->execute();
    $ticketId = intval($conn->insert_id);
    $stmt->close();

    // Fetch created record
    $stmt = $conn->prepare("SELECT h.*, e.full_name as employee_name, e.designation as employee_designation, u.name as unit_name
                            FROM ess_helpdesk_tickets h
                            LEFT JOIN employees e ON h.employee_id = e.id
                            LEFT JOIN units u ON e.unit_id = u.id
                            WHERE h.id = ?");
    safeBindParam($stmt, 'i', [$ticketId]);
    $stmt->execute();
    $result = $stmt->get_result();
    $record = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    jsonSuccess($record, 'Ticket created successfully');
}

// ============================================================================
// PUT - Update Helpdesk Ticket
// ============================================================================
function handlePut($conn) {
    $data = getJsonInput();

    $id     = intval(getRequiredParam($data, 'id'));
    $status = isset($data['status']) ? $data['status'] : null;

    // Validate ticket exists
    $stmt = $conn->prepare("SELECT * FROM ess_helpdesk_tickets WHERE id = ?");
    safeBindParam($stmt, 'i', [$id]);
    $stmt->execute();
    $result = $stmt->get_result();
    $ticket = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    if (!$ticket) {
        jsonError('Ticket not found', 404);
    }

    // Build update fields dynamically
    $fields = [];
    $params = [];
    $types  = '';

    // resolved_by is VARCHAR(50), not int
    $allowedFields = [
        'category'    => 's',
        'subject'     => 's',
        'description' => 's',
        'priority'    => 's',
        'status'      => 's',
        'resolution'  => 's',
        'resolved_by' => 's',
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
        $validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
        if (!in_array($status, $validStatuses)) {
            jsonError('Invalid status. Allowed: ' . implode(', ', $validStatuses), 400);
        }
    }

    // Validate priority
    if (isset($data['priority'])) {
        $validPriorities = ['low', 'medium', 'high'];
        if (!in_array($data['priority'], $validPriorities)) {
            jsonError('Invalid priority. Allowed: ' . implode(', ', $validPriorities), 400);
        }
    }

    $fields[] = "updated_at = NOW()";
    // NOTE: No resolved_at column in ess_helpdesk_tickets table

    $sql  = "UPDATE ess_helpdesk_tickets SET " . implode(', ', $fields) . " WHERE id = ?";
    $params[] = $id;
    $types .= 'i';

    $stmt = $conn->prepare($sql);
    safeBindParam($stmt, $types, $params);
    $stmt->execute();
    $stmt->close();

    // Fetch updated record
    $stmt = $conn->prepare("SELECT h.*, e.full_name as employee_name, e.designation as employee_designation, u.name as unit_name,
                                   resolver.full_name as resolved_by_name
                            FROM ess_helpdesk_tickets h
                            LEFT JOIN employees e ON h.employee_id = e.id
                            LEFT JOIN units u ON e.unit_id = u.id
                            LEFT JOIN employees resolver ON h.resolved_by = resolver.id
                            WHERE h.id = ?");
    safeBindParam($stmt, 'i', [$id]);
    $stmt->execute();
    $result = $stmt->get_result();
    $record = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    // Notify employee on status change (employee_id is VARCHAR(50))
    if ($status && $status !== $ticket['status']) {
        $statusLabel  = str_replace('_', ' ', $status);
        $notifMessage = "Your ticket \"{$ticket['subject']}\" is now {$statusLabel}";
        $stmt = $conn->prepare("INSERT INTO ess_notifications (employee_id, title, message, type, link, created_at) VALUES (?, 'Ticket Updated', ?, 'info', '/helpdesk', NOW())");
        safeBindParam($stmt, 'ss', [$ticket['employee_id'], $notifMessage]);
        $stmt->execute();
        $stmt->close();
    }

    jsonSuccess($record, 'Ticket updated successfully');
}
