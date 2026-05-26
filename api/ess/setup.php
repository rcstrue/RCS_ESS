<?php
/**
 * RCS ESS - Server Diagnostic Tool
 * TEMPORARY FILE - Delete after setup is complete
 * 
 * Upload this to /api/ess/setup.php and visit it in browser:
 * https://join.rcsfacility.com/api/ess/setup.php
 */

header('Content-Type: text/html; charset=utf-8');

$allGood = true;
$messages = [];

function pass($msg) { global $messages; $messages[] = ['ok', $msg]; }
function fail($msg) { global $messages, $allGood; $allGood = false; $messages[] = ['fail', $msg]; }
function info($msg) { global $messages; $messages[] = ['info', $msg]; }

// 1. Check config.php exists
if (file_exists(__DIR__ . '/config.php')) {
    pass('config.php exists');
} else {
    fail('config.php NOT FOUND! Copy example.config.php to config.php and fill in database credentials.');
}

// 2. Try database connection
$conn = null;
$dbError = null;
try {
    if (file_exists(__DIR__ . '/config.php')) {
        require_once __DIR__ . '/config.php';
        $conn = getDbConnection();
        if ($conn) {
            pass('Database connected: ' . DB_NAME . ' @ ' . DB_HOST);
        } else {
            fail('Database connection returned null');
        }
    }
} catch (Exception $e) {
    $conn = null;
    $dbError = $e->getMessage();
    fail('Database connection FAILED: ' . $dbError);
}

// 3. Check tables exist
if ($conn) {
    $requiredTables = [
        'employees',
        'clients', 
        'units',
        'ess_employee_cache',
        'ess_attendance',
        'ess_leave_balances',
        'ess_leaves',
        'ess_tasks',
        'ess_expenses',
        'ess_notifications',
        'ess_announcements',
        'ess_helpdesk_tickets',
    ];
    
    foreach ($requiredTables as $table) {
        $result = $conn->query("SHOW TABLES LIKE '$table'");
        if ($result && $result->num_rows > 0) {
            // Count rows
            $countResult = $conn->query("SELECT COUNT(*) as cnt FROM `$table`");
            $cnt = $countResult ? $countResult->fetch_assoc()['cnt'] : '?';
            pass("Table `$table` exists ($cnt rows)");
        } else {
            $allGood = false;
            fail("Table `$table` MISSING!");
        }
    }
    
    // 4. Check employee data for requester_id=4
    info('');
    info('--- Employee #4 Check ---');
    $emp = $conn->query("SELECT id, full_name, state, client_id, unit_id, employee_role, worker_category, status FROM employees WHERE id = 4")->fetch_assoc();
    if ($emp) {
        pass("Employee #4 found: {$emp['full_name']} (status: {$emp['status']})");
        pass("State: {$emp['state']}, Client ID: {$emp['client_id']}, Unit ID: {$emp['unit_id']}");
        pass("Role: {$emp['employee_role']}, Category: {$emp['worker_category']}");
    } else {
        fail("Employee #4 NOT FOUND!");
    }
    
    // 5. Check clients in employee's state
    info('');
    info('--- Client Filter Test (city scope for employee #4) ---');
    if ($emp) {
        $state = $conn->real_escape_string($emp['state']);
        $sql = "SELECT COUNT(*) as cnt FROM clients c 
                WHERE c.is_active = 1
                AND EXISTS (
                    SELECT 1 FROM units u WHERE u.client_id = c.id 
                    AND u.state = '$state'
                )";
        $r = $conn->query($sql);
        if ($r) {
            $cnt = $r->fetch_assoc()['cnt'];
            pass("Clients in state '{$emp['state']}': $cnt");
        } else {
            fail("Client query error: " . $conn->error);
        }
    }
    
    // 6. Check units
    info('');
    info('--- Unit Filter Test ---');
    if ($emp) {
        $sql = "SELECT COUNT(*) as cnt FROM units u WHERE u.state = '" . $conn->real_escape_string($emp['state']) . "'";
        $r = $conn->query($sql);
        if ($r) {
            $cnt = $r->fetch_assoc()['cnt'];
            pass("Units in state '{$emp['state']}': $cnt");
        } else {
            fail("Unit query error: " . $conn->error);
        }
    }
    
    // 7. Test the EXACT filters.php query that's failing
    info('');
    info('--- Exact filters.php Query Test (scope=city, requester_id=4) ---');
    try {
        $state = $emp['state'];
        $stmt = $conn->prepare("
            SELECT c.id, c.name, c.city, c.state, 
                   (SELECT COUNT(DISTINCT u.id) FROM units u WHERE u.client_id = c.id) as unit_count,
                   (SELECT COUNT(DISTINCT e.id) FROM employees e WHERE e.client_id = c.id AND e.status = 'approved') as employee_count
            FROM clients c
            WHERE c.is_active = 1
            AND EXISTS (
                SELECT 1 FROM units u WHERE u.client_id = c.id 
                AND u.state = ?
            )
            ORDER BY c.name ASC
        ");
        $stmt->bind_param('s', $state);
        $stmt->execute();
        $clients = [];
        while ($row = $stmt->get_result()->fetch_assoc()) {
            $clients[] = $row;
        }
        pass("Client query returned " . count($clients) . " clients");
        foreach ($clients as $c) {
            info("  → {$c['name']} ({$c['city']}, {$c['state']}) - {$c['unit_count']} units, {$c['employee_count']} employees");
        }
    } catch (Exception $e) {
        fail("Client query EXCEPTION: " . $e->getMessage());
    }
    
    // 8. Test employees query (what directory page calls)
    info('');
    info('--- Employees Query Test (scope=city, requester_id=4) ---');
    try {
        $state = $emp['state'];
        $stmt = $conn->prepare("
            SELECT 
                e.id as employee_id,
                e.employee_code,
                e.full_name,
                e.mobile_number,
                e.designation,
                e.state,
                e.client_id,
                e.unit_id,
                c.name as client_name,
                u.name as unit_name
            FROM employees e
            LEFT JOIN clients c ON e.client_id = c.id
            LEFT JOIN units u ON e.unit_id = u.id
            WHERE e.status = 'approved'
            AND e.state = ?
            ORDER BY e.full_name ASC
            LIMIT 100
        ");
        $stmt->bind_param('s', $state);
        $stmt->execute();
        $emps = [];
        while ($row = $stmt->get_result()->fetch_assoc()) {
            $emps[] = $row;
        }
        pass("Employee query returned " . count($emps) . " employees");
        foreach (array_slice($emps, 0, 5) as $e) {
            info("  → {$e['full_name']} (Code: {$e['employee_code']}) - {$e['designation']} @ {$e['unit_name']}");
        }
        if (count($emps) > 5) {
            info("  → ... and " . (count($emps) - 5) . " more");
        }
    } catch (Exception $e) {
        fail("Employee query EXCEPTION: " . $e->getMessage());
    }

    // 9. Test attendance query
    info('');
    info('--- Attendance Query Test ---');
    try {
        $stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM ess_attendance WHERE employee_id = 4");
        $stmt->execute();
        $cnt = $stmt->get_result()->fetch_assoc()['cnt'];
        pass("Attendance records for employee #4: $cnt");
    } catch (Exception $e) {
        fail("Attendance query EXCEPTION: " . $e->getMessage());
    }
}

// 10. Check file versions
info('');
info('--- PHP File Versions ---');
$phpFiles = ['config.php', 'employees.php', 'filters.php', 'attendance.php', 'leaves.php', 'tasks.php', 'expenses.php', 'notifications.php', 'announcements.php', 'helpdesk.php', 'sync.php', 'pin.php', 'login.php'];
foreach ($phpFiles as $f) {
    if (file_exists(__DIR__ . '/' . $f)) {
        $size = filesize(__DIR__ . '/' . $f);
        $modified = date('Y-m-d H:i:s', filemtime(__DIR__ . '/' . $f));
        pass("$f ($size bytes, modified: $modified)");
    } else {
        fail("$f NOT FOUND!");
    }
}

// Check .htaccess
if (file_exists(__DIR__ . '/.htaccess')) {
    pass('.htaccess exists');
} else {
    fail('.htaccess NOT FOUND! Parent rewrite rules may interfere.');
}

// Render results
?>
<!DOCTYPE html>
<html>
<head>
    <title>RCS ESS - Server Diagnostic</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 30px auto; padding: 0 20px; background: #f8fafc; color: #1e293b; }
        h1 { color: #059669; font-size: 1.5rem; margin-bottom: 8px; }
        h2 { color: #475569; font-size: 1rem; margin-top: 30px; }
        .summary { padding: 16px; border-radius: 12px; margin-bottom: 20px; font-weight: 600; font-size: 1.1rem; }
        .summary.ok { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
        .summary.fail { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
        .msg { padding: 6px 12px; margin: 3px 0; border-radius: 6px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; }
        .msg.ok { background: #f0fdf4; color: #166534; border-left: 3px solid #22c55e; }
        .msg.fail { background: #fef2f2; color: #991b1b; border-left: 3px solid #ef4444; }
        .msg.info { background: #f8fafc; color: #475569; border-left: 3px solid #94a3b8; }
        .note { margin-top: 30px; padding: 16px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; color: #92400e; font-size: 13px; line-height: 1.6; }
        .note strong { color: #78350f; }
    </style>
</head>
<body>
    <h1>🔧 RCS ESS Server Diagnostic</h1>
    <p style="color:#64748b; margin-bottom:20px;">Checks database, tables, queries, and file versions</p>

    <div class="summary <?= $allGood ? 'ok' : 'fail' ?>">
        <?= $allGood ? '✅ All checks passed!' : '❌ Some checks failed — see details below' ?>
    </div>

    <?php foreach ($messages as $m): ?>
        <div class="msg <?= $m[0] ?>">
            <?= $m[0] === 'ok' ? '✅' : ($m[0] === 'fail' ? '❌' : 'ℹ️') ?> <?= htmlspecialchars($m[1]) ?>
        </div>
    <?php endforeach; ?>

    <div class="note">
        <strong>⚠️ Important:</strong> After diagnostics pass, <strong>delete this setup.php file</strong> from the server.
        It exposes database structure and should not remain accessible publicly.
    </div>
</body>
</html>
