/**
 * Cloudflare Pages Worker
 * 
 * 功能：
 * 1. 代理 oPanel API 请求到后端服务器（替代原来的 PHP 代理）
 * 2. 其他请求正常返回静态文件
 * 
 * 支持的 API 路由：
 * - /players.php         → http://39.97.183.32:30000/open-api/players
 * - /plugins.php         → http://39.97.183.32:30000/open-api/plugins
 * - /monitor.php         → http://39.97.183.32:30000/open-api/monitor
 * - /player_detail.php   → http://39.97.183.32:30000/open-api/players/{uuid}
 * - /server_status.php   → http://39.97.183.32:30000/open-api/info
 */

const OPANEL_BASE = 'http://39.97.183.32:30000';

// 路由配置：路径 → oPanel API 路径 + 响应包装函数
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

    // ========== CORS 预检请求 ==========
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

    // ========== 玩家详情路由（需要提取 uuid 参数） ==========
    if (path === '/player_detail.php') {
      return handlePlayerDetail(request, url);
    }

    // ========== 其他 API 路由 ==========
    const route = ROUTES[path];
    if (route) {
      return handleApiProxy(request, route);
    }

    // ========== 静态文件（由 Cloudflare Pages 处理） ==========
    try {
      return await env.ASSETS.fetch(request);
    } catch (e) {
      return new Response('Not Found', { status: 404 });
    }
  }
};

/**
 * 处理玩家详情 API 请求
 */
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
      headers: {
        'User-Agent': 'MC-web-Worker/1.0'
      }
    });

    if (!response.ok) {
      return jsonResponse({
        success: false,
        message: '查询失败: HTTP ' + response.status
      });
    }

    const data = await response.json();
    return jsonResponse({
      success: true,
      data: data
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      message: '查询失败: ' + error.message
    });
  }
}

/**
 * 处理通用 API 代理请求
 */
async function handleApiProxy(request, route) {
  const apiUrl = OPANEL_BASE + route.apiPath;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'MC-web-Worker/1.0'
      }
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

/**
 * 返回 JSON 格式的 Response
 */
function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}