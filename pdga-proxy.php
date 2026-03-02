<?php
// /dgst/pdga-proxy.php
// PDGA HTML proxy w/ disk cache.
// Normal browsing:
//   - serves fresh cache within TTL
//   - may serve stale cache on upstream 429/5xx within stale window
// Manual force refresh (?force=1):
//   - deletes disk cache for the requested URL
//   - ALWAYS fetches upstream with a unique cache-buster param (dgst_bust=...)
//   - NEVER serves stale cached data
//   - surfaces upstream errors clearly (returns upstream status, including 429)
// Adds headers:
//   X-DGST-Cache: HIT | MISS | FORCE MISS | STALE (...)
//   X-DGST-Fetch-Time: unix epoch seconds of when the body was fetched (cache meta time for HIT/STALE; now for MISS)
//   X-DGST-Upstream-Code: upstream HTTP status (when known)

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
  echo "Missing ?url=";
  exit;
}

$FORCE = (isset($_GET['force']) && (string)$_GET['force'] === '1');

// Basic URL validation + allow-list hosts
$parts = parse_url($url);
if (!$parts || !isset($parts['scheme']) || !isset($parts['host'])) {
  http_response_code(400);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Invalid URL";
  exit;
}

$scheme = strtolower($parts['scheme']);
$host   = strtolower($parts['host']);
$path   = isset($parts['path']) ? $parts['path'] : '/';

if ($scheme !== 'https' && $scheme !== 'http') {
  http_response_code(400);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Invalid scheme";
  exit;
}

if (!in_array($host, $ALLOWED_HOSTS, true)) {
  http_response_code(403);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Host not allowed";
  exit;
}

// ---- caching policy ----
$isSearch = (strpos($path, '/tour/search') === 0);
$ttlFreshSeconds = $isSearch ? 300 : 3600;     // 5 min for search, 1 hr for event
$ttlStaleSeconds = $isSearch ? 3600 : 86400;   // stale window (serve if rate-limited) -- ONLY for non-force

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

function write_cache($cacheFile, $metaFile, $body, $t) {
  @file_put_contents($cacheFile, $body, LOCK_EX);
  @file_put_contents($metaFile, json_encode(array('time' => (int)$t)), LOCK_EX);
}

function common_headers() {
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
}

function send_html($body, $cacheHeader, $forceNoStore, $fetchTime, $upstreamCode) {
  common_headers();
  if ($forceNoStore) {
    header('Cache-Control: no-store, max-age=0');
  } else {
    header('Cache-Control: public, max-age=60');
  }
  header('Content-Type: text/html; charset=utf-8');
  header('X-DGST-Cache: ' . $cacheHeader);
  header('X-DGST-Fetch-Time: ' . (int)$fetchTime);
  if ($upstreamCode !== null) header('X-DGST-Upstream-Code: ' . (int)$upstreamCode);
  echo $body;
  exit;
}

function send_error($status, $message, $forceNoStore, $upstreamCode) {
  common_headers();
  if ($forceNoStore) header('Cache-Control: no-store, max-age=0');
  header('Content-Type: text/plain; charset=utf-8');
  if ($upstreamCode !== null) header('X-DGST-Upstream-Code: ' . (int)$upstreamCode);
  http_response_code((int)$status);
  echo $message;
  exit;
}

// Force: delete disk cache for this URL and bypass reads
if ($FORCE) {
  if (is_file($cacheFile)) @unlink($cacheFile);
  if (is_file($metaFile))  @unlink($metaFile);
}

// Read cache (unless force)
$cached = $FORCE ? null : read_cache($cacheFile, $metaFile);
$now = time();

// Serve fresh cache immediately if within TTL
if ($cached && ($now - $cached['time'] <= $ttlFreshSeconds)) {
  send_html($cached['body'], 'HIT', false, $cached['time'], 200);
}

// When forcing refresh, also bypass PDGA/CDN edge caches by adding a unique query param.
$fetchUrl = $url;
if ($FORCE) {
  $sep = (strpos($fetchUrl, '?') !== false) ? '&' : '?';
  $fetchUrl .= $sep . 'dgst_bust=' . $now . '_' . mt_rand(1000, 9999);
}

// ---- fetch upstream ----
$upstreamCode = null;

if (!function_exists('curl_init')) {
  $ctx = stream_context_create(array(
    'http' => array(
      'method' => 'GET',
      'timeout' => $TIMEOUT,
      'header' =>
        "User-Agent: dgst-proxy/1.2 (+https://chumworx.com/dgst)\r\n" .
        "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n" .
        "Accept-Language: en-US,en;q=0.8\r\n" .
        "Cache-Control: no-cache\r\n" .
        "Pragma: no-cache\r\n"
    )
  ));

  $data = @file_get_contents($fetchUrl, false, $ctx);

  if ($data === false) {
    // FORCE must never serve stale.
    if ($FORCE) {
      send_error(502, "Upstream fetch failed (no curl and file_get_contents failed)", true, null);
    }

    // Non-force: may serve stale cache if allowed
    if ($cached && ($now - $cached['time'] <= $ttlStaleSeconds)) {
      send_html($cached['body'], 'STALE (no curl)', false, $cached['time'], 200);
    }

    send_error(502, "Upstream fetch failed (no curl and file_get_contents failed)", false, null);
  }

  if (strlen($data) > $MAX_BYTES) {
    send_error(413, "Upstream response too large", $FORCE, null);
  }

  // Treat stream fetch as 200 if we got bytes.
  $upstreamCode = 200;

  // Cache successful response and return it
  write_cache($cacheFile, $metaFile, $data, $now);
  send_html($data, $FORCE ? 'FORCE MISS (no curl)' : 'MISS (no curl)', $FORCE, $now, $upstreamCode);
}

// cURL path
$ch = curl_init($fetchUrl);
curl_setopt_array($ch, array(
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_MAXREDIRS      => 3,
  CURLOPT_TIMEOUT        => $TIMEOUT,
  CURLOPT_CONNECTTIMEOUT => 8,
  CURLOPT_USERAGENT      => 'dgst-proxy/1.2 (+https://chumworx.com/dgst)',
  CURLOPT_HTTPHEADER     => array(
    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language: en-US,en;q=0.8',
    'Cache-Control: no-cache',
    'Pragma: no-cache'
  ),
  // Help avoid connection reuse weirdness when forcing refresh
  CURLOPT_FRESH_CONNECT  => $FORCE ? true : false,
  CURLOPT_FORBID_REUSE   => $FORCE ? true : false
));

$data = curl_exec($ch);
$err  = curl_error($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$upstreamCode = (int)$code;

if ($data === false) {
  // FORCE must never serve stale.
  if ($FORCE) {
    send_error(502, "Upstream fetch failed: " . $err, true, $upstreamCode);
  }

  // Non-force: may serve stale cache
  if ($cached && ($now - $cached['time'] <= $ttlStaleSeconds)) {
    send_html($cached['body'], 'STALE (curl error)', false, $cached['time'], 200);
  }

  send_error(502, "Upstream fetch failed: " . $err, false, $upstreamCode);
}

if (strlen($data) > $MAX_BYTES) {
  send_error(413, "Upstream response too large", $FORCE, $upstreamCode);
}

// If upstream 429 or non-2xx:
if ($upstreamCode === 429) {
  // FORCE must never serve stale; return 429.
  if ($FORCE) {
    send_error(429, "Upstream returned HTTP 429 (rate limited). Please wait and try again.", true, $upstreamCode);
  }

  // Non-force: may serve stale
  if ($cached && ($now - $cached['time'] <= $ttlStaleSeconds)) {
    send_html($cached['body'], 'STALE (429)', false, $cached['time'], 200);
  }

  send_error(429, "Upstream returned HTTP 429 (rate limited).", false, $upstreamCode);
}

if ($upstreamCode < 200 || $upstreamCode >= 300) {
  // FORCE must never serve stale; return upstream status.
  if ($FORCE) {
    send_error($upstreamCode, "Upstream returned HTTP " . $upstreamCode, true, $upstreamCode);
  }

  // Non-force: may serve stale
  if ($cached && ($now - $cached['time'] <= $ttlStaleSeconds)) {
    send_html($cached['body'], 'STALE (http error)', false, $cached['time'], 200);
  }

  send_error(502, "Upstream returned HTTP " . $upstreamCode, false, $upstreamCode);
}

// Cache successful response and return it
write_cache($cacheFile, $metaFile, $data, $now);
send_html($data, $FORCE ? 'FORCE MISS' : 'MISS', $FORCE, $now, $upstreamCode);