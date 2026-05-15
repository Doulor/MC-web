/**
 * Cloudflare Pages Worker
 * 
 * 功能：
 * 1. 代理 oPanel API 请求到后端服务器（替代原来的 PHP 代理）
 * 2. 处理联系表单提交，通过 Resend API 发送邮件
 * 3. 其他请求正常返回静态文件
 */

const OPANEL_BASE = 'http://39.97.183.32:30000';

const ROUTES = {
  '/players.php': {
    apiPath: '/open-api/players',
    wrapResponse: (data) => ({
      success: true,
      players: (data && data.players) || []
    })
  },
  '/plugins.php': {
    apiPath: '/open-api/plugins',
    wrapResponse: (data) => ({
      success: true,
      plugins: (data && data.plugins) || []
    })
  },
  '/monitor.php': {
    apiPath: '/open-api/monitor',
    wrapResponse: (data) => ({
      success: true,
      data: data || {}
    })
  },
  '/server_status.php': {
    apiPath: '/open-api/info',
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

    // Collect uploaded images
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

    // Build email HTML - use string concatenation to avoid entity encoding issues
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

    // Send via Resend API
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

/**
 * HTML escape function using Unicode escapes to prevent auto-formatter corruption
 */
function escapeHtml(str) {
  return String(str)
    .replace(/\x26/g, '\x26\x61\x6d\x70\x3b')   // & -> &
    .replace(/\x3c/g, '\x26\x6c\x74\x3b')        // < -> <
    .replace(/\x3e/g, '\x26\x67\x74\x3b')        // > -> >
    .replace(/\x22/g, '\x26\x71\x75\x6f\x74\x3b') // " -> "
    .replace(/\x27/g, '\x26\x23\x30\x33\x39\x3b'); // ' -> &#039;
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
    const wrapped = route.wrapResponse(data);
    return jsonResponse(wrapped);
  } catch (error) {
    return jsonResponse({
      success: false,
      message: '查询失败: ' + error.message
    });
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}