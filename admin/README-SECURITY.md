# 后台（/admin）安全加固说明 —— 对应渗透报告 #40

> 本文件本身也在被 `_worker.js` 门禁覆盖的 `/admin` 目录下，线上访问会得到 404。
> 它只是给站长看的备忘。

## 1. 部署方式判断（这个结论决定了修法）

**结论：`mc.doulor.cn` 是 Cloudflare Pages，PHP 在这里根本不会执行。**

证据（都是可从仓库里直接看到的事实，不是猜测）：

1. 仓库根目录有 `_headers` + `_worker.js`，且 `_worker.js` 用
   `export default { async fetch(request, env) { ... env.ASSETS.fetch(request) } }`
   —— 这是 Cloudflare Pages 的高级模式（Worker 接管全部请求），Pages 不会执行 PHP。
2. `_worker.js` 顶部注释写着"代理 oPanel API 请求到后端服务器（**替代原来的 PHP 代理**）"，
   并且把 `/players.php`、`/plugins.php`、`/monitor.php`、`/server_status.php`、
   `/submit_message.php`、`/player_detail.php` 这些 **URL** 直接映射到 oPanel API。
   也就是说根目录那 6 个 `.php` 是历史遗留源码，线上请求被 Worker 截走，PHP 从未被执行。
3. `admin/*.php` 里用的是 `session_start()`、`password_verify()`、
   `header('Location: panel.php')`、`$_SESSION`、`file_put_contents(__DIR__.'/data/...')`
   —— 这些**必须**有 PHP 运行时才有意义，`admin/index.php` 的登录校验
   （`password_verify($password, getAdminPassHash())` + 登录失败次数限制）客观上只能在
   PHP 主机上跑。
4. 线上实测（2026-10，只做了只读 HEAD/GET）：

   | 请求 | 实际响应 | 说明 |
   | --- | --- | --- |
   | `HEAD /admin/index.php` | `200` + `Content-Type: application/x-httpd-php` | PHP **源码**被当静态文件返回（浏览器直接下载） |
   | `HEAD /admin/data/settings.json` | `200` + `application/json` | 含 `admin_pass_hash`（bcrypt）、`smtp_*` |
   | `GET /admin/` | `200` + 首页 HTML | 目录无 index.html，Pages 回落到站点首页 |

所以：
- **Pages 侧**：`/admin/*.php` 与 `/admin/data/*.json` 是"静态资源泄露"，跟后台有没有登录框无关
  （登录框只保护 `panel.php`，不保护源码本身）。修法是 `_worker.js` 默认拒绝。
- **PHP 主机侧**（真正能跑后台的那台）：需要 `.htaccess` / nginx 把 `data/` 挡掉，
  并且给它套一层边缘认证（Cloudflare Access / Basic Auth）。

## 2. `admin/` 里的文件分类

| 分类 | 文件 | 说明 |
| --- | --- | --- |
| 入口页（会被浏览器打开） | `index.php`、`panel.php`、`forgot_password.php` | 登录页 / 面板 / 找回口令；含 `password_verify`、CSRF、`session_regenerate_id` |
| 只应被 `require_once` 的实现 | `config.php`、`handlers.php`、`save.php`、`smtp.php`、`api.php` | 会话、CSRF、口令哈希、SMTP、保存逻辑；被直接访问毫无必要 |
| 前端静态资源 | `panel-init.js`、`script.js`、`style.css` | 面板用 JS/CSS |
| **运行时数据（最敏感）** | `data/settings.json` | `admin_pass_hash`（bcrypt `$2y$10$…`）+ `smtp_host/user/pass` + `module_visibility` |
| | `data/messages.json` | 访客姓名 / 邮箱 / 留言正文 / 截图列表 → **PII** |
| | `data/login_attempts.json`、`data/rate_limit.json` | 登录风控状态（IP + 时间戳） |
| | `data/.ad_lock`、`data/.ad_integrity_cache` | 锁文件 / 缓存（点文件） |
| | `data/content.json` | CMS 内容；**本来就公开**（首页渲染用），不含机密 |
| 用户上传 | `uploads/msg_images/` | 访客提交的截图 → 也是 PII |

`data/*.json` **是运行时数据**（不是构建产物）：`config.php` 用
`file_put_contents()` 写它们，`$_SERVER['REMOTE_ADDR']` 的登录次数也写在里面。
但它们同时被提交进了这个仓库，而仓库是**公开的**（`github.com/Doulor/MC-web`，public）。

## 3. 这次改了什么

| 文件 | 改动 |
| --- | --- |
| `_worker.js` | 新增 `handleAdminGate()`：`/admin` 下**默认拒绝**，除两个白名单外一律 404（不是 403） |
| `_headers` | 重写为合法的 Pages 语法；给 `/admin/*` 加 `no-store` + `noindex`（第二道防线） |
| `admin/.htaccess` | Apache：`data/` 与实现文件 `R=404`，关目录列表 |
| `admin/nginx-admin-protection.conf` | nginx 参考片段（不会自动加载，需要手动贴） |
| `.gitignore` | 新增：运行时/含 PII 的数据文件不再进仓库 |
| `admin/README-SECURITY.md` | 本文件 |

### `_worker.js` 的门禁规则

| 路径 | 结果 |
| --- | --- |
| `/admin/data/content.json` | 200，公开（首页 CMS 需要），`max-age=60` |
| `/admin/data/settings.json` | 200，但**脱敏**：去掉 `admin_pass_hash`、`smtp_*`（`smtp_from_name` 除外）、任何含 pass/secret/token/hash 的键 |
| `/admin/data/messages.json` 等其余 `data/*` | **404** |
| `/admin/*.php` | **404** |
| `/admin/`、`/admin`、`/admin/uploads/...` | **404** |
| `/ADMIN/…`、`/admin//…`、`/%61dmin/…`、`/admin/../admin/…` | **404**（路径先反复解码 → 折叠 `..` → 转小写再判定） |

404 的响应体就是 `Not Found`（`text/plain`，`Cache-Control: no-store`），与 Worker 自己的
兜底 404 完全一致；**故意不用 403**，因为 403 等于告诉扫描器"这里确实存在"。

## 4. 站长必须手动做的事

### 4.1 轮换（必做，因为泄露面不只是网站）

1. **后台登录口令**：`admin_pass_hash` 是 bcrypt(`$2y$10$`) 且已经出现在
   ①线上 `/admin/data/settings.json`、②**公开的 GitHub 仓库**里。
   立刻改口令（面板里改 / 或换掉哈希）。新口令**不要和旧口令有任何相似**，
   旧口令视为永久泄露（Git 历史里还在，即使强制推送也可能已被 fork / 抓取）。
2. **SMTP 凭据**：`settings.json` 里的 `smtp_host / smtp_user / smtp_pass` 字段结构已暴露。
   当前仓库副本里这些值是空的，但线上部署的副本可能不是 ——
   直接去邮箱服务商**重置 SMTP 授权码/密码**，并检查发信记录有无异常。
   > 顺带：`submit_message.php` 里还有一套旧 SMTP 发信逻辑，如果那套凭据曾经被提交过，
   > 一并轮换。
3. **Resend / Cloudflare 相关密钥**：`_worker.js` 用的是 Pages 环境变量
   `RESEND_API_KEY`（没进仓库，✅），但请确认没有在别处（`start_server.bat`、截图、工单）泄露。
4. **访客 PII 影响评估**：`messages.json` 里有姓名、邮箱、留言正文和截图文件名，
   已经公开可见（网页 + 公开仓库）。按《个人信息保护法》属于泄露事件：
   评估数量级（本仓库里是 1 条：`adoulor@outlook.com`），如涉及真实用户需通知；
   清理 `uploads/msg_images/` 的历史提交。
5. **公开仓库历史**：`Doulor/MC-web` 是 public。历史里含哈希与 PII。
   要么把仓库改私有，要么用 `git filter-repo` 清理历史后强推（强推前先拿备份）。
   > 本仓库我没做任何提交，清理历史请你自行决定。

### 4.2 部署侧

1. 把本仓库重新部署到 Cloudflare Pages（`_worker.js` 才会生效）。
2. **另外把 `<项目>.pages.dev` 也管起来**：Pages 的 `*.pages.dev` 域名同样跑这份
   `_worker.js`，所以门禁一起生效；但如果项目里还挂过别的自定义域，也要确认。
3. **验证一次**（应全部 `404`）：
   ```bash
   curl -s -o /dev/null -w '%{http_code} /admin/index.php\n'    https://mc.doulor.cn/admin/index.php
   curl -s -o /dev/null -w '%{http_code} /admin/panel.php\n'    https://mc.doulor.cn/admin/panel.php
   curl -s -o /dev/null -w '%{http_code} /admin/\n'             https://mc.doulor.cn/admin/
   curl -s -o /dev/null -w '%{http_code} /admin/data/messages.json\n' https://mc.doulor.cn/admin/data/messages.json
   # 这两个应当 200，且 settings 里不能再有 admin_pass_hash / smtp_pass
   curl -s https://mc.doulor.cn/admin/data/settings.json
   curl -s -o /dev/null -w '%{http_code} /admin/data/content.json\n' https://mc.doulor.cn/admin/data/content.json
   ```

### 4.3 如果后台真的要在 PHP 主机上跑（推荐这么放）

后台**不要**和公开站点放在同一个域名/目录下：

1. 把 `admin/` 挂到一个独立子域，例如 `admin.doulor.cn`；
2. 在 **Cloudflare Zero Trust → Access → Applications** 里给这个子域加一个
   Self-hosted 应用 + 只允许你自己的邮箱（`Allow / Include / Emails`）；
   这样未登录用户在边缘就被拦住，源站连一个字节都收不到，也不用改 PHP。
3. 没有 Zero Trust 就用 Basic Auth：
   - nginx：把 `admin/nginx-admin-protection.conf` 里第 4 段贴进 server 块，
     `sudo htpasswd -c /etc/nginx/.htpasswd admin`，然后 `nginx -t && nginx -s reload`；
   - Apache：把 `admin/.htaccess` 放到 `admin/` 下（本仓库已放好），
     额外在 `<Directory>` 里加 `AuthType Basic` 三件套。
4. 如果暂时做不到独立子域，**至少**要：
   - 让 `admin/` 只允许你家里的 IP（防火墙 / Cloudflare WAF 自定义规则）；
   - 确认 `admin/data/` 不能被 HTTP 读到（`.htaccess` / nginx 已给）。
5. 想在 Pages 侧临时打开后台文件（**不推荐**，因为 Pages 不执行 PHP，看到的还是源码）：
   在 Pages 项目里加环境变量 `ADMIN_TOKEN=<一长串随机串>`，
   然后 `https://mc.doulor.cn/admin/panel.php?admin_token=<同一串>` 才会返回文件。
   **不配置就等于永久 404**（这是默认状态）。

### 4.4 建议的后续（根治）

- 把 `admin_pass_hash` 与 SMTP 凭据从 `settings.json` 拆到 web root **之外**
  （例如 `/var/www/secrets/settings.secrets.php`），`data/settings.json` 只留
  `module_visibility` 这类公开字段。这样即使有一天 Worker 失效、或部署方式变了，
  也不会再泄露哈希与口令。
- `admin/data/` 与 `admin/uploads/` 加进 `.gitignore` 并 `git rm --cached`
  （`.gitignore` 已加，`git rm --cached` 需要你自己执行，我没有动 git 索引）。
- 给整个站点加一个最小的 `404.html`，让"被门禁拦掉的路径"和"不存在的路径"
  返回一样的东西（现在首页会把未知路径回落成 200 首页，这一点本身也值得修）。

## 5. 残留风险（这次没改）

- 根目录的 `players.php` / `plugins.php` / `monitor.php` / `server_status.php` /
  `submit_message.php` / `player_detail.php`：**不**会泄露源码（被 Worker 路由截走），
  但它们是历史遗留，建议删掉或移到 `legacy/`。
- `map-test.html` 是调试页，仍公开。
- 后台 `panel.php` 自身的安全（CSRF、会话固定、越权）本次未审计 ——
  门禁只解决"未授权访问静态文件"。
