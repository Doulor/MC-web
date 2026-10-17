/**
 * Cloudflare Pages Worker
 * 
 * 功能：
 * 1. 代理 oPanel API 请求到后端服务器（替代原来的 PHP 代理）
 * 2. 处理联系表单提交，通过 Resend API 发送邮件
 * 3. 诊断工具 - 排查 oPanel API 连接问题
 * 4. 代理 Pl3xMap 地图请求（通过域名 firef.cc.cd:22225）
 * 5. 其他请求正常返回静态文件
 */

const OPANEL_BASE = 'http://mc-web-api.doulor.cn:30000';
// 地图代理配置已移除（所有地图相关代理逻辑已清理）。

/* ==================================================================
 * 管理后台（/admin）访问控制
 *
 * 为什么需要这段：
 *   本仓库被 Cloudflare Pages 托管（_headers + _worker.js + 静态文件），而
 *   Pages 不执行 PHP —— /admin/ 下的 *.php 只会被当成静态文件原样返回，
 *   admin/data/*.json 同样是静态文件。这就是渗透报告里的
 *   “/admin/*.php 源码泄露 + /admin/data/*.json 敏感数据泄露”。
 *   （实证：线上 GET /admin/index.php 返回 200 + Content-Type: application/x-httpd-php，
 *     即浏览器能直接下载 PHP 源码。）
 *
 * 策略：默认拒绝。
 *   - /admin 下的一切请求，除下面两个“首页必须用到且不含机密”的数据文件外，
 *     一律返回和普通 404 一模一样的响应。
 *   - 故意用 404 而不是 403：403 等于明确告诉攻击者“这个路径确实存在”，
 *     404 则和 Pages 自带的 not-found 无法区分。
 * ================================================================== */

// 首页 script.js 会 fetch('admin/data/content.json') 渲染 CMS 内容，
// 这份数据本来就会显示在公开页面上，不含机密，必须保持可读，否则首页内容全空。
const ADMIN_PUBLIC_CONTENT_JSON = '/admin/data/content.json';
// 首页也会 fetch 这份设置，但它含 admin_pass_hash（管理员 bcrypt 哈希）和
// smtp_* 凭据，所以不能原样放行 —— 走 serveSanitizedSettings() 脱敏后再返回。
const ADMIN_SANITIZED_SETTINGS_JSON = '/admin/data/settings.json';

const ADMIN_PATH_PREFIX = '/admin';

// 可选：站长在 Pages 项目里配置环境变量 ADMIN_TOKEN 后，
// 请求带上该令牌才允许读取 /admin 下的静态文件（默认不配置 = 全部 404）。
const ADMIN_TOKEN_HEADER = 'x-admin-token';
const ADMIN_TOKEN_QUERY = 'admin_token';

/* ================================================================== */

const ROUTES = {
  '/players.php': {
    apiPath: '/open-api/players',
    displayName: '玩家列表',
    wrapResponse: (data) => ({
      success: true,
      players: (data && data.players) || []
    })
  },
  '/plugins.php': {
    apiPath: '/open-api/plugins',
    displayName: '插件列表',
    wrapResponse: (data) => ({
      success: true,
      plugins: (data && data.plugins) || []
    })
  },
  '/monitor.php': {
    apiPath: '/open-api/monitor',
    displayName: '性能监控',
    wrapResponse: (data) => ({
      success: true,
      data: data || {}
    })
  },
  '/server_status.php': {
    apiPath: '/open-api/info',
    displayName: '服务器信息',
    wrapResponse: (data) => ({
      success: true,
      data: data || {}
    })
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 管理后台门禁必须放在最前面：这样 CORS 预检、ROUTES 代理、静态资源
    // 任何一条路径都绕不过它（漏在后面的分支都可能被当成兜底静态读取）。
    const adminGate = await handleAdminGate(request, env, url);
    if (adminGate) return adminGate;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // 诊断工具
    if (path === '/debug' || path === '/debug.html') {
      return handleDebugPage(request);
    }

    // API 诊断测试端点
    if (path === '/api-test') {
      return handleApiTest(request);
    }

    // 带自定义 Host 头的诊断测试
    if (path === '/api-test-host') {
      return handleApiTestWithHost(request);
    }

    // 详细诊断 - 显示完整响应头
    if (path === '/api-test-debug') {
      return handleApiTestDebug(request);
    }

    // Contact form submission
    if (path === '/submit_message.php') {
      return handleContactForm(request, env);
    }

    // Player detail
    if (path === '/player_detail.php') {
      return handlePlayerDetail(request, url);
    }

    // Map proxy removed - map is now served from external HTTPS at https://map.doulor.cn/

    // Other API routes
    const route = ROUTES[path];
    if (route) {
      return handleApiProxy(request, route);
    }

    // Static files
    try {
      return await env.ASSETS.fetch(request);
    } catch (e) {
      return new Response('Not Found', { status: 404 });
    }
  }
};

// proxyMapRequest removed

/**
 * 把路径规范化成“门禁判定用”的形式。
 *
 * 为什么不能直接比较 url.pathname：
 *   1. Cloudflare / 浏览器可能保留百分号编码（%2e%2e%2f、%41dmin 等），
 *      直接比较字符串会漏判；所以先反复解码（避免双重编码绕过）。
 *   2. 解码后可能出现 ".."，必须重新折叠，防止 /admin/../admin 之类的变体。
 *   3. 统一转小写：某些主机/自定义域按大小写不敏感匹配文件名，
 *      /Admin/index.php 一样能拿到源码，因此门禁按“更严格”的方向判定。
 */
function normalizePathname(pathname) {
  let p = pathname || '/';
  for (let i = 0; i < 3; i++) {
    let decoded;
    try {
      decoded = decodeURIComponent(p);
    } catch (e) {
      // 非法百分号编码，保持原样，交给后面的字符级判定
      break;
    }
    if (decoded === p) break;
    p = decoded;
  }
  const segs = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      segs.pop();
      continue;
    }
    segs.push(seg.toLowerCase());
  }
  return '/' + segs.join('/');
}

/**
 * 与 Pages 自带 404 完全一致的响应体。
 * 每次返回新对象（Response body 只能被消费一次）。
 */
function notFoundResponse() {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // 别让 CDN/浏览器把一次 404 缓存住，也避免泄露缓存命中信息
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

/**
 * 从 ASSETS 读取静态文件，并保持“不存在就当 404”的语义。
 */
async function assetPassthrough(request, env) {
  try {
    const res = await env.ASSETS.fetch(request);
    if (!res || res.status === 404) return notFoundResponse();
    return res;
  } catch (e) {
    return notFoundResponse();
  }
}

// 需要从 settings.json 里剔除的敏感字段：
// 口令哈希、SMTP 账号口令、以及任何名字里带 pass/secret/token/hash/credential/api_key 的键。
const SETTINGS_SECRET_KEY_RE = /(pass|pwd|secret|token|hash|credential|api[_-]?key)/i;

/**
 * 把 settings.json 里的机密字段剥掉后再返回。
 *
 * 为什么要脱敏而不是整个 404：
 *   首页 script.js 现在确实会 fetch 这个文件（当前只是存到 window.SETTINGS，
 *   暂时没有读取方，但保留可读性可以避免未来功能被这一刀切砍掉），
 *   而真正致命的是 admin_pass_hash（bcrypt）和 smtp_* （邮箱凭据），
 *   把它们去掉即可，既不影响前端，也不再泄露。
 */
function sanitizeSettings(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return {};
  const out = {};
  for (const key of Object.keys(cfg)) {
    const lower = key.toLowerCase();
    if (SETTINGS_SECRET_KEY_RE.test(lower)) continue;          // 口令/哈希/密钥类
    if (lower.startsWith('smtp_') && lower !== 'smtp_from_name') continue; // SMTP 主机/账号/口令
    out[key] = cfg[key];
  }
  return out;
}

/**
 * 返回脱敏后的 settings.json。
 */
async function serveSanitizedSettings(request, env) {
  try {
    const settingsUrl = new URL(ADMIN_SANITIZED_SETTINGS_JSON, request.url);
    const res = await env.ASSETS.fetch(new Request(settingsUrl.toString(), { method: 'GET' }));
    if (!res || !res.ok) return notFoundResponse();

    let cfg;
    try {
      cfg = await res.json();
    } catch (e) {
      // 文件存在但不是合法 JSON —— 宁可 404 也不要把原文吐出去
      return notFoundResponse();
    }

    return jsonResponse(sanitizeSettings(cfg), 200, {
      'Cache-Control': 'no-store'
    });
  } catch (e) {
    return notFoundResponse();
  }
}

/**
 * 定长比较，避免通过响应时间猜令牌。
 * 先各自 SHA-256 再逐字节异或累加，长度不同也不会提前 return。
 */
async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b)))
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/**
 * 是否携带了正确的管理凭据。
 *
 * 注意：这条路径只在站长显式配置了环境变量 ADMIN_TOKEN 时才可能为 true；
 * 没有配置就恒为 false（默认拒绝）。即使通过校验，Pages 上也只会返回
 * 静态文件本身 —— PHP 依然不会执行，所以它不能当“后台能用”的方案，
 * 真正可用的后台请参考 admin/README-SECURITY.md（Access / Basic Auth）。
 */
async function isAdminAuthorized(request, env, url) {
  const expected = env && env.ADMIN_TOKEN ? String(env.ADMIN_TOKEN) : '';
  if (!expected) return false; // 未配置令牌 → 任何人都不许进

  // 1) Authorization: Bearer <token>
  const auth = request.headers.get('Authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    if (await timingSafeEqual(auth.slice(7).trim(), expected)) return true;
  }

  // 2) X-Admin-Token: <token>
  const headerToken = request.headers.get(ADMIN_TOKEN_HEADER);
  if (headerToken && (await timingSafeEqual(headerToken, expected))) return true;

  // 3) ?admin_token=<token>（方便直接在浏览器里打开；比较同样定时安全）
  const queryToken = url.searchParams.get(ADMIN_TOKEN_QUERY);
  if (queryToken && (await timingSafeEqual(queryToken, expected))) return true;

  return false;
}

/**
 * /admin 门禁总入口。
 * 返回 Response 表示已处理；返回 null 表示“不是 /admin，继续走后面的正常流程”。
 */
async function handleAdminGate(request, env, url) {
  const norm = normalizePathname(url.pathname);
  const isAdmin = norm === ADMIN_PATH_PREFIX || norm.startsWith(ADMIN_PATH_PREFIX + '/');
  if (!isAdmin) return null;

  // ---- 1. 公开白名单 ----
  // 首页 CMS 内容：必须公开（本来就会渲染到页面上），但也别让它长缓存
  if (norm === ADMIN_PUBLIC_CONTENT_JSON) {
    const res = await assetPassthrough(request, env);
    if (res.status === 404) return res;
    const headers = new Headers(res.headers);
    headers.set('Cache-Control', 'public, max-age=60');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(res.body, { status: res.status, headers });
  }

  // 首页设置：脱敏后公开
  if (norm === ADMIN_SANITIZED_SETTINGS_JSON) {
    return serveSanitizedSettings(request, env);
  }

  // ---- 2. 其余一切默认拒绝 ----
  // 覆盖但不限于：
  //   /admin/index.php、panel.php、config.php、handlers.php、save.php、smtp.php、
  //   forgot_password.php、api.php（PHP 源码）
  //   /admin/data/messages.json（访客姓名/邮箱/留言 —— PII）
  //   /admin/data/login_attempts.json、rate_limit.json（登录风控状态）
  //   /admin/data/.ad_lock、.ad_integrity_cache（点文件）
  //   /admin/uploads/...（用户上传的截图）
  //   /admin/（目录索引）
  if (await isAdminAuthorized(request, env, url)) {
    return assetPassthrough(request, env);
  }
  return notFoundResponse();
}


/**
 * 诊断页面 - HTML
 */
async function handleDebugPage(request) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>oPanel API 连接诊断</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:20px}
.container{max-width:800px;margin:0 auto}
h1{font-size:24px;margin-bottom:8px;color:#f1f5f9}
.subtitle{color:#94a3b8;margin-bottom:24px;font-size:14px}
.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:16px}
.card h2{font-size:16px;margin-bottom:12px;color:#60a5fa}
.info-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #334155;font-size:13px}
.info-row:last-child{border-bottom:none}
.info-label{color:#94a3b8}
.info-value{color:#e2e8f0;font-family:monospace}
.btn{background:#3b82f6;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;margin:4px}
.btn:hover{background:#2563eb}
.btn:disabled{opacity:0.5;cursor:not-allowed}
.btn-danger{background:#ef4444}
.btn-danger:hover{background:#dc2626}
.result-box{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px;margin-top:12px;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto}
.result-box.success{border-color:#22c55e}
.result-box.error{border-color:#ef4444}
.result-box.forbidden{border-color:#f97316}
.status-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold}
.status-badge.ok{background:#166534;color:#86efac}
.status-badge.fail{background:#7f1d1d;color:#fca5a5}
.status-badge.warn{background:#713f12;color:#fcd34d}
.summary{margin-top:16px;padding:12px;border-radius:8px;font-size:14px}
.summary.error{background:#7f1d1d;border:1px solid #ef4444;color:#fca5a5}
.summary.success{background:#166534;border:1px solid #22c55e;color:#86efac}
.summary.info{background:#1e3a5f;border:1px solid #3b82f6;color:#93c5fd}
.summary.forbidden{background:#7c2d12;border:1px solid #ea580c;color:#fdba74}
.loading{display:inline-block;width:16px;height:16px;border:2px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:8px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
.tips{background:#1e3a5f;border:1px solid #3b82f6;border-radius:8px;padding:16px;margin-bottom:16px;font-size:13px;line-height:1.6}
.tips h3{color:#60a5fa;margin-bottom:8px;font-size:14px}
.tips li{margin-bottom:4px;color:#bfdbfe}
.footer-text{text-align:center;color:#475569;font-size:12px;margin-top:24px}
</style>
</head>
<body>
<div class="container">
<h1>🔍 oPanel API 连接诊断</h1>
<p class="subtitle">诊断 Cloudflare Worker 到 oPanel 服务器 (39.97.183.32:30000) 的连接状况</p>

<div class="card">
<h2>📋 诊断信息</h2>
<div id="envInfo"></div>
</div>

<div class="tips">
<h3>💡 已确认：403 来自 frp 的 Host 头检查</h3>
<p style="color:#bfdbfe;font-size:13px;margin-top:8px;line-height:1.6;">
你的架构：家用服务器(oPanel:3000) → frp 内网穿透 → 阿里云轻量服务器(39.97.183.32:30000) → Cloudflare Worker → 用户<br><br>
<strong>已确认：</strong>oPanel 无 IP 白名单、安全组已开放 0.0.0.0/0、frp 未设置 IP 白名单。<br><br>
<strong>问题原因：</strong>frp 配置了 <code>type = http</code> 模式（而不是 <code>type = tcp</code>）。<br>
frp 的 HTTP 模式会根据请求的 <code>Host</code> 头来路由到不同的后端。Worker 发送请求时 Host 头是 <code>39.97.183.32:30000</code>（IP地址），<br>
frp 找不到匹配的域名路由规则，于是返回 HTTP 403。
</p>
<p style="color:#fbbf24;font-size:13px;margin-top:8px;line-height:1.6;">
<strong>✅ 解决方案（选一个即可）：</strong>
</p>
<ul>
<li><strong>方案一（推荐，改 frp 配置）：</strong>在 frps.ini 中，将 oPanel 的端口转发改为 <code>type = tcp</code>，不要用 <code>type = http</code>。</li>
<li><strong>方案二（不改 frp，改 Worker）：</strong>在 Worker 的请求中设置正确的 <code>Host</code> 头，让它匹配你在 frp 中配置的域名。</li>
</ul>
</div>

<div class="card">
<h2>🧪 运行诊断测试</h2>
<p style="font-size:13px;color:#94a3b8;margin-bottom:12px;">点击下方按钮测试各 API 端点。</p>
<div>
<button class="btn" onclick="testAll()" id="testAllBtn">🔄 测试全部端点</button>
</div>
<div style="margin-top:12px" id="testButtons">
<button class="btn" onclick="testEndpoint('/open-api/info')">📊 服务器信息</button>
<button class="btn" onclick="testEndpoint('/open-api/players')">👥 玩家列表</button>
<button class="btn" onclick="testEndpoint('/open-api/plugins')">🔌 插件列表</button>
<button class="btn" onclick="testEndpoint('/open-api/monitor')">📈 性能监控</button>
<button class="btn btn-danger" onclick="testEndpoint('/nonexistent')">❌ 测试404</button>
</div>
<div id="testResults"></div>
</div>

<div class="card">
<h2>📝 诊断结论</h2>
<div id="diagnosisResult">
<p style="color:#94a3b8;font-size:13px;">运行诊断测试后，这里会显示诊断结论。</p>
</div>
</div>
</div>

<script>
async function loadEnvInfo() {
  const res = await fetch('/api-test?type=env');
  const data = await res.json();
  const el = document.getElementById('envInfo');
  el.innerHTML = '';
  const rows = [
    { label: 'Worker 地区', value: data.colo || '未知' },
    { label: 'oPanel 地址', value: data.opanelUrl },
    { label: '测试时间', value: data.timestamp },
    { label: '请求 IP', value: data.clientIp || '未知' }
  ];
  rows.forEach(function(r) {
    el.innerHTML += '<div class="info-row"><span class="info-label">' + r.label + '</span><span class="info-value">' + r.value + '</span></div>';
  });
}

async function testEndpoint(endpoint) {
  var btns = document.quewdsjctorAll('#testButtons .btn');
  btns.forEach(function(b) { b.disabled = true; });

  var resultsEl = document.getElementById('testResults');
  var testDiv = document.createElement('div');
  testDiv.className = 'result-box';
  testDiv.innerHTML = '<span class="loading"></span> 正在测试 <strong>' + endpoint + '</strong>...';
  resultsEl.prepend(testDiv);

  try {
    var startTime = Date.now();
    var res = await fetch('/api-test?endpoint=' + encodeURIComponent(endpoint));
    var elapsed = Date.now() - startTime;
    var data = await res.json();

    if (data.success) {
      testDiv.className = 'result-box success';
      testDiv.innerHTML = '<span class="status-badge ok">✅ 成功</span> <strong>' + endpoint + '</strong> (' + elapsed + 'ms)<br><br>';
      testDiv.innerHTML += JSON.stringify(data.response, null, 2);
    } else {
      var isForbidden = data.httpStatus === 403 || (data.error && data.error.indexOf('403') !== -1);
      var cls = isForbidden ? 'forbidden' : 'error';
      testDiv.className = 'result-box ' + cls;
      var badge = isForbidden ? '🚫 403 拒绝' : '❌ 失败';
      testDiv.innerHTML = '<span class="status-badge fail">' + badge + '</span> <strong>' + endpoint + '</strong> (' + elapsed + 'ms)<br>';
      testDiv.innerHTML += '<br><strong>错误信息：</strong>' + (data.error || '未知错误');
      testDiv.innerHTML += '<br><strong>HTTP 状态码：</strong>' + (data.httpStatus || 'N/A');
      if (isForbidden) {
        testDiv.innerHTML += '<br><br><span style="color:#fb923c;">💡 这是 frp 的 Host 头检查导致的 403，请在 frps.ini 中将该端口改为 <code>type = tcp</code>。</span>';
      }
    }
  } catch (err) {
    testDiv.className = 'result-box error';
    testDiv.innerHTML = '<span class="status-badge fail">❌ 请求失败</span> <strong>' + endpoint + '</strong><br>';
    testDiv.innerHTML += '<br><strong>错误：</strong>' + err.message;
  }

  btns.forEach(function(b) { b.disabled = false; });
  updateDiagnosis();
}

async function testAll() {
  var btn = document.getElementById('testAllBtn');
  btn.disabled = true;
  btn.textContent = '⏳ 测试中...';

  var endpoints = ['/open-api/info', '/open-api/players', '/open-api/plugins', '/open-api/monitor'];
  for (var i = 0; i < endpoints.length; i++) {
    await testEndpoint(endpoints[i]);
  }

  btn.disabled = false;
  btn.textContent = '🔄 测试全部端点';
}

function updateDiagnosis() {
  var resultBoxes = document.querySelectorAll('.result-box');
  var successCount = 0;
  var failCount = 0;
  var timeoutCount = 0;
  var forbiddenCount = 0;

  resultBoxes.forEach(function(box) {
    if (box.classList.contains('success')) successCount++;
    else if (box.classList.contains('timeout')) timeoutCount++;
    else if (box.classList.contains('forbidden')) forbiddenCount++;
    else if (box.classList.contains('error')) failCount++;
  });

  var el = document.getElementById('diagnosisResult');
  var total = successCount + failCount + timeoutCount + forbiddenCount;
  if (total === 0) return;

  var conclusion = '';
  var cls = 'info';

  if (successCount === total) {
    cls = 'success';
    conclusion = '<strong>✅ 所有端点连接正常！</strong><br><br>';
    conclusion += 'Cloudflare Worker 可以正常连接到 oPanel API。如果前端页面仍然显示"加载失败"，请尝试清除浏览器缓存。';
  } else if (forbiddenCount > 0) {
    cls = 'forbidden';
    conclusion = '<strong>🚫 frp 的 Host 头检查导致 403</strong><br><br>';
    conclusion += '<strong>已排除的原因：</strong><br>';
    conclusion += '✅ oPanel 自身没有 IP 白名单<br>';
    conclusion += '✅ 阿里云安全组已开放 0.0.0.0/0<br>';
    conclusion += '✅ frp 未设置 allow_ips 限制<br><br>';
    conclusion += '<strong>问题原因：</strong>frp 配置的是 <code>type = http</code>（HTTP 模式），它会检查 HTTP 请求的 <code>Host</code> 头来决定路由到哪个后端。';
    conclusion += 'Worker 发送请求时的 Host 头是 <code>39.97.183.32:30000</code>，frp 找不到匹配的域名规则，返回 403。<br><br>';
    conclusion += '<strong>✅ 解决方案：修改 frps.ini</strong><br><br>';
    conclusion += '登录阿里云轻量服务器，找到 frps.ini，找到 oPanel 对应的端口配置：<br><br>';
    conclusion += '<code>[opanel]<br>type = http  ← 改成 tcp<br>local_port = 3000<br>remote_port = 30000</code><br><br>';
    conclusion += '改为：<br><br>';
    conclusion += '<code>[opanel]<br>type = tcp  ← 改这里<br>local_port = 3000<br>remote_port = 30000</code><br><br>';
    conclusion += '然后重启 frp 服务：<code>sudo systemctl restart frps</code> 或 <code>./frps -c frps.ini</code>';
  } else if (timeoutCount > 0) {
    cls = 'error';
    conclusion = '<strong>⚠️ 存在连接超时</strong><br><br>';
    conclusion += '无法连接到 oPanel 服务器，请检查服务器是否在线。';
  } else if (failCount > 0) {
    cls = 'warn';
    conclusion = '<strong>⚠️ 部分端点连接失败</strong>';
    conclusion += '请查看具体错误信息。';
  }

  el.innerHTML = '<div class="summary ' + cls + '">' + conclusion + '</div>';
}

loadEnvInfo();
</script>
<div class="footer-text">MC-web oPanel API 诊断工具 | Cloudflare Worker</div>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

/**
 * API 测试端点
 */
async function handleApiTest(request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const endpoint = url.searchParams.get('endpoint');

  if (type === 'env') {
    const colo = request.cf && request.cf.colo ? request.cf.colo : '未知';
    const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '未知';
    return jsonResponse({
      colo: colo,
      opanelUrl: OPANEL_BASE,
      timestamp: new Date().toISOString(),
      clientIp: clientIp
    });
  }

  if (endpoint) {
    const apiUrl = OPANEL_BASE + endpoint;
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(apiUrl, {
        headers: { 'User-Agent': 'MC-web-Worker-Diagnostic/1.0' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;

      let responseData = null;
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      if (response.ok) {
        return jsonResponse({
          success: true,
          httpStatus: response.status,
          elapsed: elapsed,
          response: responseData
        });
      } else {
        return jsonResponse({
          success: false,
          httpStatus: response.status,
          elapsed: elapsed,
          error: 'HTTP ' + response.status + ' ' + response.statusText,
          errorType: 'http_error',
          response: responseData
        });
      }
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const errorMessage = error.message || String(error);
      let errorType = 'unknown';

      if (error.name === 'AbortError' || errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
        errorType = 'timeout';
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connection refused')) {
        errorType = 'connection_refused';
      } else if (errorMessage.includes('DNS') || errorMessage.includes('dns')) {
        errorType = 'dns_error';
      } else if (errorMessage.includes('TLS') || errorMessage.includes('SSL') || errorMessage.includes('certificate')) {
        errorType = 'tls_error';
      }

      return jsonResponse({
        success: false,
        httpStatus: 'N/A',
        elapsed: elapsed,
        error: errorMessage,
        errorType: errorType,
        errorDetails: JSON.stringify({
          name: error.name,
          message: error.message,
          cause: error.cause ? String(error.cause) : undefined
        }, null, 2)
      });
    }
  }

  return jsonResponse({ success: false, message: '请指定测试端点 (endpoint 参数)' });
}

/**
 * 带自定义 Host 头的 API 测试
 */
async function handleApiTestWithHost(request) {
  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint') || '/open-api/info';
  const hostHeader = url.searchParams.get('host') || '39.97.183.32:30000';
  const apiUrl = OPANEL_BASE + endpoint;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'MC-web-Worker-Diagnostic/1.0',
        'Host': hostHeader
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;

    let responseData = null;
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    return jsonResponse({
      success: response.ok,
      httpStatus: response.status,
      elapsed: elapsed,
      hostHeader: hostHeader,
      response: responseData
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    return jsonResponse({
      success: false,
      httpStatus: 'N/A',
      elapsed: elapsed,
      hostHeader: hostHeader,
      error: error.message
    });
  }
}

async function handleContactForm(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({
      success: false,
      message: 'Invalid request method'
    }, 405);
  }

  try {
    const formData = await request.formData();

    const name = (formData.get('name') || '').trim().slice(0, 50);
    const email = (formData.get('email') || '').trim().slice(0, 100);
    const subject = (formData.get('subject') || '').trim().slice(0, 50);
    const message = (formData.get('message') || '').trim().slice(0, 2000);

    if (!name || !email || !message) {
      return jsonResponse({
        success: false,
        message: '请填写所有必填项'
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({
        success: false,
        message: '请输入有效的邮箱地址'
      });
    }

    const resendApiKey = env.RESEND_API_KEY;
    const contactEmail = env.CONTACT_EMAIL;

    if (!resendApiKey || !contactEmail) {
      return jsonResponse({
        success: false,
        message: '系统邮件服务未配置，请联系管理员'
      });
    }

    const subjectMap = {
      'report': '举报违规',
      'bug': 'Bug反馈',
      'appeal': '封禁申诉',
      'suggestion': '服务器建议',
      'other': '其他事项'
    };
    const subjectLabel = subjectMap[subject] || subject;

    const attachments = [];
    const allowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;

    for (let i = 0; i < 3; i++) {
      const file = formData.get('image_' + i);
      if (!file || typeof file === 'string') continue;
      if (file.size > maxSize) continue;
      if (!allowedMime.includes(file.type)) continue;

      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      attachments.push({
        filename: file.name,
        content: base64,
        content_type: file.type
      });
    }

    const imageCount = attachments.length;
    let imageHtml = '';
    if (imageCount > 0) {
      imageHtml = '<p><strong>附件图片：</strong>' + imageCount + ' 张</p>';
    }

    const escName = escapeHtml(name);
    const escEmail = escapeHtml(email);
    const escSubject = escapeHtml(subjectLabel);
    const escMessage = escapeHtml(message);

    const htmlContent = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; border-radius: 8px;">'
      + '<div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">'
      + '<h1 style="color: white; margin: 0; font-size: 20px;">新的联系表单消息</h1></div>'
      + '<div style="background: white; padding: 20px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">'
      + '<table style="width: 100%; border-collapse: collapse;">'
      + '<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 80px;">发送者</td>'
      + '<td style="padding: 8px 0; font-weight: bold;">' + escName + '</td></tr>'
      + '<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">邮箱</td>'
      + '<td style="padding: 8px 0;"><a href="mailto:' + escEmail + '">' + escEmail + '</a></td></tr>'
      + '<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">主题</td>'
      + '<td style="padding: 8px 0; font-weight: bold;">' + escSubject + '</td></tr>'
      + '</table>'
      + '<div style="border-top: 1px solid #e5e7eb; margin: 16px 0;"></div>'
      + '<h3 style="color: #374151; margin: 0 0 8px 0;">消息内容：</h3>'
      + '<div style="background: #f3f4f6; padding: 16px; border-radius: 6px; white-space: pre-wrap; line-height: 1.6; color: #374151;">'
      + escMessage + '</div>'
      + imageHtml
      + '<div style="border-top: 1px solid #e5e7eb; margin: 16px 0;"></div>'
      + '<p style="color: #9ca3af; font-size: 12px; text-align: center;">此邮件由 MC-web 服务器联系表单自动发送</p>'
      + '</div></div>';

    const senderDomain = contactEmail.split('@')[1] || 'yourdomain.com';
    const resendPayload = {
      from: 'MC-web 联系表单 <noreply@' + senderDomain + '>',
      to: [contactEmail],
      reply_to: email,
      subject: '[新消息] ' + subjectLabel + ' - 来自 ' + name,
      html: htmlContent
    };

    if (attachments.length > 0) {
      resendPayload.attachments = attachments;
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resendPayload)
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error('Resend API error:', resendResponse.status, errorText);
      return jsonResponse({
        success: false,
        message: '邮件发送失败，请稍后重试'
      });
    }

    return jsonResponse({ success: true });

  } catch (error) {
    console.error('Contact form error:', error);
    return jsonResponse({
      success: false,
      message: '处理请求时出错，请稍后重试'
    });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

async function handlePlayerDetail(request, url) {
  const uuid = url.searchParams.get('uuid');
  if (!uuid || uuid.trim() === '') {
    return jsonResponse({
      success: false,
      message: '缺少UUID参数'
    });
  }

  const apiUrl = OPANEL_BASE + '/open-api/players/' + encodeURIComponent(uuid.trim());

  try {
    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'MC-web-Worker/1.0' }
    });

    if (!response.ok) {
      return jsonResponse({
        success: false,
        message: '查询失败: HTTP ' + response.status
      });
    }

    const data = await response.json();
    return jsonResponse({ success: true, data: data });
  } catch (error) {
    return jsonResponse({
      success: false,
      message: '查询失败: ' + error.message
    });
  }
}

async function handleApiProxy(request, route) {
  const apiUrl = OPANEL_BASE + route.apiPath;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'MC-web-Worker/1.0' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return jsonResponse({
        success: false,
        message: '查询失败: HTTP ' + response.status
      });
    }

    const data = await response.json();
    const wrapped = route.wrapResponse(data);
    return jsonResponse(wrapped);
  } catch (error) {
    const errorMessage = error.message || String(error);
    return jsonResponse({
      success: false,
      message: '查询失败: ' + errorMessage
    });
  }
}

/**
 * 详细诊断 - 显示完整响应头和原始响应体
 */
async function handleApiTestDebug(request) {
  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint') || '/open-api/info';
  const apiUrl = OPANEL_BASE + endpoint;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'MC-web-Worker-Diagnostic/1.0' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;

    // 收集所有响应头
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // 读取原始响应体（不限格式）
    const rawBody = await response.text();
    const contentType = response.headers.get('Content-Type') || '';

    return jsonResponse({
      success: response.ok,
      httpStatus: response.status,
      statusText: response.statusText,
      elapsed: elapsed,
      headers: responseHeaders,
      contentType: contentType,
      bodyPreview: rawBody.substring(0, 2000),
      bodyLength: rawBody.length
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    return jsonResponse({
      success: false,
      httpStatus: 'N/A',
      elapsed: elapsed,
      error: error.message,
      errorType: error.name === 'AbortError' ? 'timeout' : 'network_error'
    });
  }
}

function jsonResponse(data, status, extraHeaders) {
  if (status === undefined) status = 200;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff'
  };
  if (extraHeaders) {
    for (const k of Object.keys(extraHeaders)) headers[k] = extraHeaders[k];
  }
  return new Response(JSON.stringify(data), {
    status: status,
    headers: headers
  });
}
