<?php
declare(strict_types=1);

/**
 * ESS API — Shared Configuration & Utilities
 * Employee Self Service application backend
 * 
 * PRODUCTION CONFIG: Suppress ALL HTML errors, only output JSON
 */

// ─── Database Constants ───────────────────────────────────────────────────────
define('DB_HOST', 'localhost');
define('DB_USER', 'rcsfaxhz_bolt');
define('DB_PASS', '9F8xK2mP5wL4nQ7v');
define('DB_NAME', 'rcsfaxhz_bolt');

// ─── Security Constants ──────────────────────────────────────────────────────
define('API_KEY', 'RCS_HRMS_SECURE_KEY_982374982374');
define('JWT_SECRET', 'rcs_ess_jwt_secret_key_2024_bolt_hrms');

// ─── Timezone ─────────────────────────────────────────────────────────────────
date_default_timezone_set('Asia/Kolkata');

// ─── ERROR HANDLING — CRITICAL FOR PRODUCTION ────────────────────────────────
// Log all errors to PHP error log, display NOTHING to browser
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);
// Custom error handler to ensure errors go to log, never to output
set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
    error_log("ESS API [{$severity}] {$message} in {$file}:{$line}");
    return true; // Prevent PHP default error output
});
// Custom exception handler for uncaught exceptions
set_exception_handler(function (Throwable $e): void {
    error_log("ESS API UNCAUGHT: {$e->getMessage()} in {$e->getFile()}:{$e->getLine()}");
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Internal server error']);
    exit;
});

// ─── CORS Headers ─────────────────────────────────────────────────────────────
header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-KEY');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ─── JSON Output ──────────────────────────────────────────────────────────────
/**
 * Output JSON response and exit
 */
function jsonOutput(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ─── Read Input ───────────────────────────────────────────────────────────────
/**
 * Read JSON request body as associative array
 */
function getInput(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return [];
    }
    return $data;
}

// ─── Debug Logging ────────────────────────────────────────────────────────────
/**
 * Safe debug logging — writes to PHP error log, never outputs to browser
 */
function essLog(string $message): void
{
    $requestUri = $_SERVER['REQUEST_URI'] ?? '/';
    $method = $_SERVER['REQUEST_METHOD'] ?? '?';
    error_log("ESS [{$method} {$requestUri}] {$message}");
}

// ─── Get Bearer Token ─────────────────────────────────────────────────────────
/**
 * Extract Bearer token from Authorization header
 */
function getBearerToken(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.+)$/i', $header, $matches)) {
        return $matches[1];
    }
    return null;
}

// ─── API Key Validation ───────────────────────────────────────────────────────
/**
 * Validate X-API-KEY header. Returns true if valid, sends 403 and exits if not.
 */
function validateApiKey(): bool
{
    $key = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if ($key !== API_KEY) {
        essLog('Invalid API key attempt');
        jsonOutput(['success' => false, 'error' => 'Invalid API key'], 403);
        return false;
    }
    return true;
}

// ─── Lightweight JWT (no composer dependency) ─────────────────────────────────
class SimpleJWT
{
    private static string $secret;
    private static string $algo = 'HS256';

    public static function init(string $secret): void
    {
        self::$secret = $secret;
    }

    /**
     * Encode payload into JWT token
     */
    public static function encode(array $payload, int $expirySeconds = 86400): string
    {
        $now = time();
        $payload['iat'] = $now;
        $payload['exp'] = $now + $expirySeconds;

        $header = self::base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => self::$algo]));
        $payloadEnc = self::base64UrlEncode(json_encode($payload));
        $signature = self::base64UrlEncode(hash_hmac('sha256', "$header.$payloadEnc", self::$secret, true));

        return "$header.$payloadEnc.$signature";
    }

    /**
     * Decode and validate JWT token. Returns payload array or null.
     */
    public static function decode(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$header, $payload, $signature] = $parts;

        // Verify signature
        $expectedSig = self::base64UrlEncode(hash_hmac('sha256', "$header.$payload", self::$secret, true));
        if (!hash_equals($expectedSig, $signature)) {
            return null;
        }

        $data = json_decode(self::base64UrlDecode($payload), true);
        if (!$data) {
            return null;
        }

        // Check expiry
        if (isset($data['exp']) && $data['exp'] < time()) {
            return null;
        }

        return $data;
    }

    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/'));
    }
}

// Initialize JWT
SimpleJWT::init(JWT_SECRET);

// ─── Auth Helper ──────────────────────────────────────────────────────────────
/**
 * Require authentication via JWT. Returns employee_id or exits with 401.
 */
function requireAuth(): string
{
    $token = getBearerToken();
    if (!$token) {
        jsonOutput(['success' => false, 'error' => 'Authorization token required'], 401);
    }

    $payload = SimpleJWT::decode($token);
    if (!$payload) {
        essLog('Invalid or expired JWT token');
        jsonOutput(['success' => false, 'error' => 'Invalid or expired token'], 401);
    }

    return $payload['employee_id'] ?? '';
}

// ─── Database Connection ──────────────────────────────────────────────────────
/**
 * Create and return a mysqli connection with strict error mode
 */
function getDbConnection(): mysqli
{
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    $conn->set_charset('utf8mb4');
    return $conn;
}

// ─── Employee Helpers ─────────────────────────────────────────────────────────
/**
 * Get employee role from ess_employee_cache
 */
function getEmployeeRole(mysqli $conn, string $employeeId): ?string
{
    $stmt = $conn->prepare('SELECT role FROM ess_employee_cache WHERE employee_id = ?');
    $stmt->bind_param('s', $employeeId);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($row = $result->fetch_assoc()) {
        $stmt->close();
        return $row['role'];
    }
    $stmt->close();
    return null;
}

/**
 * Get team members (employees under the same manager/unit)
 */
function getTeamMembers(mysqli $conn, string $employeeId): array
{
    // First, get the employee's unit and client info
    $stmt = $conn->prepare('SELECT unit_id, client_id FROM ess_employee_cache WHERE employee_id = ?');
    $stmt->bind_param('s', $employeeId);
    $stmt->execute();
    $result = $stmt->get_result();
    $cache = $result->fetch_assoc();
    $stmt->close();

    if (!$cache) {
        return [];
    }

    // Find all employees in the same unit
    $query = 'SELECT employee_id, full_name, designation, role FROM ess_employee_cache WHERE employee_id != ?';
    $types = 's';
    $params = [$employeeId];

    if (!empty($cache['unit_id'])) {
        $query .= ' AND unit_id = ?';
        $types .= 'i';
        $params[] = $cache['unit_id'];
    } elseif (!empty($cache['client_id'])) {
        $query .= ' AND client_id = ?';
        $types .= 'i';
        $params[] = $cache['client_id'];
    }

    $query .= ' ORDER BY full_name';

    $stmt = $conn->prepare($query);
    if (!empty($params) && count($params) > 1) {
        $stmt->bind_param($types, ...$params);
    } else {
        $stmt->bind_param($types, $params[0]);
    }
    $stmt->execute();
    $result = $stmt->get_result();

    $members = [];
    while ($row = $result->fetch_assoc()) {
        $members[] = $row;
    }
    $stmt->close();

    return $members;
}

// ─── Pagination Helper ────────────────────────────────────────────────────────
/**
 * Build pagination metadata
 */
function buildPagination(int $total, int $page, int $limit): array
{
    return [
        'total' => $total,
        'page' => $page,
        'limit' => $limit,
        'total_pages' => $limit > 0 ? (int) ceil($total / $limit) : 0
    ];
}

/**
 * Get pagination params from request with defaults
 */
function getPaginationParams(): array
{
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = min(100, max(1, (int)($_GET['limit'] ?? 20)));
    $offset = ($page - 1) * $limit;
    return [$page, $limit, $offset];
}
