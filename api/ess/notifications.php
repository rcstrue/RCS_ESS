<?php
/**
 * RCS ESS - Notifications API
 * GET:  List notifications for an employee
 * POST: Create a notification (internal use)
 * PUT:  Mark notification as read
 *
 * DB Schema: ess_notifications.employee_id is VARCHAR(50), NOT int!
 * DB Schema: No read_at column exists — only is_read (tinyint)
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
// GET - List Notifications
// ============================================================================
function handleGet($conn) {
    $employeeId = getQueryParam('employee_id');

    if (!$employeeId) {
        jsonError('employee_id is required', 400);
    }

    // employee_id is VARCHAR(50)
    $page  = max(1, intval(getQueryParam('page', 1)));
    $limit = min(100, max(1, intval(getQueryParam('limit', 20))));
    $offset = ($page - 1) * $limit;

    // Unread count
    $stmt = $conn->prepare("SELECT COUNT(*) as total FROM ess_notifications WHERE employee_id = ? AND is_read = 0");
    safeBindParam($stmt, 's', [$employeeId]);
    $stmt->execute();
    $countResult = $stmt->get_result();
    $unreadCount = intval($countResult->fetch_assoc()['total']);
    $countResult->free();
    $stmt->close();

    // Total count
    $stmt = $conn->prepare("SELECT COUNT(*) as total FROM ess_notifications WHERE employee_id = ?");
    safeBindParam($stmt, 's', [$employeeId]);
    $stmt->execute();
    $countResult = $stmt->get_result();
    $total = intval($countResult->fetch_assoc()['total']);
    $countResult->free();
    $stmt->close();

    // Fetch notifications
    $stmt = $conn->prepare("SELECT * FROM ess_notifications WHERE employee_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?");
    safeBindParam($stmt, 'sii', [$employeeId, $limit, $offset]);
    $stmt->execute();
    $result = $stmt->get_result();
    $records = [];
    while ($row = $result->fetch_assoc()) {
        $records[] = $row;
    }
    $result->free();
    $stmt->close();

    jsonResponse([
        'items' => $records,
        'pagination' => buildPaginationResponse($total, $page, $limit, [])['pagination'],
        'unread_count' => $unreadCount,
    ]);
}

// ============================================================================
// POST - Create Notification (internal)
// ============================================================================
function handlePost($conn) {
    $data = getJsonInput();

    $employeeId = getRequiredParam($data, 'employee_id');  // VARCHAR(50)
    $title      = getRequiredParam($data, 'title');
    $message    = getRequiredParam($data, 'message');
    $type       = isset($data['type']) ? $data['type'] : 'info';
    $link       = isset($data['link']) ? $data['link'] : null;

    // INSERT: employee_id(s), title(s), message(s), type(s), link(s), NOW()
    // 5 bind params: s,s,s,s,s = 'sssss'
    $stmt = $conn->prepare("INSERT INTO ess_notifications (employee_id, title, message, type, link, created_at) VALUES (?, ?, ?, ?, ?, NOW())");
    safeBindParam($stmt, 'sssss', [$employeeId, $title, $message, $type, $link]);
    $stmt->execute();
    $notifId = intval($conn->insert_id);
    $stmt->close();

    jsonSuccess(['id' => $notifId], 'Notification created');
}

// ============================================================================
// PUT - Mark as Read
// NOTE: No read_at column in ess_notifications table
// ============================================================================
function handlePut($conn) {
    $data = getJsonInput();

    $id = intval(getRequiredParam($data, 'id'));
    $employeeId = isset($data['employee_id']) ? $data['employee_id'] : null;

    if ($employeeId) {
        // Mark single notification as read
        $stmt = $conn->prepare("UPDATE ess_notifications SET is_read = 1 WHERE id = ? AND employee_id = ?");
        safeBindParam($stmt, 'is', [$id, $employeeId]);
    } else {
        // Mark all as read
        $stmt = $conn->prepare("UPDATE ess_notifications SET is_read = 1 WHERE id = ?");
        safeBindParam($stmt, 'i', [$id]);
    }
    $stmt->execute();
    $stmt->close();

    jsonSuccess(null, 'Notification marked as read');
}
