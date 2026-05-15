/**
 * Cloudflare Pages Worker
 * 
 * 功能：
 * 1. 代理 oPanel API 请求到后端服务器（替代原来的 PHP 代理）
 * 2. 处理联系表单提交，通过 Resend API 发送邮件
 * 3. 诊断工具 - 排查 oPanel API 连接问题
 * 4. 其他请求正常返回静态文件
 */

const OPANEL_BASE = 'http://39.97.183.32:30000';

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

    // Contact form submission
    if (path === '/submit_message.php') {
      return handleContactForm(request, env);
    }

    // Player detail
    if (path === '/player_detail.php') {
      return handlePlayerDetail(request, url);
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
<h3>💡 已确认：oPanel 本身没有 IP 白名单，403 来自阿里云 ECS 上的转发层</h3>
<p style="color:#bfdbfe;font-size:13px;margin-top:8px;line-height:1.6;">
你的架构：家用服务器(oPanel:3000) → 阿里云内网穿透 → ECS(39.97.183.32:30000) → Cloudflare Worker → 用户<br><br>
<strong>已确认：</strong>oPanel 的 open-api 已启用，且<strong>没有配置任何 IP 白名单</strong>。<br>
安全组也开放了 0.0.0.0/0，所以 <strong>问题一定出在 ECS 上做端口转发的软件</strong>（nginx 或 frp）。<br><br>
HTTP 403 意味着 <strong>ECS 上的转发程序收到了请求，但主动拒绝了</strong>。原因通常是：
</p>
<ul>
<li><strong>① nginx 反代配置了 IP 限制（最常见）：</strong>如果你在 ECS 上装了 nginx 来转发请求到家用服务器，nginx 的 <code>allow/deny</code> 指令或 <code>ngx_http_limit_conn_module</code> 可能只允许特定 IP 访问。<br>
<em>解决：</em>登录 ECS，检查 nginx 配置文件（通常在 <code>/etc/nginx/</code>），搜索 <code>allow</code>、<code>deny</code>、<code>satisfy</code> 指令。注释掉 IP 限制或添加 Cloudflare IP 段。</li>
<li><strong>② frp 服务端 (frps) 的 allow_ips 限制：</strong>如果你用 frp 做内网穿透，frps.ini 中的 <code>allow_ips</code> 配置会限制哪些来源 IP 可以连接。<br>
<em>解决：</em>检查 ECS 上 frps.ini 的 <code>allow_ips</code> 配置，注释掉该行或添加 Cloudflare IP 段。</li>
<li><strong>③ Host 头检查：</strong>转发层可能检查了 HTTP <code>Host</code> 头，Worker 发送的 Host 是 IP 地址，不是域名，被拒绝了。<br>
<em>解决：</em>在 Worker 的 fetch 请求中手动设置 <code>Host</code> 头为域名。</li>
</ul>
<p style="color:#fbbf24;font-size:13px;margin-top:8px;">
<strong>💡 最可能的是 nginx 的 allow/deny 规则或 frp 的 allow_ips 配置。</strong> 请登录阿里云 ECS，检查端口转发的配置。
</p>
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
  var btns = document.querySelectorAll('#testButtons .btn');
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
        testDiv.innerHTML += '<br><br><span style="color:#fb923c;">💡 <strong>服务器拒绝了请求</strong>，请参考上方的解决方案。</span>';
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
    conclusion = '<strong>🚫 ECS 上的转发层拒绝访问 (HTTP 403)</strong><br><br>';
    conclusion += '<strong>已排除的原因：</strong><br>';
    conclusion += '✅ oPanel 自身没有 IP 白名单（open-api.json 已确认）<br>';
    conclusion += '✅ 阿里云安全组已开放 0.0.0.0/0<br><br>';
    conclusion += '<strong>问题原因：</strong>ECS (39.97.183.32) 上监听端口 30000 的转发程序（nginx 或 frp）主动拒绝了 Cloudflare Worker 的请求。<br><br>';
    conclusion += '请登录阿里云 ECS，检查以下配置：<br><br>';
    conclusion += '<strong>① 检查 nginx 配置（如果是 nginx 反代）</strong><br>';
    conclusion += '→ 登录 ECS，执行：<code>cat /etc/nginx/nginx.conf</code> 和 <code>cat /etc/nginx/conf.d/*.conf</code><br>';
    conclusion += '→ 搜索 <code>allow</code>、<code>deny</code>、<code>satisfy</code> 指令，注释掉 IP 限制<br><br>';
    conclusion += '<strong>② 检查 frp 配置（如果是 frp）</strong><br>';
    conclusion += '→ 登录 ECS，执行：<code>cat /etc/frp/frps.ini</code> 或 <code>cat frps.ini</code><br>';
    conclusion += '→ 搜索 <code>allow_ips</code> 配置，注释掉或添加 Cloudflare IP 段<br><br>';
    conclusion += '<strong>③ 尝试直接访问家用服务器 oPanel 的 Web 端口 3000</strong><br>';
    conclusion += '如果你能直接访问家用服务器的 3000 端口，说明 oPanel 完全正常，问题 100% 在 ECS 转发层';
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