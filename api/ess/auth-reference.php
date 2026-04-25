<?php
/**
 * ═══════════════════════════════════════════════════════════════════
 * ESS Authentication — PHP Reference Implementation
 * ═══════════════════════════════════════════════════════════════════
 *
 * Drop-in replacement for the existing /api/ess/login endpoint.
 * Implements: JWT tokens, rate limiting (5/min), account lock (10 fails),
 * and force PIN change on first login.
 *
 * DEPENDENCIES:
 *   - firebase/php-jwt (composer require firebase/php-jwt)
 *   - MySQL/MariaDB with employees table
 *
 * DATABASE CHANGES NEEDED:
 *
 *   -- Add login attempt tracking columns to employees table:
 *   ALTER TABLE employees ADD COLUMN login_attempts INT DEFAULT 0;
 *   ALTER TABLE employees ADD COLUMN locked_until DATETIME NULL;
 *   ALTER TABLE employees ADD COLUMN has_custom_pin TINYINT(1) DEFAULT 0;
 *
 *   -- Optional: rate limit table for IP-based tracking:
 *   CREATE TABLE login_rate_limits (
 *     id INT AUTO_INCREMENT PRIMARY KEY,
 *     mobile VARCHAR(50) NOT NULL,
 *     ip_address VARCHAR(45) NOT NULL,
 *     attempts INT DEFAULT 1,
 *     window_start DATETIME NOT NULL,
 *     UNIQUE KEY idx_mobile_ip (mobile, ip_address, window_start(1))
 *   );
 *
 * INTEGRATION:
 *   1. Replace the existing login.php handler with this logic
 *   2. Add JWT validation middleware to all other ESS endpoints
 *   3. See validateToken() function below for middleware usage
 */

// ── Configuration ──────────────────────────────────────────────

// IMPORTANT: Move these to environment variables or config.php
$JWT_SECRET     = 'CHANGE_ME_TO_A_RANDOM_64_CHAR_STRING';
$JWT_ALGORITHM  = 'HS256';
$JWT_EXPIRY     = 86400;        // 24 hours in seconds

$RATE_LIMIT_MAX     = 5;         // max attempts per window
$RATE_LIMIT_WINDOW  = 60;        // window in seconds
$LOCKOUT_THRESHOLD  = 10;        // cumulative failures → lock
$LOCKOUT_DURATION   = 1800;      // 30 minutes in seconds

// ── JWT (include via autoloader) ───────────────────────────────
// require_once __DIR__ . '/../vendor/autoload.php';
// use Firebase\JWT\JWT;
// use Firebase\JWT\Key;

// ── Lightweight JWT implementation (if firebase/php-jwt unavailable) ──

if (!class_exists('JWT')) {
    class JWT {
        public static function encode(array $payload, string $key, string $alg = 'HS256'): string {
            $header = self::urlsafeB64Encode(json_encode(['typ' => 'JWT', 'alg' => $alg]));
            $payload['iat'] = time();
            $payload['exp'] = time() + ($payload['exp'] ?? 86400);
            if (!isset($payload['exp_orig'])) {
                $payload['exp'] = time() + 86400;
            }
            $body = self::urlsafeB64Encode(json_encode($payload));
            $sig = self::urlsafeB64Encode(hash_hmac('sha256', "$header.$body", $key, true));
            return "$header.$body.$sig";
        }

        public static function decode(string $jwt, string $key, array $allowedAlgs = ['HS256']): object {
            $parts = explode('.', $jwt);
            if (count($parts) !== 3) throw new Exception('Invalid token format');

            $header = json_decode(self::urlsafeB64Decode($parts[0]));
            $payload = json_decode(self::urlsafeB64Decode($parts[1]));

            if (!$header || !isset($header->alg)) throw new Exception('Invalid token header');
            if (!in_array($header->alg, $allowedAlgs)) throw new Exception('Unsupported algorithm');

            $sig = self::urlsafeB64Encode(hash_hmac('sha256', "$parts[0].$parts[1]", $key, true));
            if (!hash_equals($sig, $parts[2])) throw new Exception('Invalid signature');

            if (isset($payload->exp) && time() > $payload->exp) throw new Exception('Token expired');

            return $payload;
        }

        private static function urlsafeB64Encode(string $data): string {
            return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
        }

        private static function urlsafeB64Decode(string $data): string {
            $remainder = strlen($data) % 4;
            if ($remainder) $data .= str_repeat('=', 4 - $remainder);
            return base64_decode(strtr($data, '-_', '+/'));
        }
    }
}


// ══════════════════════════════════════════════════════════════
// LOGIN HANDLER
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/ess/login
 * Body: { "mobileNumber": "9876543210", "pin": "1234" }
 *
 * Success Response:
 * {
 *   "success": true,
 *   "data": {
 *     "employee": { ... },
 *     "role": "employee",
 *     "token": "eyJhbGciOi...",
 *     "token_expires_at": "2025-01-16T10:00:00+00:00",
 *     "has_custom_pin": true
 *   }
 * }
 *
 * Rate Limited Response:
 * {
 *   "success": false,
 *   "error": "Too many attempts. Try again in 45s.",
 *   "data": {
 *     "rate_limit_remaining": 45,
 *     "rate_limit_attempts_left": 0
 *   }
 * }
 *
 * Locked Response:
 * {
 *   "success": false,
 *   "error": "Account is locked due to too many failed attempts.",
 *   "data": {
 *     "is_locked": true,
 *     "lockout_remaining": 1620
 *   }
 * }
 */
function handleLogin(PDO $pdo, array $input): array {
    global $JWT_SECRET, $JWT_EXPIRY;
    global $RATE_LIMIT_MAX, $RATE_LIMIT_WINDOW, $LOCKOUT_THRESHOLD, $LOCKOUT_DURATION;

    $mobile = preg_replace('/\D/', '', $input['mobileNumber'] ?? '');
    $pin    = $input['pin'] ?? '';
    $ip     = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

    // ── Validate input ──
    if (strlen($mobile) !== 10) {
        return ['success' => false, 'error' => 'Please enter a valid 10-digit mobile number'];
    }
    if (!preg_match('/^\d{4}$/', $pin)) {
        return ['success' => false, 'error' => 'PIN must be exactly 4 digits'];
    }

    // ── Check account lock (DB-level) ──
    $stmt = $pdo->prepare("SELECT id, login_attempts, locked_until FROM employees WHERE mobile_number = ? AND is_active = 1");
    $stmt->execute([$mobile]);
    $empCheck = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$empCheck) {
        // Don't reveal if number exists — generic error
        return ['success' => false, 'error' => 'Invalid mobile number or PIN'];
    }

    $employeeId  = (int) $empCheck['id'];
    $attempts    = (int) $empCheck['login_attempts'];
    $lockedUntil = $empCheck['locked_until'];

    // Check lockout
    if ($lockedUntil && strtotime($lockedUntil) > time()) {
        $remaining = strtotime($lockedUntil) - time();
        return [
            'success' => false,
            'error'   => 'Account is locked due to too many failed attempts.',
            'data'    => [
                'is_locked'        => true,
                'lockout_remaining' => $remaining,
            ],
        ];
    }

    // Clear expired lockout
    if ($lockedUntil && strtotime($lockedUntil) <= time()) {
        $pdo->prepare("UPDATE employees SET login_attempts = 0, locked_until = NULL WHERE id = ?")
            ->execute([$employeeId]);
        $attempts = 0;
    }

    // ── Rate limit check (IP + mobile) ──
    $rateKey = $mobile . ':' . $ip;
    $rateFile = sys_get_temp_dir() . '/ess_rl_' . md5($rateKey);

    $rateData = ['attempts' => 0, 'window_start' => 0];
    if (file_exists($rateFile)) {
        $rateData = json_decode(file_get_contents($rateFile), true) ?: $rateData;
    }

    // Reset window if expired
    if (time() - $rateData['window_start'] > $RATE_LIMIT_WINDOW) {
        $rateData = ['attempts' => 0, 'window_start' => time()];
    }

    // Check rate limit
    if ($rateData['attempts'] >= $RATE_LIMIT_MAX) {
        $remaining = $RATE_LIMIT_WINDOW - (time() - $rateData['window_start']);
        return [
            'success' => false,
            'error'   => "Too many attempts. Try again in {$remaining}s.",
            'data'    => [
                'rate_limit_remaining'    => $remaining,
                'rate_limit_attempts_left' => 0,
            ],
        ];
    }

    // ── Verify PIN ──
    // Use password_hash/password_verify if PIN is hashed (recommended)
    // For now, comparing with stored hash:
    $stmt = $pdo->prepare("SELECT id, employee_code, full_name, mobile_number, pin_hash, has_custom_pin,
        worker_category, employee_role, designation, client_id, unit_id, city, status, profile_pic_url,
        date_of_joining, email
        FROM employees WHERE id = ? AND is_active = 1");
    $stmt->execute([$employeeId]);
    $employee = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$employee || !password_verify($pin, $employee['pin_hash'])) {
        // ── Record failed attempt ──
        $rateData['attempts']++;
        file_put_contents($rateFile, json_encode($rateData), LOCK_EX);

        $newAttempts = $attempts + 1;

        // Check if should lock account
        if ($newAttempts >= $LOCKOUT_THRESHOLD) {
            $lockUntil = date('Y-m-d H:i:s', time() + $LOCKOUT_DURATION);
            $pdo->prepare("UPDATE employees SET login_attempts = ?, locked_until = ? WHERE id = ?")
                ->execute([$newAttempts, $lockUntil, $employeeId]);

            return [
                'success' => false,
                'error'   => 'Account locked for 30 minutes due to too many failed attempts.',
                'data'    => [
                    'is_locked'         => true,
                    'lockout_remaining' => $LOCKOUT_DURATION,
                ],
            ];
        }

        $pdo->prepare("UPDATE employees SET login_attempts = ? WHERE id = ?")
            ->execute([$newAttempts, $employeeId]);

        $remaining = max(0, $RATE_LIMIT_MAX - $rateData['attempts']);
        $errorMsg = 'Invalid mobile number or PIN';
        if ($remaining <= 3 && $remaining > 0) {
            $errorMsg .= " ({$remaining} attempt" . ($remaining === 1 ? '' : 's') . ' remaining)';
        }

        return [
            'success' => false,
            'error'   => $errorMsg,
            'data'    => [
                'rate_limit_remaining'    => max(0, $RATE_LIMIT_WINDOW - (time() - $rateData['window_start'])),
                'rate_limit_attempts_left' => $remaining,
            ],
        ];
    }

    // ── SUCCESS — Reset counters ──
    $pdo->prepare("UPDATE employees SET login_attempts = 0, locked_until = NULL WHERE id = ?")
        ->execute([$employeeId]);
    @unlink($rateFile);

    // ── Generate JWT ──
    $role = detectRole($employee);

    $payload = [
        'employee_id'   => $employeeId,
        'employee_code' => $employee['employee_code'],
        'role'          => $role,
        'exp'           => time() + $JWT_EXPIRY,
    ];

    $token = JWT::encode($payload, $JWT_SECRET, 'HS256');
    $expiresAt = date('c', time() + $JWT_EXPIRY);

    // ── Build response ──
    $employeeData = [
        'id'                => $employeeId,
        'employee_code'     => $employee['employee_code'],
        'full_name'         => $employee['full_name'],
        'mobile_number'     => $employee['mobile_number'],
        'email'             => $employee['email'],
        'worker_category'   => $employee['worker_category'],
        'employee_role'     => $employee['employee_role'],
        'designation'       => $employee['designation'],
        'client_id'         => $employee['client_id'],
        'unit_id'           => $employee['unit_id'],
        'city'              => $employee['city'],
        'status'            => $employee['status'],
        'profile_pic_url'   => $employee['profile_pic_url'],
        'date_of_joining'   => $employee['date_of_joining'],
        'has_custom_pin'    => (bool) ($employee['has_custom_pin'] ?? 0),
    ];

    return [
        'success' => true,
        'data'    => [
            'employee'          => $employeeData,
            'role'              => $role,
            'token'             => $token,
            'token_expires_at'  => $expiresAt,
            'has_custom_pin'    => (bool) ($employee['has_custom_pin'] ?? 0),
        ],
    ];
}


// ══════════════════════════════════════════════════════════════
// CHANGE PIN HANDLER
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/ess/pin
 * Headers: Authorization: Bearer <token>
 * Body: { "current_pin": "1234", "new_pin": "5678" }
 *
 * Response:
 * { "success": true, "message": "PIN changed successfully" }
 */
function handleChangePin(PDO $pdo, array $input, object $jwtPayload): array {
    $employeeId = (int) $jwtPayload->employee_id;
    $currentPin = $input['current_pin'] ?? '';
    $newPin     = $input['new_pin'] ?? '';

    if (!preg_match('/^\d{4}$/', $currentPin)) {
        return ['success' => false, 'error' => 'Current PIN must be 4 digits'];
    }
    if (!preg_match('/^\d{4}$/', $newPin)) {
        return ['success' => false, 'error' => 'New PIN must be 4 digits'];
    }
    if ($currentPin === $newPin) {
        return ['success' => false, 'error' => 'New PIN must be different from current PIN'];
    }

    // Verify current PIN
    $stmt = $pdo->prepare("SELECT pin_hash FROM employees WHERE id = ? AND is_active = 1");
    $stmt->execute([$employeeId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row || !password_verify($currentPin, $row['pin_hash'])) {
        return ['success' => false, 'error' => 'Current PIN is incorrect'];
    }

    // Hash and save new PIN
    $newHash = password_hash($newPin, PASSWORD_BCRYPT);
    $pdo->prepare("UPDATE employees SET pin_hash = ?, has_custom_pin = 1 WHERE id = ?")
        ->execute([$newHash, $employeeId]);

    return ['success' => true, 'message' => 'PIN changed successfully'];
}


// ══════════════════════════════════════════════════════════════
// TOKEN VALIDATION — Use as middleware for all protected endpoints
// ══════════════════════════════════════════════════════════════

/**
 * Validate JWT token from Authorization header.
 * Call this at the top of every protected ESS endpoint.
 *
 * Usage:
 *   $jwt = validateToken();
 *   if (!$jwt) {
 *       http_response_code(401);
 *       echo json_encode(['success' => false, 'error' => 'Invalid or expired token']);
 *       exit;
 *   }
 *   $employeeId = (int) $jwt->employee_id;
 *
 * Returns: object|null — JWT payload or null on failure
 */
function validateToken(string $secret = null): ?object {
    global $JWT_SECRET;
    $secret = $secret ?? $JWT_SECRET;

    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if (empty($authHeader) || !str_starts_with($authHeader, 'Bearer ')) {
        return null;
    }

    $token = substr($authHeader, 7);
    if (empty($token)) return null;

    try {
        $payload = JWT::decode($token, $secret, ['HS256']);
        return $payload;
    } catch (Exception $e) {
        error_log("JWT validation failed: " . $e->getMessage());
        return null;
    }
}

/**
 * Example: Protected endpoint middleware pattern
 *
 * function requireAuth(): object {
 *     $jwt = validateToken();
 *     if (!$jwt) {
 *         http_response_code(401);
 *         header('Content-Type: application/json');
 *         echo json_encode([
 *             'success' => false,
 *             'error'   => 'Authentication required. Please login again.',
 *         ]);
 *         exit;
 *     }
 *     return $jwt;
 * }
 *
 * // Usage in any protected endpoint:
 * $jwt = requireAuth();
 * $employeeId = (int) $jwt->employee_id;
 * $role = $jwt->role;
 */


// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function detectRole(array $employee): string {
    $category = strtolower($employee['worker_category'] ?? '');
    $role     = strtolower($employee['employee_role'] ?? '');

    if (str_contains($category, 'regional') || str_contains($role, 'regional')) return 'regional_manager';
    if (str_contains($category, 'manager') || str_contains($role, 'manager'))    return 'manager';
    if (str_contains($category, 'supervisor') || str_contains($role, 'supervisor') || str_contains($category, 'team lead')) return 'supervisor';
    return 'employee';
}

function jsonOutput(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}


// ══════════════════════════════════════════════════════════════
// ROUTER — Example integration pattern
// ══════════════════════════════════════════════════════════════

/**
 * Add this to your existing login.php or router:
 *
 * // ── In login.php ──
 * $input = json_decode(file_get_contents('php://input'), true) ?: [];
 *
 * if ($_SERVER['REQUEST_METHOD'] === 'POST') {
 *     $result = handleLogin($pdo, $input);
 *     $code = $result['success'] ? 200 : ($result['data']['is_locked'] ?? false ? 429 : 401);
 *     jsonOutput($result, $code);
 * }
 *
 *
 * // ── In pin.php (change PIN) ──
 * $jwt = validateToken();
 * if (!$jwt) {
 *     http_response_code(401);
 *     jsonOutput(['success' => false, 'error' => 'Authentication required'], 401);
 * }
 * $input = json_decode(file_get_contents('php://input'), true) ?: [];
 * $result = handleChangePin($pdo, $input, $jwt);
 * jsonOutput($result, $result['success'] ? 200 : 400);
 *
 *
 * // ── In ALL other ESS endpoints (attendance, leaves, etc.) ──
 * $jwt = validateToken();
 * if (!$jwt) {
 *     http_response_code(401);
 *     jsonOutput(['success' => false, 'error' => 'Session expired. Please login again.'], 401);
 * }
 * // Use $jwt->employee_id instead of reading from request body
 * // DELETE: $input['employee_id'] from frontend — use token instead
 * $employeeId = (int) $jwt->employee_id;
 */
