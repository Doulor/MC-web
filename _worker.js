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
// 地图服务器配置
// firef.cc.cd:22225 托管于 Azure，解析到 13.75.68.60
// 注意：如果 firef.cc.cd 开启了 Cloudflare 代理（橙色云），Worker 无法通过域名直连
// 备选方案：使用 IP 地址直接访问 (http://13.75.68.60:22225) 并设置 Host 头
// 当前使用域名，需要确保 firef.cc.cd:22225 未经过 Cloudflare 代理
const MAP_BASE = 'http://13.75.68.60:22225';
// Use the hostname (with port if required) for the Host header. For frp/http routing that expects the port
// include it here (common cause of 403). We set the port-included host so the origin/frp will accept the request.
const MAP_DOMAIN = 'firef.cc.cd:22225';

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

    // Map proxy - 代理 Pl3xMap 地图请求（通过域名 firef.cc.cd:22225）
    if (path === '/map' || path === '/map/') {
      // Redirect /map or /map/ to /map/index.html
      const mapUrl = MAP_BASE + '/index.html';
      return proxyMapRequest(request, mapUrl);
    }
    if (path.startsWith('/map/')) {
      // 代理 /map/* 到 MAP_BASE + /*
      const subPath = path.substring(5); // 去掉 "/map"
      const mapUrl = MAP_BASE + subPath + url.search;
      return proxyMapRequest(request, mapUrl);
    }

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

/**
 * 代理 Pl3xMap 地图请求
 * 自动重写 HTML/JS/CSS 中的绝对 URL，确保通过 Worker 代理加载所有资源
 */
async function proxyMapRequest(request, mapUrl) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    // 转发请求到地图服务器，保留原始请求头（如 Accept-Encoding）
    // 使用 IP 地址直接访问。为了避免 Cloudflare 对被代理域名的直接访问返回 1003，
    // 我们在 Host 头中使用 MAP_BASE 的 host（通常为 IP:port），而不是 MAP_DOMAIN（可能是被 Cloudflare 代理的域）。
    const originHost = (new URL(MAP_BASE)).host;
    const forwardedHeaders = {
      'User-Agent': 'MC-web-Worker-Map-Proxy/1.0',
      'Accept': request.headers.get('Accept') || '*/*',
      'Accept-Encoding': request.headers.get('Accept-Encoding') || 'gzip, deflate',
      'Accept-Language': request.headers.get('Accept-Language') || 'zh-CN,zh;q=0.9',
      'Referer': MAP_BASE + '/',
      'Host': originHost
    };

    const response = await fetch(mapUrl, {
      method: request.method,
      headers: forwardedHeaders,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // 构建响应，保留内容类型和缓存控制
    const responseHeaders = new Headers({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'X-Content-Type-Options': 'nosniff'
    });

    // 传递重要的响应头
    const passHeaders = ['content-type', 'content-length', 'cache-control', 'last-modified', 'etag'];
    for (const header of passHeaders) {
      const value = response.headers.get(header);
      if (value) {
        responseHeaders.set(header, value);
      }
    }

    // 地图瓦片可以缓存较长时间（如 1 小时），静态资源可以缓存更久
    if (!responseHeaders.has('cache-control')) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('image/') || contentType.includes('tile')) {
        responseHeaders.set('cache-control', 'public, max-age=3600');
      } else if (contentType.includes('javascript') || contentType.includes('css') || contentType.includes('font')) {
        responseHeaders.set('cache-control', 'public, max-age=86400');
      } else {
        responseHeaders.set('cache-control', 'public, max-age=300');
      }
    }

    // 获取响应内容类型
    const contentType = response.headers.get('content-type') || '';

    // If origin responds 403, surface the response headers/body snippet to help debugging
    if (response.status === 403) {
      const snippet = (contentType.includes('text') || contentType.includes('json')) ? (await response.text()).slice(0,2000) : '';
      const hdrs = Array.from(response.headers.entries()).map(([k,v])=>`${k}: ${v}`).join('\n');
      return new Response(`<!doctype html><html><body><h1>Origin returned 403</h1><pre>${escapeHtml(hdrs)}</pre><h2>Body snippet</h2><pre>${escapeHtml(snippet)}</pre></body></html>`, { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // 对于 HTML、JS、CSS 等文本内容，重写绝对 URL 为代理 URL
    if (contentType.includes('text/html') || contentType.includes('text/javascript') || 
        contentType.includes('application/javascript') || contentType.includes('text/css') ||
        contentType.includes('application/json')) {
      
      let text = await response.text();
      
      // 重写 Pl3xMap 中常见的绝对 URL 模式
      // 1. http://firef.cc.cd:22225/... -> /map/...
      text = text.replace(/https?:\/\/firef\.cc\.cd:22225\//g, '/map/');
      text = text.replace(/https?:\/\/firef\.cc\.cd:22225/g, '/map');
      
      // 2. 重写 IP 地址 URL http://13.75.68.60:22225/... -> /map/...
      text = text.replace(/https?:\/\/13\.75\.68\.60:22225\//g, '/map/');
      text = text.replace(/https?:\/\/13\.75\.68\.60:22225/g, '/map');
      
      // 3. 重写协议相对 URL //firef.cc.cd:22225/... -> /map/...
      text = text.replace(/\/\/firef\.cc\.cd:22225\//g, '/map/');
      text = text.replace(/\/\/firef\.cc\.cd:22225/g, '/map');
      
      // 4. 重写协议相对 IP URL //13.75.68.60:22225/... -> /map/...
      text = text.replace(/\/\/13\.75\.68\.60:22225\//g, '/map/');
      text = text.replace(/\/\/13\.75\.68\.60:22225/g, '/map');
      
      // 5. 重写可能存在的绝对路径引用（如 /tiles/... 但需要确保是地图相关路径）
      // 注意：不要重写站点自身的路径
      
      // 6. 如果 HTML 中有 base 标签，确保它指向代理路径
      if (contentType.includes('text/html')) {
        // 在 </head> 前插入 base 标签，确保所有相对 URL 正确解析
        text = text.replace('</head>', '<base href="/map/"></head>');
      }

      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    }

    // 对于二进制内容（图片、字体等），直接转发
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    const errorMessage = error.message || String(error);
    return new Response(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>地图加载失败</title>' +
      '<style>body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;text-align:center}' +
      '.error-box{max-width:500px;padding:40px}' +
      'h1{font-size:24px;color:#f87171;margin-bottom:16px}' +
      'p{color:#94a3b8;font-size:14px;line-height:1.6}' +
      '.detail{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;margin-top:16px;font-family:monospace;font-size:12px;color:#f87171}' +
      '</style></head><body>' +
      '<div class="error-box">' +
      '<h1>🗺️ 地图加载失败</h1>' +
      '<p>无法连接到地图服务器 (firef.cc.cd:22225)</p>' +
      '<div class="detail">' + escapeHtml(errorMessage) + '</div>' +
      '<p style="margin-top:20px;font-size:12px;color:#64748b">请检查地图服务器是否正常运行，或联系管理员</p>' +
      '<p style="margin-top:10px;font-size:12px;color:#64748b">提示：如果地图服务器在本地网络，请确保其可通过公网访问</p>' +
      '</div></body></html>',
      {
        status: 502,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        }
      }
    );
  }
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

function jsonResponse(data, status) {
  if (status === undefined) status = 200;
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
