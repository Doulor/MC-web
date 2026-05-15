<?php
require_once __DIR__ . '/config.php';
requireLogin();
requireAdIntegrity();

// 启用输出缓冲，页面末尾做广告输出校验（防注释包裹 / 内联隐藏 / 节点被抽走）
ob_start();

$content = loadContent();
$messages = loadMessages();
$settings = loadSettings();
$csrf = generateCsrf();
$currentTab = $_GET['tab'] ?? 'site';
$tabs = [
    'site'       => ['label' => '网站设置',   'icon' => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'],
    'hero'       => ['label' => '首页横幅',   'icon' => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'],
    'specs'      => ['label' => '服务器配置', 'icon' => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>'],
    'help'       => ['label' => '加入指南',   'icon' => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'],
    'features'   => ['label' => '游戏特色',   'icon' => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'],
    'gallery'    => ['label' => '游戏截图',   'icon' => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'],
    'team'       => ['label' => '管理团队',   'icon' => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'],
    'monitor'    => ['label' => '实时监控', 'icon' => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'],
    'messages'   => ['label' => '消息通知',   'icon' => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>'],
    'users'      => ['label' => '用户管理',   'icon' => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>'],
    'community'  => ['label' => '社区链接',   'icon' => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'],
    'footer'     => ['label' => '页脚设置',   'icon' => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="15" x2="21" y2="15"/></svg>'],
];

$msg = $_GET['msg'] ?? '';

$imgAttr = function($url, $tab) use ($currentTab) {
    if (empty($url)) return '';
    $fullUrl = "../" . e($url);
    if ($tab === $currentTab) {
        return 'src="' . $fullUrl . '"';
    }
    return 'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-src="' . $fullUrl . '"';
};

// Calculate unread messages
$unreadCount = 0;
foreach ($messages as $m) {
    if (empty($m['read'])) {
        $unreadCount++;
    }
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>网站管理后台</title>
    <meta name="robots" content="noindex, nofollow">
    <link rel="stylesheet" href="style.css?v=<?= filemtime(__DIR__.'/style.css') ?>">
</head>
<body>
    <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
            <div class="sidebar-logo">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4H20V20H4V4Z"/><path d="M4 12H20"/><path d="M12 4V20"/></svg>
                <span class="sidebar-title">Firefly荧烛 后台</span>
            </div>
        </div>
        <nav class="sidebar-nav">
            <?php foreach ($tabs as $key => $t): ?>
            <a href="#tab-<?= $key ?>" onclick="switchTab('<?= $key ?>'); return false;" class="nav-item <?= $currentTab === $key ? 'active' : '' ?>" id="nav-<?= $key ?>">
                <?= $t['icon'] ?>
                <span><?= $t['label'] ?></span>
                <?php if ($key === 'messages' && $unreadCount > 0): ?>
                    <span class="badge"><?= $unreadCount > 99 ? '99+' : $unreadCount ?></span>
                <?php endif; ?>
            </a>
            <?php endforeach; ?>
            <div class="nav-divider"></div>
            <a href="../index.html" class="nav-item" target="_blank">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                <span>前往前台</span>
            </a>
            <a href="index.php?action=logout" class="nav-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                <span>退出登录</span>
            </a>
        </nav>
    </aside>

    <main class="main-content">
        <header class="topbar">
            <button class="mobile-menu-btn" id="mobileMenuBtn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <h2 class="topbar-title" id="page-title"><?= e($tabs[$currentTab]['label'] ?? '管理后台') ?></h2>
            <div class="topbar-actions">
                <div class="topbar-profile" onclick="openProfileModal()">
                    <img src="<?= !empty($settings['admin_avatar']) ? e($settings['admin_avatar']) : '../assets/images/cat.jpg' ?>" alt="Avatar" id="topbarAvatar">
                    <span class="topbar-user">管理员</span>
                </div>
            </div>
        </header>

        <!-- Profile Modal -->
        <div id="profileModal" class="modal-overlay" style="display: none;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>管理员账号设置</h3>
                    <button type="button" class="close-modal" onclick="closeProfileModal()">×</button>
                </div>
                <form id="profileForm" method="POST" action="save.php" enctype="multipart/form-data" data-ajax="true">
                    <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
                    <input type="hidden" name="tab" value="profile">
                    
                    <div class="form-group" style="text-align: center;">
                        <div class="avatar-upload-preview">
                            <img src="<?= !empty($settings['admin_avatar']) ? e($settings['admin_avatar']) : '../assets/images/cat.jpg' ?>" id="avatarPreview">
                            <label for="avatarInput" class="avatar-edit-btn">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            </label>
                            <input type="file" id="avatarInput" name="avatar" accept="image/*" style="display: none;" onchange="previewAvatar(this)">
                        </div>
                        <p class="file-hint">点击图标修改头像</p>
                    </div>

                    <div class="form-group">
                        <label>新密码 (留空则不修改)</label>
                        <input type="password" name="new_password" class="form-input" placeholder="输入新密码">
                    </div>
                    
                    <div class="form-group">
                        <label>确认新密码</label>
                        <input type="password" name="confirm_password" class="form-input" placeholder="再次输入新密码">
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn-secondary" onclick="closeProfileModal()">取消</button>
                        <button type="submit" class="btn-save">保存设置</button>
                    </div>
                </form>
            </div>
        </div>

<?= renderAdBanner($settings) ?>

        <?php if ($msg === 'ok'): ?>
        <div class="alert success">保存成功！内容已更新。</div>
        <?php elseif ($msg === 'err'): ?>
        <div class="alert error">保存失败，请检查文件权限。</div>
        <?php elseif ($msg === 'csrf'): ?>
        <div class="alert error">安全验证失败，请重新提交。</div>
        <?php endif; ?>

        <div class="page-content">
            
            <!-- Site Tab -->
            <div id="tab-site" class="tab-pane" style="display: <?= $currentTab === 'site' ? 'block' : 'none' ?>">
                <form method="POST" action="save.php" enctype="multipart/form-data" data-ajax="true">
                    <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
                    <input type="hidden" name="tab" value="site">
                    <div class="form-section">
                        <h3 class="section-title">服务器类型</h3>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px;">选择您服务器所属的平台类型。</p>
                        <div class="server-mode-selector">
                            <?php
                            $currentMode = $content['site']['server_mode'] ?? 'international';
                            $serverModes = [
                                'international' => ['label' => '官方国际服', 'icon' => '../egg/mc.webp'],
                                'netease'       => ['label' => '网易山头服', 'icon' => '../egg/sbwangyi.webp'],
                            ];
                            foreach ($serverModes as $modeVal => $modeInfo):
                            ?>
                            <label class="server-mode-card server-mode-card--<?= $modeVal ?> <?= $currentMode === $modeVal ? 'is-active' : '' ?>">
                                <input type="radio" name="site[server_mode]" value="<?= $modeVal ?>" <?= $currentMode === $modeVal ? 'checked' : '' ?> onchange="updateModeCards()">
                                <img src="<?= $modeInfo['icon'] ?>" alt="<?= $modeInfo['label'] ?>">
                                <span><?= $modeInfo['label'] ?></span>
                            </label>
                            <?php endforeach; ?>
                        </div>

                        <?php
                        $currentTier = $content['site']['netease_tier'] ?? 'shangyao';
                        $tiers = [
                            'shangyao' => ['name' => '山腰', 'players' => 4,  'saves' => 1],
                            'shanfeng' => ['name' => '山峰', 'players' => 12, 'saves' => 3],
                            'yunding'  => ['name' => '云顶', 'players' => 40, 'saves' => 3],
                        ];
                        ?>
                        <div class="netease-tier-section" id="neteaseTierSection" style="display: <?= $currentMode === 'netease' ? 'block' : 'none' ?>">
                            <p class="netease-tier-title">选择套餐规格</p>
                            <div class="tier-selector">
                                <?php foreach ($tiers as $tierVal => $tierInfo): ?>
                                <label class="tier-card <?= $currentTier === $tierVal ? 'is-active' : '' ?>">
                                    <input type="radio" name="site[netease_tier]" value="<?= $tierVal ?>" <?= $currentTier === $tierVal ? 'checked' : '' ?> onchange="updateTierCards()">
                                    <span class="tier-name"><?= $tierInfo['name'] ?></span>
                                    <span class="tier-spec">至多 <?= $tierInfo['players'] ?> 名玩家</span>
                                    <span class="tier-spec"><?= $tierInfo['saves'] ?> 个存档位置</span>
                                </label>
                                <?php endforeach; ?>
                            </div>
                            <p class="tier-common-note">全部套餐均包含：全天候畅玩 &middot; 成员免费游玩 &middot; 存档自动备份</p>
                        </div>
                    </div>
                    <div class="form-section">
                        <h3 class="section-title">网站基本信息</h3>
                        <div class="form-group">
                            <label>网站标题</label>
                            <input type="text" name="site[title]" value="<?= e($content['site']['title'] ?? '') ?>" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>网站描述 (SEO)</label>
                            <textarea name="site[description]" class="form-input" rows="3"><?= e($content['site']['description'] ?? '') ?></textarea>
                        </div>
                        <div class="form-group">
                            <label>服务器 IP 地址</label>
                            <input type="text" name="site[server_ip]" value="<?= e($content['site']['server_ip'] ?? '') ?>" class="form-input" placeholder="Play.Doulor.cn">
                        </div>
                    </div>
                    <div class="form-section">
                        <h3 class="section-title">导航栏 LOGO 设置</h3>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">上传图片后将替换默认文字 LOGO；清空图片则恢复为文字显示。</p>
                        <div class="form-group">
                            <label>LOGO 文字（默认显示）</label>
                            <input type="text" name="site[logo_text]" value="<?= e($content['site']['logo_text'] ?? 'Firefly荧烛服务器') ?>" class="form-input" placeholder="Firefly荧烛服务器">
                        </div>
                        <div class="form-group">
                            <label>LOGO 图片（可选，优先于文字）</label>
                            <div class="image-upload-group">
                                <?php if (!empty($content['site']['logo_image'])): ?>
                                <img src="../<?= e($content['site']['logo_image']) ?>" class="preview-img small" alt="当前LOGO">
                                <?php endif; ?>
                                <input type="file" name="site_logo_image" accept="image/*" class="form-file">
                                <input type="hidden" name="site[logo_image]" value="<?= e($content['site']['logo_image'] ?? '') ?>">
                                <span class="file-hint">建议高度 40px，PNG 透明背景效果最佳。留空则使用文字 LOGO。</span>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="switch" style="margin-top: 8px;">
                                <input class="toggle" type="checkbox" name="site[clear_logo]" value="1">
                                <span class="slider"></span>
                            </label>
                            <span style="margin-top: 8px; font-size: 0.85rem; color: var(--text-muted);">勾选后保存将清除图片 LOGO，恢复为文字显示</span>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-save">保存更改</button>
                    </div>
                </form>
                
                <div class="form-section" style="margin-top: 32px;">
                    <h3 class="section-title">后台管理设置</h3>
                    <form method="POST" action="save.php" data-ajax="true">
                        <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
                        <input type="hidden" name="tab" value="general_settings">
                        
                        <div class="form-group" style="display: flex; flex-direction: column; align-items: center;">
                            <label class="switch">
                                <input class="toggle" type="checkbox" name="hide_ad_banner" value="1" <?= !empty($settings['hide_ad_banner']) ? 'checked' : '' ?>>
                                <span class="slider"></span>
                            </label>
                            <span style="margin-top: 12px; font-weight: 500; color: var(--text-primary);">永久关闭全局广告横幅</span>
                            <p style="margin-top: 8px; font-size: 0.85rem; color: var(--text-muted); text-align: center;">开启此选项后，后台顶部的雨云IDC广告将不再显示。</p>
                        </div>
                        
                        <div class="form-actions">
                            <button type="submit" class="btn-save">保存设置</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Hero Tab -->
            <div id="tab-hero" class="tab-pane" style="display: <?= $currentTab === 'hero' ? 'block' : 'none' ?>">
                <form method="POST" action="save.php" enctype="multipart/form-data" data-ajax="true">
                    <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
                    <input type="hidden" name="tab" value="hero">
                    <div class="form-section">
                        <h3 class="section-title">首页横幅内容</h3>
                        <div class="form-group">
                            <label>顶部标签文字</label>
                            <input type="text" name="hero[badge]" value="<?= e($content['hero']['badge'] ?? '') ?>" class="form-input">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>标题第一行</label>
                                <input type="text" name="hero[title_line1]" value="<?= e($content['hero']['title_line1'] ?? '') ?>" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>标题高亮部分</label>
                                <input type="text" name="hero[title_highlight]" value="<?= e($content['hero']['title_highlight'] ?? '') ?>" class="form-input">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>副标题</label>
                            <textarea name="hero[subtitle]" class="form-input" rows="2"><?= e($content['hero']['subtitle'] ?? '') ?></textarea>
                        </div>
                        <div class="form-group">
                            <label>特性标签 (每行一个)</label>
                            <textarea name="hero[features_text]" class="form-input" rows="3"><?= e(implode("\n", $content['hero']['features'] ?? [])) ?></textarea>
                        </div>
                        <div class="form-group">
                            <label>背景图片</label>
                            <div class="image-upload-group">
                                <?php if (!empty($content['hero']['bg_image'])): ?>
                                <img <?= $imgAttr($content['hero']['bg_image'], 'hero') ?> class="preview-img" alt="">
                                <?php endif; ?>
                                <input type="file" name="hero_bg_image" accept="image/*" class="form-file">
                                <input type="hidden" name="hero[bg_image]" value="<?= e($content['hero']['bg_image'] ?? '') ?>">
                                <span class="file-hint">留空则保持当前图片不变</span>
                            </div>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-save">保存更改</button>
                    </div>
                </form>
            </div>

            <!-- Specs Tab -->
            <div id="tab-specs" class="tab-pane" style="display: <?= $currentTab === 'specs' ? 'block' : 'none' ?>">
                <form method="POST" action="save.php" enctype="multipart/form-data" data-ajax="true">
                    <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
                    <input type="hidden" name="tab" value="specs">
                    <div class="form-section">
                        <h3 class="section-title">服务器配置板块</h3>
                        <div class="form-row">
                            <div class="form-group"><label>板块标题</label><input type="text" name="specs[title]" value="<?= e($content['specs']['title'] ?? '') ?>" class="form-input"></div>
                            <div class="form-group"><label>板块副标题</label><input type="text" name="specs[subtitle]" value="<?= e($content['specs']['subtitle'] ?? '') ?>" class="form-input"></div>
                        </div>
                    </div>
                    <?php foreach (($content['specs']['items'] ?? []) as $i => $item): ?>
                    <div class="form-section">
                        <h3 class="section-title">配置项 <?= $i + 1 ?></h3>
                        <div class="form-row">
                            <div class="form-group"><label>标题</label><input type="text" name="specs[items][<?= $i ?>][title]" value="<?= e($item['title'] ?? '') ?>" class="form-input"></div>
                            <div class="form-group"><label>参数值</label><input type="text" name="specs[items][<?= $i ?>][value]" value="<?= e($item['value'] ?? '') ?>" class="form-input"></div>
                        </div>
                        <div class="form-group"><label>描述</label><textarea name="specs[items][<?= $i ?>][desc]" class="form-input" rows="2"><?= e($item['desc'] ?? '') ?></textarea></div>
                        <div class="form-group">
                            <label>图标</label>
                            <div class="image-upload-group">
                                <?php if (!empty($item['icon'])): ?><img <?= $imgAttr($item['icon'], 'specs') ?> class="preview-img small" alt=""><?php endif; ?>
                                <input type="file" name="specs_icon_<?= $i ?>" accept="image/*" class="form-file">
                                <input type="hidden" name="specs[items][<?= $i ?>][icon]" value="<?= e($item['icon'] ?? '') ?>">
                            </div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                    <div class="form-actions">
                        <button type="submit" class="btn-save">保存更改</button>
                    </div>
                </form>
            </div>

            <!-- Help Tab -->
            <div id="tab-help" class="tab-pane" style="display: <?= $currentTab === 'help' ? 'block' : 'none' ?>">
                <form method="POST" action="save.php" enctype="multipart/form-data" data-ajax="true">
                    <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
                    <input type="hidden" name="tab" value="help">
                    <div class="form-section">
                        <h3 class="section-title">加入指南板块</h3>
                        <div class="form-row">
                            <div class="form-group"><label>板块标题</label><input type="text" name="help[title]" value="<?= e($content['help']['title'] ?? '') ?>" class="form-input"></div>
                            <div class="form-group"><label>板块副标题</label><input type="text" name="help[subtitle]" value="<?= e($content['help']['subtitle'] ?? '') ?>" class="form-input"></div>
                        </div>
                    </div>
                    <?php foreach (($content['help']['steps'] ?? []) as $i => $step): ?>
                    <div class="form-section">
                        <h3 class="section-title">步骤 <?= $i + 1 ?></h3>
                        <div class="form-group"><label>标题</label><input type="text" name="help[steps][<?= $i ?>][title]" value="<?= e($step['title'] ?? '') ?>" class="form-input"></div>
                        <div class="form-group"><label>描述</label><textarea name="help[steps][<?= $i ?>][desc]" class="form-input" rows="2"><?= e($step['desc'] ?? '') ?></textarea></div>
                        <?php if (isset($step['link_text'])): ?>
                        <div class="form-row">
                            <div class="form-group"><label>按钮文字</label><input type="text" name="help[steps][<?= $i ?>][link_text]" value="<?= e($step['link_text'] ?? '') ?>" class="form-input"></div>
                            <div class="form-group"><label>按钮链接</label><input type="text" name="help[steps][<?= $i ?>][link_url]" value="<?= e($step['link_url'] ?? '') ?>" class="form-input"></div>
                        </div>
                        <?php endif; ?>
                        <?php if (isset($step['highlight'])): ?>
                        <div class="form-group"><label>高亮文字</label><input type="text" name="help[steps][<?= $i ?>][highlight]" value="<?= e($step['highlight'] ?? '') ?>" class="form-input"></div>
                        <?php endif; ?>
                    </div>
                    <?php endforeach; ?>
                    <div class="form-actions">
                        <button type="submit" class="btn-save">保存更改</button>
                    </div>
                </form>
            </div>

            <!-- Features Tab -->
            <div id="tab-features" class="tab-pane" style="display: <?= $currentTab === 'features' ? 'block' : 'none' ?>">
                <form method="POST" action="save.php" enctype="multipart/form-data" data-ajax="true">
                    <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
                    <input type="hidden" name="tab" value="features">
                    <div class="form-section">
                        <h3 class="section-title">游戏特色板块</h3>
                        <div class="form-row">
                            <div class="form-group"><label>板块标题</label><input type="text" name="features[title]" value="<?= e($content['features']['title'] ?? '') ?>" class="form-input"></div>
                            <div class="form-group"><label>板块副标题</label><input type="text" name="features[subtitle]" value="<?= e($content['features']['subtitle'] ?? '') ?>" class="form-input"></div>
                        </div>
                    </div>
                    <?php foreach (($content['features']['items'] ?? []) as $i => $item): ?>
                    <div class="form-section">
                        <h3 class="section-title">特色 <?= $i + 1 ?></h3>
                        <div class="form-group"><label>标题</label><input type="text" name="features[items][<?= $i ?>][title]" value="<?= e($item['title'] ?? '') ?>" class="form-input"></div>
                        <div class="form-group"><label>描述</label><textarea name="features[items][<?= $i ?>][desc]" class="form-input" rows="2"><?= e($item['desc'] ?? '') ?></textarea></div>
                        <div class="form-group">
                            <label>图标</label>
                            <div class="image-upload-group">
                                <?php if (!empty($item['icon'])): ?><img <?= $imgAttr($item['icon'], 'features') ?> class="preview-img small" alt=""><?php endif; ?>
                                <input type="file" name="features_icon_<?= $i ?>" accept="image/*" class="form-file">
                                <input type="hidden" name="features[items][<?= $i ?>][icon]" value="<?= e($item['icon'] ?? '') ?>">
                            </div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                    <div class="form-actions">
                        <button type="submit" class="btn-save">保存更改</button>
                    </div>
                </form>
            </div>

            <!-- Gallery Tab -->
            <div id="tab-gallery" class="tab-pane" style="display: <?= $currentTab === 'gallery' ? 'block' : 'none' ?>">
                <form method="POST" action="save.php" enctype="multipart/form-data" data-ajax="true">
                    <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
                    <input type="hidden" name="tab" value="gallery">
                    <div class="form-section">
                        <h3 class="section-title">游戏截图板块</h3>
                        <div class="form-row">
                            <div class="form-group"><label>板块标题</label><input type="text" name="gallery[title]" value="<?= e($content['gallery']['title'] ?? '') ?>" class="form-input"></div>
                            <div class="form-group"><label>板块副标题</label><input type="text" name="gallery[subtitle]" value="<?= e($content['gallery']['subtitle'] ?? '') ?>" class="form-input"></div>
                        </div>
                    </div>
                    <?php foreach (($content['gallery']['items'] ?? []) as $i => $item): ?>
                    <div class="form-section">
                        <h3 class="section-title">截图 <?= $i + 1 ?></h3>
                        <div class="form-group"><label>图片说明</label><input type="text" name="gallery[items][<?= $i ?>][caption]" value="<?= e($item['caption'] ?? '') ?>" class="form-input"></div>
                        <div class="form-group">
                            <label>图片</label>
                            <div class="image-upload-group">
                                <?php if (!empty($item['src'])): ?><img <?= $imgAttr($item['src'], 'gallery') ?> class="preview-img" alt=""><?php endif; ?>
                                <input type="file" name="gallery_img_<?= $i ?>" accept="image/*" class="form-file">
                                <input type="hidden" name="gallery[items][<?= $i ?>][src]" value="<?= e($item['src'] ?? '') ?>">
                            </div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                    <div class="form-section">
                        <h3 class="section-title">添加新截图</h3>
                        <div class="form-group"><label>图片说明</label><input type="text" name="gallery_new_caption" class="form-input" placeholder="输入图片描述..."></div>
                        <div class="form-group"><label>上传图片</label><input type="file" name="gallery_new_img" accept="image/*" class="form-file"></div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-save">保存更改</button>
                    </div>
                </form>
            </div>

            <!-- Team Tab -->
            <div id="tab-team" class="tab-pane" style="display: <?= $currentTab === 'team' ? 'block' : 'none' ?>">
                <form method="POST" action="save.php" enctype="multipart/form-data" data-ajax="true">
                    <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
                    <input type="hidden" name="tab" value="team">
                    <div class="form-section">
                        <h3 class="section-title">管理团队板块</h3>
                        <div class="form-row">
                            <div class="form-group"><label>板块标题</label><input type="text" name="team[title]" value="<?= e($content['team']['title'] ?? '') ?>" class="form-input"></div>
                            <div class="form-group"><label>板块副标题</label><input type="text" name="team[subtitle]" value="<?= e($content['team']['subtitle'] ?? '') ?>" class="form-input"></div>
                        </div>
                    </div>
                    <?php foreach (($content['team']['members'] ?? []) as $i => $member): ?>
                    <div class="form-section">
                        <h3 class="section-title">成员 <?= $i + 1 ?>: <?= e($member['name'] ?? '') ?></h3>
                        <div class="form-row">
                            <div class="form-group"><label>名称</label><input type="text" name="team[members][<?= $i ?>][name]" value="<?= e($member['name'] ?? '') ?>" class="form-input"></div>
                            <div class="form-group"><label>英文职位</label><input type="text" name="team[members][<?= $i ?>][role]" value="<?= e($member['role'] ?? '') ?>" class="form-input"></div>
                        </div>
                        <div class="form-group"><label>描述</label><textarea name="team[members][<?= $i ?>][desc]" class="form-input" rows="2"><?= e($member['desc'] ?? '') ?></textarea></div>
                        <div class="form-group"><label>联系链接</label><input type="text" name="team[members][<?= $i ?>][contact_link]" value="<?= e($member['contact_link'] ?? '') ?>" class="form-input" placeholder="如: https://example.com 或 #contact"></div>
                        <div class="form-group">
                            <label>头像</label>
                            <div class="image-upload-group">
                                <?php if (!empty($member['avatar'])): ?><img <?= $imgAttr($member['avatar'], 'team') ?> class="preview-img small round" alt=""><?php endif; ?>
                                <input type="file" name="team_avatar_<?= $i ?>" accept="image/*" class="form-file">
                                <input type="hidden" name="team[members][<?= $i ?>][avatar]" value="<?= e($member['avatar'] ?? '') ?>">
                            </div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                    <div class="form-actions">
                        <button type="submit" class="btn-save">保存更改</button>
                    </div>
                </form>
            </div>

            <!-- Monitor Tab -->
            <div id="tab-monitor" class="tab-pane" style="display: <?= $currentTab === 'monitor' ? 'block' : 'none' ?>">

                <div style="display:flex;align-items:center;gap:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:0.88rem;color:#92400e;line-height:1.5;">
                    <svg style="flex-shrink:0;color:#d97706;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <span><strong>注意：</strong>服务器监控功能仅适用于雨云 <strong>游戏云（RGS）</strong> 实例，其他服务商或自建/网易山头服暂不支持。</span>
                </div>

                <div class="form-section">
                    <h3 class="section-title">
                        实时监控
                        <span id="monStatusBadge" class="mon-status-badge" style="display:none;"></span>
                        <span id="monRefreshHint" style="margin-left:auto;font-size:0.78rem;font-weight:400;color:var(--text-muted);display:none;">
                            <span style="width:7px;height:7px;background:var(--green);border-radius:50%;display:inline-block;animation:pulse-live 2s infinite;vertical-align:middle;"></span>
                            每 3 秒自动刷新
                        </span>
                    </h3>
                    <div id="monLiveWrap" class="mon-live-wrap">
                        <div class="mon-live-gauges">
                            <div class="mon-mini-gauge">
                                <div class="mon-mini-ring-wrap">
                                    <svg viewBox="0 0 110 110" class="mon-mini-svg">
                                        <circle class="mon-ring-bg" cx="55" cy="55" r="42" stroke-width="7"/>
                                        <circle class="mon-ring-fill" id="gaugeFilCpu" cx="55" cy="55" r="42" stroke="#10b981" stroke-width="7" stroke-dasharray="263.9" stroke-dashoffset="263.9"/>
                                    </svg>
                                    <div class="mon-mini-center"><span class="mon-mini-pct" id="gaugePctCpu">—</span></div>
                                </div>
                                <div class="mon-mini-label">CPU</div>
                            </div>
                            <div class="mon-mini-gauge">
                                <div class="mon-mini-ring-wrap">
                                    <svg viewBox="0 0 110 110" class="mon-mini-svg">
                                        <circle class="mon-ring-bg" cx="55" cy="55" r="42" stroke-width="7"/>
                                        <circle class="mon-ring-fill" id="gaugeFilMem" cx="55" cy="55" r="42" stroke="#10b981" stroke-width="7" stroke-dasharray="263.9" stroke-dashoffset="263.9"/>
                                    </svg>
                                    <div class="mon-mini-center"><span class="mon-mini-pct" id="gaugePctMem">—</span></div>
                                </div>
                                <div class="mon-mini-label">内存</div>
                            </div>
                        </div>
                        <div class="mon-live-right">
                            <div class="mon-bw-row">
                                <span class="mon-bw-up">↑ <span id="gaugeValUp">—</span></span>
                                <span class="mon-bw-dn">↓ <span id="gaugeValDown">—</span></span>
                            </div>
                            <div id="monDisksContainer"></div>
                        </div>
                    </div>
                    <div id="monNotConfigured" style="display:none;text-align:center;padding:24px 0;color:var(--text-muted);">
                        请在下方配置雨云 API 密钥和实例 ID 以启用监控
                    </div>
                    <div id="monError" class="mon-error-msg" style="display:none;"></div>
                </div>

                <div class="form-section">
                    <h3 class="section-title">
                        服务器信息
                        <div class="mon-action-bar">
                            <button class="mon-action-btn sm start" id="monBtnStart" onclick="monAction('start')" title="开机"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>开机</button>
                            <button class="mon-action-btn sm restart" id="monBtnRestart" onclick="monAction('restart')" title="重启"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>重启</button>
                            <button class="mon-action-btn sm stop" id="monBtnStop" onclick="monAction('stop')" title="关机"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>关机</button>
                            <button class="mon-action-btn sm reset-pass" id="monBtnResetPass" onclick="monAction('reset_pass')" title="重置密码"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>重置密码</button>
                        </div>
                    </h3>
                    <div id="monActionMsg" class="mon-action-msg" style="display:none;"></div>
                    <div class="mon-rows">
                        <div class="mon-row"><span class="mon-rl">产品 ID</span><span class="mon-rv" id="monProductId">—</span></div>
                        <div class="mon-row"><span class="mon-rl">标签</span><span class="mon-rv" id="monTag">—</span></div>
                        <div class="mon-row"><span class="mon-rl">运行状态</span><span class="mon-rv" id="monStatus"><span class="mon-dot stopped"></span><strong style="color:var(--text-muted)">加载中…</strong></span></div>
                        <div class="mon-row"><span class="mon-rl">节点</span><span class="mon-rv" id="monNode">—</span></div>
                        <div class="mon-row"><span class="mon-rl">剩余可用 CPU 点数</span><span class="mon-rv mon-accent" id="monCpuPower">—</span></div>
                        <div class="mon-row"><span class="mon-rl">每日消耗积分</span><span class="mon-rv" id="monDailyCost">—</span></div>
                        <div class="mon-row"><span class="mon-rl">创建日期</span><span class="mon-rv" id="monCreateDate">—</span></div>
                        <div class="mon-row" style="border-bottom:none"><span class="mon-rl">到期日期</span><span class="mon-rv" id="monExpire">—</span></div>
                    </div>
                </div>

                <div class="form-section">
                    <h3 class="section-title">远程连接</h3>
                    <div class="mon-rows">
                        <div class="mon-row">
                            <span class="mon-rl">远程连接地址 (RDP/SSH)</span>
                            <span class="mon-rv"><strong id="monRdpAddr">—</strong><button class="mon-copy-btn" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('monRdpAddr').textContent)">复制</button></span>
                        </div>
                        <div class="mon-row">
                            <span class="mon-rl">远程用户名</span>
                            <span class="mon-rv"><strong id="monRdpUser">—</strong><button class="mon-copy-btn" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('monRdpUser').textContent)">复制</button></span>
                        </div>
                        <div class="mon-row" style="border-bottom:none">
                            <span class="mon-rl">远程密码</span>
                            <span class="mon-rv" id="monPwRow">
                                <span id="monPwDots" style="font-family:monospace;letter-spacing:2px">••••••••••</span>
                                <button class="mon-copy-btn" id="monPwCopyBtn" onclick="monCopyPw()">复制</button>
                                <button class="mon-copy-btn" id="monPwToggleBtn" onclick="monTogglePw()">查看</button>
                            </span>
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h3 class="section-title">配置信息</h3>
                    <div class="mon-rows">
                        <div class="mon-row"><span class="mon-rl">套餐</span><span class="mon-rv"><strong id="monPlan">—</strong></span></div>
                        <div class="mon-row"><span class="mon-rl">配置</span><span class="mon-rv" id="monSpecs">—</span></div>
                        <div class="mon-row"><span class="mon-rl">操作系统</span><span class="mon-rv" id="monOs">—</span></div>
                        <div class="mon-row"><span class="mon-rl">网络区域</span><span class="mon-rv" id="monZone">—</span></div>
                        <div class="mon-row" style="border-bottom:none"><span class="mon-rl">NAT 公网 IP</span><span class="mon-rv" id="monNatIp">—</span></div>
                    </div>
                </div>

                <div class="form-section">
                    <h3 class="section-title">NAT 端口映射</h3>
                    <div class="mon-rows" id="monNatList">
                        <div class="mon-row" style="border-bottom:none"><span class="mon-rl" style="color:var(--text-muted);">加载中…</span></div>
                    </div>
                </div>

                <div class="form-section">
                    <h3 class="section-title">雨云 API 配置</h3>
                    <form method="POST" action="save.php" data-ajax="true">
                        <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
                        <input type="hidden" name="tab" value="monitor_settings">
                        <div class="form-group">
                            <label>雨云 API 密钥 (x-api-key)</label>
                            <input type="password" name="rainyun_api_key" value="<?= e($settings['rainyun_api_key'] ?? '') ?>" class="form-input" placeholder="在雨云用户中心 → API 管理中生成">
                        </div>
                        <div class="form-group">
                            <label>RGS 实例 ID</label>
                            <input type="text" name="rainyun_rgs_id" value="<?= e($settings['rainyun_rgs_id'] ?? '') ?>" class="form-input" placeholder="例如: 86524">
                        </div>
                        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:16px;">配置完成后，监控数据将自动从雨云 API 实时获取并展示。API 密钥仅存储在服务端，不会暴露到前端。</p>
                        <div class="form-actions">
                            <button type="submit" class="btn-save">保存配置</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Messages Tab -->
            <div id="tab-messages" class="tab-pane" style="display: <?= $currentTab === 'messages' ? 'block' : 'none' ?>">
                <div class="form-section">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                        <h3 class="section-title" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">收件箱 <span id="msgCountLabel" style="font-weight:400;font-size:0.85em;color:var(--text-muted);"></span></h3>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span id="msgLiveIndicator" style="display:inline-flex;align-items:center;gap:6px;font-size:0.8em;color:var(--green);">
                                <span style="width:7px;height:7px;background:var(--green);border-radius:50%;display:inline-block;animation:pulse-live 2s infinite;"></span>
                                实时刷新中
                            </span>
                        </div>
                    </div>
                    <div id="messagesList" class="messages-list"></div>
                    <div id="msgPagination" style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:20px;flex-wrap:wrap;"></div>
                </div>

                <div class="form-section">
                    <h3 class="section-title">消息通知设置</h3>
                    <form method="POST" action="save.php" data-ajax="true">
                        <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
                        <input type="hidden" name="tab" value="messages_settings">
                        
                        <div class="form-row">
                            <div class="form-group" style="flex:1; display: flex; flex-direction: column; align-items: center;">
                                <label class="switch">
                                    <input class="toggle" type="checkbox" name="dnd_mode" value="1" <?= !empty($settings['dnd_mode']) ? 'checked' : '' ?>>
                                    <span class="slider"></span>
                                </label>
                                <span style="margin-top: 12px; font-weight: 500; color: var(--text-primary); cursor: pointer;" onclick="this.previousElementSibling.click()">启用免打扰模式 (不发送邮件通知)</span>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label>自动清理已读消息 (天)</label>
                                <input type="number" name="msg_auto_clean_days" value="<?= e($settings['msg_auto_clean_days'] ?? '0') ?>" class="form-input" min="0" max="3650" placeholder="0 表示不自动清理">
                                <p style="margin:4px 0 0;font-size:0.82em;color:var(--text-muted);">填 0 或留空则不清理；例如填 30 表示自动删除 30 天前的已读消息</p>
                            </div>
                            <div class="form-group">
                                <label>每页显示消息数</label>
                                <input type="number" name="msg_per_page" value="<?= e($settings['msg_per_page'] ?? '10') ?>" class="form-input" min="5" max="100" placeholder="默认 10">
                                <p style="margin:4px 0 0;font-size:0.82em;color:var(--text-muted);">每页展示多少条消息，范围 5~100</p>
                            </div>
                        </div>

                        <div class="form-section" style="margin:20px 0;padding:20px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                                <div>
                                    <h4 style="margin:0;color:var(--text-primary);font-size:1em;">邮箱后缀白名单</h4>
                                    <p style="margin:4px 0 0;font-size:0.85em;color:var(--text-muted);">开启后，仅允许指定邮箱后缀的用户提交消息</p>
                                </div>
                                <label class="switch">
                                    <input class="toggle" type="checkbox" name="email_whitelist_enabled" value="1" <?= !empty($settings['email_whitelist_enabled']) ? 'checked' : '' ?>>
                                    <span class="slider"></span>
                                </label>
                            </div>
                            <div class="form-group" style="margin-bottom:0;">
                                <label>允许的邮箱后缀 (每行一个，例如 qq.com)</label>
                                <textarea name="email_whitelist_text" class="form-input" rows="4" placeholder="qq.com&#10;163.com&#10;gmail.com"><?= e(implode("\n", $settings['email_whitelist'] ?? [])) ?></textarea>
                            </div>
                        </div>

                        <details>
                            <summary style="cursor:pointer;margin:15px 0;color:var(--green-dark);font-weight:500;">配置 SMTP 邮件服务器 (点击展开)</summary>
                            <div style="background:#f8fafc;padding:20px;border-radius:10px;margin-bottom:20px;">
                                <div class="form-row">
                                    <div class="form-group"><label>SMTP 主机</label><input type="text" name="smtp_host" value="<?= e($settings['smtp_host'] ?? '') ?>" class="form-input" placeholder="例如: smtp.qq.com"></div>
                                    <div class="form-group"><label>SMTP 端口</label><input type="text" name="smtp_port" value="<?= e($settings['smtp_port'] ?? '587') ?>" class="form-input" placeholder="例如: 465 或 587"></div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group"><label>SMTP 用户名 (邮箱账号)</label><input type="text" name="smtp_user" value="<?= e($settings['smtp_user'] ?? '') ?>" class="form-input"></div>
                                    <div class="form-group"><label>SMTP 密码 (授权码)</label><input type="password" name="smtp_pass" value="<?= e($settings['smtp_pass'] ?? '') ?>" class="form-input"></div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group"><label>发件人邮箱</label><input type="email" name="smtp_from_email" value="<?= e($settings['smtp_from_email'] ?? '') ?>" class="form-input"></div>
                                    <div class="form-group"><label>发件人名称</label><input type="text" name="smtp_from_name" value="<?= e($settings['smtp_from_name'] ?? 'FoxMC Admin') ?>" class="form-input"></div>
                                </div>
                                <div class="form-group"><label>通知接收邮箱 (留空则发给SMTP用户)</label><input type="email" name="notification_email" value="<?= e($settings['notification_email'] ?? '') ?>" class="form-input"></div>
                                <div class="form-group"><label>回复邮件模板 ({name}, {subject}, {reply_content} 为占位符)</label><textarea name="reply_email_template" class="form-input" rows="4"><?= e($settings['reply_email_template'] ?? "亲爱的 {name}，</br>\n\n您好！</br>\n\n我们已收到您关于「{subject}」的反馈，以下是我们的回复：</br>\n\n{reply_content}</br>\n\n如有其他问题，欢迎随时联系我们。</br>\n\n此致</br>\nFoxMC 管理团队") ?></textarea></div>
                            </div>
                        </details>
                        <div class="form-actions">
                            <button type="submit" class="btn-save">保存设置</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Users Tab -->
            <div id="tab-users" class="tab-pane" style="display: <?= $currentTab === 'users' ? 'block' : 'none' ?>">
                <div class="form-section">
                    <h3 class="section-title">
                        用户管理
                        <span style="margin-left:auto;font-size:0.8em;font-weight:400;color:var(--text-muted);">管理已注册的 Minecraft 用户</span>
                    </h3>

                    <!-- 搜索 & 操作栏 -->
                    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
                        <div style="flex:1;min-width:200px;position:relative;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <input type="text" id="userSearchInput" class="form-input" placeholder="搜索用户名 / 游戏ID / 邮箱..." style="padding-left:36px;" disabled>
                        </div>
                        <button type="button" class="btn-save" style="white-space:nowrap;" disabled>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            添加用户
                        </button>
                    </div>

                    <!-- 统计卡片 -->
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px;">
                        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;text-align:center;">
                            <div style="font-size:1.6em;font-weight:700;color:#16a34a;" id="usersStatTotal">0</div>
                            <div style="font-size:0.85em;color:#15803d;margin-top:2px;">总用户数</div>
                        </div>
                        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;text-align:center;">
                            <div style="font-size:1.6em;font-weight:700;color:#2563eb;" id="usersStatOnline">0</div>
                            <div style="font-size:0.85em;color:#1d4ed8;margin-top:2px;">在线用户</div>
                        </div>
                        <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:16px;text-align:center;">
                            <div style="font-size:1.6em;font-weight:700;color:#ca8a04;" id="usersStatNew">0</div>
                            <div style="font-size:0.85em;color:#a16207;margin-top:2px;">本周新增</div>
                        </div>
                        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;text-align:center;">
                            <div style="font-size:1.6em;font-weight:700;color:#dc2626;" id="usersStatBanned">0</div>
                            <div style="font-size:0.85em;color:#b91c1c;margin-top:2px;">已封禁</div>
                        </div>
                    </div>

                    <!-- 用户列表表格 -->
                    <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff;">
                        <table style="width:100%;border-collapse:collapse;font-size:0.9em;">
                            <thead>
                                <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
                                    <th style="padding:12px 14px;text-align:left;font-weight:600;color:var(--text-primary);white-space:nowrap;">游戏ID</th>
                                    <th style="padding:12px 14px;text-align:left;font-weight:600;color:var(--text-primary);white-space:nowrap;">邮箱</th>
                                    <th style="padding:12px 14px;text-align:center;font-weight:600;color:var(--text-primary);white-space:nowrap;">状态</th>
                                    <th style="padding:12px 14px;text-align:center;font-weight:600;color:var(--text-primary);white-space:nowrap;">注册时间</th>
                                    <th style="padding:12px 14px;text-align:center;font-weight:600;color:var(--text-primary);white-space:nowrap;">最后登录</th>
                                    <th style="padding:12px 14px;text-align:center;font-weight:600;color:var(--text-primary);white-space:nowrap;">操作</th>
                                </tr>
                            </thead>
                            <tbody id="usersTableBody">
                                <tr>
                                    <td colspan="6" style="padding:40px;text-align:center;color:#94a3b8;">
                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;opacity:0.4;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                                        <div style="font-size:1em;margin-bottom:4px;">暂无注册用户</div>
                                        <div style="font-size:0.85em;">用户注册功能开发中，敬请期待</div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- 分页占位 -->
                    <div id="usersPagination" style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:16px;"></div>
                </div>
            </div>

            <!-- Community Tab -->
            <div id="tab-community" class="tab-pane" style="display: <?= $currentTab === 'community' ? 'block' : 'none' ?>">
                <form method="POST" action="save.php" enctype="multipart/form-data" data-ajax="true">
                    <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
                    <input type="hidden" name="tab" value="community">
                    <div class="form-section">
                        <h3 class="section-title">社区链接板块</h3>
                        <div class="form-row">
                            <div class="form-group"><label>板块标题</label><input type="text" name="community[title]" value="<?= e($content['community']['title'] ?? '') ?>" class="form-input"></div>
                            <div class="form-group"><label>板块副标题</label><input type="text" name="community[subtitle]" value="<?= e($content['community']['subtitle'] ?? '') ?>" class="form-input"></div>
                        </div>
                    </div>
                    <div class="form-section">
                        <h3 class="section-title">QQ群</h3>
                        <div class="form-group"><label>标题</label><input type="text" name="community[qq_text]" value="<?= e($content['community']['qq_text'] ?? '') ?>" class="form-input"></div>
                        <div class="form-group"><label>描述</label><input type="text" name="community[qq_desc]" value="<?= e($content['community']['qq_desc'] ?? '') ?>" class="form-input"></div>
                        <div class="form-group">
                            <label>二维码图片</label>
                            <div class="image-upload-group">
                                <?php if (!empty($content['community']['qq_qr'])): ?>
                                    <img <?= $imgAttr($content['community']['qq_qr'], 'community') ?> class="preview-img small" alt="">
                                <?php endif; ?>
                                <input type="file" name="community_qq_qr" accept="image/*" class="form-file">
                                <input type="hidden" name="community[qq_qr]" value="<?= e($content['community']['qq_qr'] ?? '') ?>">
                            </div>
                        </div>
                        <div class="form-group"><label>加群链接</label><input type="text" name="community[qq_link]" value="<?= e($content['community']['qq_link'] ?? '') ?>" class="form-input"></div>
                    </div>
                    <div class="form-section">
                        <h3 class="section-title">微信群</h3>
                        <div class="form-group"><label>标题</label><input type="text" name="community[wechat_text]" value="<?= e($content['community']['wechat_text'] ?? '') ?>" class="form-input"></div>
                        <div class="form-group"><label>描述</label><input type="text" name="community[wechat_desc]" value="<?= e($content['community']['wechat_desc'] ?? '') ?>" class="form-input"></div>
                        <div class="form-group">
                            <label>二维码图片</label>
                            <div class="image-upload-group">
                                <?php if (!empty($content['community']['wechat_qr'])): ?>
                                    <img <?= $imgAttr($content['community']['wechat_qr'], 'community') ?> class="preview-img small" alt="">
                                <?php endif; ?>
                                <input type="file" name="community_wechat_qr" accept="image/*" class="form-file">
                                <input type="hidden" name="community[wechat_qr]" value="<?= e($content['community']['wechat_qr'] ?? '') ?>">
                            </div>
                        </div>
                        <div class="form-group"><label>加群链接</label><input type="text" name="community[wechat_link]" value="<?= e($content['community']['wechat_link'] ?? '') ?>" class="form-input"></div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-save">保存更改</button>
                    </div>
                </form>
            </div>

            <!-- Footer Tab -->
            <div id="tab-footer" class="tab-pane" style="display: <?= $currentTab === 'footer' ? 'block' : 'none' ?>">
                <form method="POST" action="save.php" enctype="multipart/form-data" data-ajax="true">
                    <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
                    <input type="hidden" name="tab" value="footer">
                    <div class="form-section">
                        <h3 class="section-title">页脚设置</h3>
                        <div class="form-group"><label>页脚描述</label><textarea name="footer[desc]" class="form-input" rows="3"><?= e($content['footer']['desc'] ?? '') ?></textarea></div>
                        <div class="form-group"><label>版权信息</label><input type="text" name="footer[copyright]" value="<?= e($content['footer']['copyright'] ?? '') ?>" class="form-input"></div>
                    </div>
                    <?php foreach (($content['footer']['friend_links'] ?? []) as $i => $link): ?>
                    <div class="form-section">
                        <h3 class="section-title">友情链接 <?= $i + 1 ?></h3>
                        <div class="form-row">
                            <div class="form-group"><label>名称</label><input type="text" name="footer[friend_links][<?= $i ?>][name]" value="<?= e($link['name'] ?? '') ?>" class="form-input"></div>
                            <div class="form-group"><label>链接</label><input type="text" name="footer[friend_links][<?= $i ?>][url]" value="<?= e($link['url'] ?? '') ?>" class="form-input" placeholder="https://example.com"></div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                    <div class="form-section">
                        <h3 class="section-title">添加新友情链接</h3>
                        <div class="form-row">
                            <div class="form-group"><label>名称</label><input type="text" name="footer_new_link_name" class="form-input" placeholder="输入链接名称..."></div>
                            <div class="form-group"><label>链接</label><input type="text" name="footer_new_link_url" class="form-input" placeholder="https://example.com"></div>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-save">保存更改</button>
                    </div>
                </form>
            </div>

        </div>
    </main>

    <!-- Lightbox -->
    <div id="lightbox" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(4px);" onclick="closeLightbox()">
        <img id="lightboxImg" src="" alt="预览" style="max-width:90%;max-height:90%;object-fit:contain;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:slideUp 0.3s ease;">
        <button onclick="closeLightbox()" style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.2);border:none;color:#fff;width:40px;height:40px;border-radius:50%;font-size:1.5rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">&times;</button>
    </div>

    <script>const tabLabels = <?= json_encode(array_map(fn($t) => $t['label'], $tabs)) ?>;</script>
    <script src="script.js?v=<?= filemtime(__DIR__.'/script.js') ?>"></script>
    <script src="panel-init.js?v=<?= filemtime(__DIR__.'/panel-init.js') ?>"></script>
</body>
</html>
<?php
// 最终输出广告完整性校验
$__html = ob_get_clean();
if (!verifyAdOutput($__html, $settings)) {
    lockAdmin('广告输出被篡改（注释/隐藏/节点丢失）');
    requireAdIntegrity();
    exit;
}
echo $__html;
?>
