<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$cfg = dirname(__DIR__) . '/private/db_config.php';
if (!file_exists($cfg)) {
    http_response_code(500);
    echo json_encode(['error' => 'DB config missing']);
    exit;
}
require $cfg;

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB connection failed']);
    exit;
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'get_stored_results': get_stored_results($pdo); break;
    case 'store_event':        store_event($pdo);        break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
}

// ─── GET stored results for a series ────────────────────────────────────────

function get_stored_results(PDO $pdo): void {
    $series_id = trim($_GET['series_id'] ?? '');
    if (!$series_id) {
        http_response_code(400);
        echo json_encode(['error' => 'series_id required']);
        return;
    }

    $stmt = $pdo->prepare('
        SELECT id, pdga_event_id, pdga_name, short_label, pdga_url,
               date_text, start_ms, end_ms, status, is_cancelled
        FROM   events
        WHERE  series_id = ? AND is_cancelled = 0
        ORDER  BY start_ms ASC
    ');
    $stmt->execute([$series_id]);
    $events = $stmt->fetchAll();

    if (!$events) {
        echo json_encode(['events' => [], 'results' => []]);
        return;
    }

    $ids          = array_column($events, 'id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    $stmt = $pdo->prepare("
        SELECT event_id, division, place, points, name, pdga_num, rating,
               par, total, prize, pdga_pts,
               rd1,  rd1_rating,  rd2,  rd2_rating,  rd3,  rd3_rating,
               rd4,  rd4_rating,  rd5,  rd5_rating,  rd6,  rd6_rating,
               rd7,  rd7_rating,  rd8,  rd8_rating,  rd9,  rd9_rating,
               rd10, rd10_rating
        FROM   event_results
        WHERE  event_id IN ($placeholders)
        ORDER  BY event_id, division, CAST(place AS UNSIGNED)
    ");
    $stmt->execute($ids);
    $results = $stmt->fetchAll();

    // Camel-case keys to match existing JS data structures
    $events  = array_map('snake_to_camel_event',  $events);
    $results = array_map('snake_to_camel_result', $results);

    echo json_encode(['events' => $events, 'results' => $results]);
}

// ─── POST store event + results ──────────────────────────────────────────────

function store_event(PDO $pdo): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'POST required']);
        return;
    }

    $body = json_decode(file_get_contents('php://input'), true);
    if (!$body) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        return;
    }

    $series_id = trim($body['seriesId'] ?? '');
    $ev        = $body['event']   ?? null;
    $rows      = $body['results'] ?? [];

    if (!$series_id || !$ev) {
        http_response_code(400);
        echo json_encode(['error' => 'seriesId and event required']);
        return;
    }

    $status = $ev['status'] ?? '';
    if (!in_array($status, ['official', 'unofficial'], true)) {
        echo json_encode(['stored' => false, 'reason' => 'status not storable: ' . $status]);
        return;
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare('
            INSERT INTO events
                (pdga_event_id, series_id, pdga_name, short_label, pdga_url,
                 date_text, start_ms, end_ms, status, is_cancelled)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
                pdga_name    = VALUES(pdga_name),
                pdga_url     = VALUES(pdga_url),
                date_text    = VALUES(date_text),
                start_ms     = VALUES(start_ms),
                end_ms       = VALUES(end_ms),
                status       = VALUES(status),
                is_cancelled = VALUES(is_cancelled),
                updated_at   = CURRENT_TIMESTAMP
        ');
        $stmt->execute([
            $ev['pdgaEventId']  ?? '',
            $series_id,
            $ev['pdgaName']     ?? '',
            $ev['shortLabel']   ?? '',
            $ev['pdgaUrl']      ?? '',
            $ev['dateText']     ?? '',
            isset($ev['startMs']) ? (int)$ev['startMs'] : null,
            isset($ev['endMs'])   ? (int)$ev['endMs']   : null,
            $status,
            empty($ev['isCancelled']) ? 0 : 1,
        ]);

        $event_db_id = (int)$pdo->lastInsertId();
        if (!$event_db_id) {
            $s = $pdo->prepare('SELECT id FROM events WHERE series_id = ? AND pdga_event_id = ?');
            $s->execute([$series_id, $ev['pdgaEventId'] ?? '']);
            $event_db_id = (int)$s->fetchColumn();
        }

        if ($rows && $event_db_id) {
            $pdo->prepare('DELETE FROM event_results WHERE event_id = ?')->execute([$event_db_id]);

            $ins = $pdo->prepare('
                INSERT INTO event_results
                    (event_id, series_id, division, place, points, name, pdga_num,
                     rating, par, total, prize, pdga_pts,
                     rd1,  rd1_rating,  rd2,  rd2_rating,  rd3,  rd3_rating,
                     rd4,  rd4_rating,  rd5,  rd5_rating,  rd6,  rd6_rating,
                     rd7,  rd7_rating,  rd8,  rd8_rating,  rd9,  rd9_rating,
                     rd10, rd10_rating)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ');

            foreach ($rows as $r) {
                $ins->execute([
                    $event_db_id,
                    $series_id,
                    $r['division']   ?? '',
                    $r['place']      ?? '',
                    isset($r['points']) ? (float)$r['points'] : null,
                    $r['name']       ?? '',
                    $r['pdgaNum']    ?? '',
                    $r['rating']     ?? '',
                    $r['par']        ?? '',
                    $r['total']      ?? '',
                    $r['prize']      ?? '',
                    $r['pdgaPts']    ?? '',
                    $r['rd1']        ?? '', $r['rd1Rating']  ?? '',
                    $r['rd2']        ?? '', $r['rd2Rating']  ?? '',
                    $r['rd3']        ?? '', $r['rd3Rating']  ?? '',
                    $r['rd4']        ?? '', $r['rd4Rating']  ?? '',
                    $r['rd5']        ?? '', $r['rd5Rating']  ?? '',
                    $r['rd6']        ?? '', $r['rd6Rating']  ?? '',
                    $r['rd7']        ?? '', $r['rd7Rating']  ?? '',
                    $r['rd8']        ?? '', $r['rd8Rating']  ?? '',
                    $r['rd9']        ?? '', $r['rd9Rating']  ?? '',
                    $r['rd10']       ?? '', $r['rd10Rating'] ?? '',
                ]);
            }
        }

        $pdo->commit();
        echo json_encode(['stored' => true, 'eventDbId' => $event_db_id]);

    } catch (PDOException $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'DB error']);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function snake_to_camel_event(array $row): array {
    return [
        'id'          => (int)$row['id'],
        'pdgaEventId' => $row['pdga_event_id'],
        'pdgaName'    => $row['pdga_name'],
        'shortLabel'  => $row['short_label'],
        'pdgaUrl'     => $row['pdga_url'],
        'dateText'    => $row['date_text'],
        'startMs'     => $row['start_ms'] !== null ? (int)$row['start_ms'] : null,
        'endMs'       => $row['end_ms']   !== null ? (int)$row['end_ms']   : null,
        'status'      => $row['status'],
        'isCancelled' => (bool)$row['is_cancelled'],
        'fromDb'      => true,
    ];
}

function snake_to_camel_result(array $row): array {
    $out = [
        'eventId'  => (int)$row['event_id'],
        'division' => $row['division'],
        'place'    => $row['place'],
        'points'   => $row['points'] !== null ? (float)$row['points'] : null,
        'name'     => $row['name'],
        'pdgaNum'  => $row['pdga_num'],
        'rating'   => $row['rating'],
        'par'      => $row['par'],
        'total'    => $row['total'],
        'prize'    => $row['prize'],
        'pdgaPts'  => $row['pdga_pts'],
    ];
    for ($i = 1; $i <= 10; $i++) {
        $out["rd$i"]        = $row["rd$i"];
        $out["rd{$i}Rating"] = $row["rd{$i}_rating"];
    }
    return $out;
}
