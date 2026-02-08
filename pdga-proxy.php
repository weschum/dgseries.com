<?php
// /dgst/pdga-proxy.php
// PDGA HTML proxy w/ disk cache + serve-stale-on-429.
// Compatible with older PHP/cURL (uses CURLINFO_HTTP_CODE).

// Handle CORS preflight quickly
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
  http_response_code(204);
  exit;
}

$ALLOWED_HOSTS = array('www.pdga.com', 'pdga.com');
$MAX_BYTES = 2000000; // 2MB
$TIMEOUT = 15;

// Cache directory (create if missing)
$CACHE_DIR = __DIR__ . '/.pdga-cache';
if (!is_dir($CACHE_DIR)) {
  @mkdir($CACHE_DIR, 0755, true);
}

// ---- input ----
$url = isset($_GET['url']) ? $_GET['url'] : '';
if (!$url) {
  http_response_code(400);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Missing required query param: url";
  exit;
}

$parts = parse_url($url);
if (!$parts || !isset($parts['scheme']) || !isset($parts['host']) || !isset($parts['path'])) {
  http_response_code(400);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Invalid url";
  exit;
}

$scheme = strtolower($parts['scheme']);
$host   = strtolower($parts['host']);
$path   = $parts['path'];

if ($scheme !== 'https') {
  http_response_code(400);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Only https URLs are allowed";
  exit;
}

if (!in_array($host, $ALLOWED_HOSTS, true)) {
  http_response_code(403);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Host not allowed";
  exit;
}

// NOTE: Previously we restricted to only specific PDGA paths.
// That broke discovery/results when PDGA uses additional valid endpoints.
// We now allow any path on the allowed PDGA hosts.
// (Host + scheme restrictions remain the main security boundary.)

// ---- caching policy ----
$isSearch = (strpos($path, '/tour/search') === 0);
$ttlFreshSeconds = $isSearch ? 300 : 3600;     // 5 min for search, 1 hr for event
$ttlStaleSeconds = $isSearch ? 3600 : 86400;   // stale window (serve if rate-limited)

$cacheKey  = sha1($url);
$cacheFile = $CACHE_DIR . '/' . $cacheKey . '.html';
$metaFile  = $CACHE_DIR . '/' . $cacheKey . '.json';

function read_cache($cacheFile, $metaFile) {
  if (!is_file($cacheFile) || !is_file($metaFile)) return null;
  $metaText = @file_get_contents($metaFile);
  if ($metaText === false) return null;
  $meta = json_decode($metaText, true);
  if (!$meta || !isset($meta['time'])) return null;
  $body = @file_get_contents($cacheFile);
  if ($body === false) return null;
  return array('time' => (int)$meta['time'], 'body' => $body);
}

function write_cache($cacheFile, $metaFile, $body) {
  // If disk is read-only or permissions fail, we simply won't cache (no fatal)
  @file_put_contents($cacheFile, $body, LOCK_EX);
  @file_put_contents($metaFile, json_encode(array('time' => time())), LOCK_EX);
}

$cached = read_cache($cacheFile, $metaFile);
$now = time();

function send_html($body, $cacheHeader) {
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
  header('Cache-Control: public, max-age=60');
  header('Content-Type: text/html; charset=utf-8');
  header('X-DGST-Cache: ' . $cacheHeader);
  echo $body;
  exit;
}

// Serve fresh cache immediately if within TTL
if ($cached && ($now - $cached['time'] <= $ttlFreshSeconds)) {
  send_html($cached['body'], 'HIT');
}

// ---- fetch upstream ----
if (!function_exists('curl_init')) {
  // cURL not available; fall back to file_get_contents
  $ctx = stream_context_create(array(
    'http' => array(
      'method' => 'GET',
      'timeout' => $TIMEOUT,
      'header' =>
        "User-Agent: dgst-proxy/1.0 (+https://chumworx.com/dgst)\r\n" .
        "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n" .
        "Accept-Language: en-US,en;q=0.8\r\n"
    )
  ));
  $data = @file_get_contents($url, false, $ctx);
  if ($data === false) {
    if ($cached && ($now - $cached['time'] <= $ttlStaleSeconds)) {
      send_html($cached['body'], 'STALE (no curl)');
    }
    http_response_code(502);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Upstream fetch failed (no curl and file_get_contents failed)";
    exit;
  }

  if (strlen($data) > $MAX_BYTES) {
    http_response_code(413);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Upstream response too large";
    exit;
  }

  write_cache($cacheFile, $metaFile, $data);
  send_html($data, 'MISS (no curl)');
}

// cURL path
$ch = curl_init($url);
curl_setopt_array($ch, array(
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_MAXREDIRS      => 3,
  CURLOPT_TIMEOUT        => $TIMEOUT,
  CURLOPT_CONNECTTIMEOUT => 8,
  CURLOPT_USERAGENT      => 'dgst-proxy/1.0 (+https://chumworx.com/dgst)',
  CURLOPT_HTTPHEADER     => array(
    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language: en-US,en;q=0.8'
  )
));

$data = curl_exec($ch);
$err  = curl_error($ch);
// IMPORTANT: older builds use CURLINFO_HTTP_CODE
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($data === false) {
  if ($cached && ($now - $cached['time'] <= $ttlStaleSeconds)) {
    send_html($cached['body'], 'STALE (curl error)');
  }
  http_response_code(502);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Upstream fetch failed: " . $err;
  exit;
}

if (strlen($data) > $MAX_BYTES) {
  http_response_code(413);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Upstream response too large";
  exit;
}

// If rate limited, serve cached if available
if ((int)$code === 429) {
  if ($cached && ($now - $cached['time'] <= $ttlStaleSeconds)) {
    send_html($cached['body'], 'STALE (429)');
  }
  http_response_code(502);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Upstream returned HTTP 429";
  exit;
}

// Other non-2xx => serve cache if possible
if ((int)$code < 200 || (int)$code >= 300) {
  if ($cached && ($now - $cached['time'] <= $ttlStaleSeconds)) {
    send_html($cached['body'], 'STALE (http error)');
  }
  http_response_code(502);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Upstream returned HTTP " . (int)$code;
  exit;
}

// Cache successful response and return it
write_cache($cacheFile, $metaFile, $data);
send_html($data, 'MISS');
