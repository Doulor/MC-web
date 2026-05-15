Cloudflare Worker: map-proxy

目的
- 通过 Cloudflare Worker 将不安全的 HTTP 地图服务代理为可通过 HTTPS 访问的 URL，并在响应中添加 CORS 头，避免浏览器的混合内容和跨域限制。

文件
- index.js - Worker 脚本。将请求转发到配置的原始地址（默认为 http://13.75.68.60:22225），并在响应中注入 CORS 头。

快速部署（Cloudflare Dashboard）
1. 登录 Cloudflare，进入你的域名（例如 firef.cc.cd）。
2. 在 "Workers & Pages" -> "Workers" 中创建一个新的 Worker。把 `index.js` 的内容粘贴进去。
3. 在脚本顶部修改 ORIGIN 常量为你的地图服务地址（例如 `http://13.75.68.60:22225`）。
4. 保存并在 "Triggers" 中添加一个路由，例如 `map.firef.cc.cd/*`（或你希望的子域名），确保该子域在 DNS 中为灰云（通过 Cloudflare 代理）。

快速部署（Wrangler）
1. 安装 wrangler: `npm install -g wrangler`。
2. 在仓库中创建 `workers` 文件夹（已经包含本脚本），并在项目中运行 `wrangler init --no-delegate` 或手动创建 `wrangler.toml`：

   name = "map-proxy"
   main = "index.js"
   compatibility_date = "2026-05-15"

3. 使用 `wrangler publish` 部署。

DNS / Cloudflare 设置要点
- 为要使用的子域（例如 `map.firef.cc.cd`）在 Cloudflare DNS 中添加 A 记录或 CNAME 指向任意（A 可指向 192.0.2.1）并启用代理（橙云）。路由在 Workers 里绑定到该子域。
- 确保你没有在页面里直接请求 `http://13.75.68.60:22225`，而是请求 `https://map.firef.cc.cd/你的路径`。

前端修改示例
- 如果你现在在前端直接使用绝对 URL 加载图像或 tile，例如：
  img.src = 'http://13.75.68.60:22225/tiles/…'
  请改为：
  img.src = 'https://map.firef.cc.cd/tiles/…'

注意事项与排查
- Cloudflare Worker 不会自动忽略原始主机的防火墙限制。如果你的 origin 仅允许特定来源或 IP，确保 Cloudflare 的出站请求能到达该服务器。
- 如果 origin 只在内网或受限环境可达，Cloudflare 的边缘节点将无法访问。你可以在 origin 上使用反向代理或把服务部署到一个可公网访问的位置。
- 在浏览器开发者工具的 Network 面板查看请求失败的状态码与响应头，帮助定位是 502/524/522 等网络错误还是 403/401 权限问题。

如果需要，我可以：
- 帮你生成一个完整的 `wrangler.toml` 和发布脚本。
- 或者把你的页面（例如 `index.html`）中所有引用 `http://13.75.68.60` 的链接替换为代理域名的引用，并提交一个 PR。
