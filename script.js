let serverIP = 'Play.Doulor.cn';
let siteMode = 'international';
let neteaseTierCap = 4;

function copyServerIP() {
    navigator.clipboard.writeText(serverIP).then(() => {
        setTimeout(() => {
            const toggle = document.getElementById('toggle');
            if (toggle) toggle.checked = false;
        }, 2000);
    }).catch(() => {});
}

// --- Safe DOM helpers (XSS prevention) ---
function safeText(el, text) {
    if (el && text != null) el.textContent = text;
}

function safeImgSrc(el, url) {
    if (!el || !url) return;
    // Only allow relative paths and http(s) URLs
    if (/^(\.\/|\/|https?:\/\/)/.test(url)) {
        el.setAttribute('src', url);
    }
}

function createSafeImg(url, alt, className) {
    const img = document.createElement('img');
    if (className) img.className = className;
    img.alt = alt || '';
    safeImgSrc(img, url);
    return img;
}

function safeLink(el, url) {
    if (!el || !url) return;
    if (typeof url === 'string') {
        if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('#') || url.startsWith('/')) {
            el.href = url;
        } else if (/^[a-zA-Z0-9]/.test(url) && url.includes('.')) {
            el.href = 'https://' + url;
        }
    }
}

const $ = (sel) => document.querySelector(sel);

document.addEventListener('DOMContentLoaded', () => {
    // Load admin settings so front-end can respect module toggles
    // window.SETTINGS removed: unified homepage toggle and plugin controls were removed per user request.
    fetch('/admin/data/settings.json')
        .then(r => r.ok ? r.json() : null)
        .then(cfg => {
            if (cfg) {
                window.SETTINGS = cfg;
            }
        })
        .catch(() => { /* ignore, keep defaults */ });
    // --- Register button (moved from inline onclick) ---
    const regBtn = document.getElementById('navRegisterBtn');
    if (regBtn) regBtn.addEventListener('click', () => alert('注册功能开发中，敬请期待！'));

    // --- Copy IP toggle (moved from inline onchange) ---
    const toggle = document.getElementById('toggle');
    if (toggle) toggle.addEventListener('change', () => { if (toggle.checked) copyServerIP(); });

    // --- Single IntersectionObserver for both lazy-load and reveal ---
    const io = new IntersectionObserver((entries, obs) => {
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (!entry.isIntersecting) continue;
            const el = entry.target;

            if (el.tagName === 'IMG' && el.dataset.src) {
                el.src = el.dataset.src;
                el.removeAttribute('data-src');
            }

            if (el.dataset.bg) {
                el.style.backgroundImage = el.dataset.bg;
                el.removeAttribute('data-bg');
            }

            if (el.classList.contains('scroll-fade-up') || el.classList.contains('section-header') || el.classList.contains('spec-card')) {
                el.classList.add('revealed');
            }

            obs.unobserve(el);
        }
    }, { rootMargin: '200px 0px', threshold: 0.01 });

    const observeTargets = document.querySelectorAll('[data-src], [data-bg], .scroll-fade-up, .section-header, .spec-card');
    for (let i = 0; i < observeTargets.length; i++) io.observe(observeTargets[i]);

    // --- Gallery Carousel ---
    const galleryImages = [
        { src: "./png/f5ea0ca06bf5ac36704b7277536ab53d.jpg", desc: "宏伟的主城大厅" },
        { src: "./png/5e1e1be033cbd911e62327519886379f.jpg", desc: "精美的玩家建筑" },
        { src: "./png/9cca3afcca8c0a79eac6a39aad5d65ec.jpg", desc: "广阔的生存世界" },
        { src: "./png/img1_bcd004c0.jpg", desc: "热闹的活动现场" },
        { src: "./png/img2_ab032cdc.jpg", desc: "激情的PVP对战" }
    ];

    let currentImageIndex = 0;
    let isTransitioning = false;
    const galleryImage = document.getElementById('galleryImage');
    const galleryDescription = document.getElementById('galleryDescription');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    const preloadedImages = [];
    let galleryPreloaded = false;
    function preloadGalleryImages() {
        if (galleryPreloaded) return;
        galleryPreloaded = true;
        for (let i = 0; i < galleryImages.length; i++) {
            const img = new Image();
            img.src = galleryImages[i].src;
            preloadedImages.push(img);
        }
    }
    const gallerySec = document.getElementById('gallery');
    if (gallerySec) {
        const galleryIo = new IntersectionObserver((entries, obs) => {
            if (entries[0].isIntersecting) {
                preloadGalleryImages();
                obs.unobserve(gallerySec);
            }
        }, { rootMargin: '400px 0px' });
        galleryIo.observe(gallerySec);
    }

    if (galleryImage && galleryDescription && prevBtn && nextBtn) {
        function updateGallery(index) {
            if (isTransitioning) return;
            isTransitioning = true;
            galleryImage.classList.add('fade-out');

            setTimeout(() => {
                galleryImage.src = galleryImages[index].src;
                galleryDescription.textContent = galleryImages[index].desc;
                galleryImage.classList.remove('fade-out');
                isTransitioning = false;
            }, 300);
        }

        function nextImage() {
            currentImageIndex = (currentImageIndex + 1) % galleryImages.length;
            updateGallery(currentImageIndex);
        }

        function prevImage() {
            currentImageIndex = (currentImageIndex - 1 + galleryImages.length) % galleryImages.length;
            updateGallery(currentImageIndex);
        }

        nextBtn.addEventListener('click', nextImage);
        prevBtn.addEventListener('click', prevImage);

        let autoPlay = setInterval(nextImage, 5000);
        const carouselContainer = document.querySelector('.gallery-carousel-container');
        if (carouselContainer) {
            carouselContainer.addEventListener('mouseenter', () => clearInterval(autoPlay), { passive: true });
            carouselContainer.addEventListener('mouseleave', () => {
                clearInterval(autoPlay);
                autoPlay = setInterval(nextImage, 5000);
            }, { passive: true });
        }

        // Pause autoplay when tab is hidden to save CPU
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                clearInterval(autoPlay);
            } else {
                clearInterval(autoPlay);
                autoPlay = setInterval(nextImage, 5000);
            }
        });
    }

    // --- Mobile Navigation ---
    const hamburger = document.querySelector(".hamburger");
    const navLinks = document.querySelector(".nav-links");

    if (hamburger && navLinks) {
        hamburger.addEventListener("click", () => {
            hamburger.classList.toggle("active");
            navLinks.classList.toggle("active");
        });

        navLinks.addEventListener("click", (e) => {
            if (e.target.tagName === 'A') {
                hamburger.classList.remove("active");
                navLinks.classList.remove("active");
            }
        });
    }

    // ========== CMS Content Loader (modularized) ==========

    function applySiteData(data) {
        const siteLogo = document.getElementById('siteLogo');
        const footerLogo = document.getElementById('footerLogo');

        if (data.logo_image) {
            if (siteLogo) {
                siteLogo.textContent = '';
                siteLogo.appendChild(createSafeImg(data.logo_image, 'Logo', 'logo-img'));
            }
            if (footerLogo) {
                footerLogo.textContent = '';
                footerLogo.appendChild(createSafeImg(data.logo_image, 'Logo', 'footer-logo-img'));
            }
        } else if (data.logo_text) {
            const logoText = siteLogo && siteLogo.querySelector('.logo-text');
            if (logoText) logoText.textContent = data.logo_text;
            const footerText = footerLogo && footerLogo.querySelector('.footer-logo-text');
            if (footerText) footerText.textContent = data.logo_text;
        }

        if (data.server_ip) {
            serverIP = data.server_ip;
            safeText(document.getElementById('server-ip'), serverIP);
            safeText(document.getElementById('help-ip'), serverIP);

            document.querySelectorAll('.copy-btn').forEach(btn => {
                btn.onclick = function () {
                    navigator.clipboard.writeText(serverIP).then(() => {
                        const orig = this.innerHTML;
                        this.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                        setTimeout(() => { this.innerHTML = orig; }, 2000);
                    });
                };
            });
        }

        if (data.server_mode === 'netease') {
            siteMode = 'netease';
            const tierCaps = { shangyao: 4, shanfeng: 12, yunding: 40 };
            neteaseTierCap = tierCaps[data.netease_tier] || 4;
            const copyLabel = document.querySelector('.boton-minecraft .texto-boton span:first-child');
            if (copyLabel) copyLabel.textContent = '复制山头链接';
        }
    }

    function applyHeroData(data) {
        const badge = $('.hero-badge');
        if (badge && data.badge) badge.lastChild.textContent = ' ' + data.badge;

        const h1 = $('.hero h1');
        if (h1 && data.title_line1 && data.title_highlight) {
            h1.textContent = '';
            h1.appendChild(document.createTextNode(data.title_line1));
            h1.appendChild(document.createElement('br'));
            const span = document.createElement('span');
            span.className = 'highlight';
            span.textContent = data.title_highlight;
            h1.appendChild(span);
        }
        safeText($('.hero-subtitle'), data.subtitle);

        // player_count now fetched from players API, skip CMS override

        if (data.features && data.features.length) {
            const container = $('.hero-features');
            if (container) {
                const frag = document.createDocumentFragment();
                data.features.forEach(f => {
                    const div = document.createElement('div');
                    div.className = 'h-feature';
                    div.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                    div.appendChild(document.createTextNode(f));
                    frag.appendChild(div);
                });
                container.textContent = '';
                container.appendChild(frag);
            }
        }
    }

    function applySpecsData(data) {
        safeText($('#specs .section-title'), data.title);
        safeText($('#specs .section-subtitle'), data.subtitle);
        const specCards = document.querySelectorAll('.spec-card');
        (data.items || []).forEach((item, i) => {
            if (!specCards[i]) return;
            const c = specCards[i];
            safeText(c.querySelector('.spec-title'), item.title);
            safeText(c.querySelector('.spec-desc'), item.desc);
            safeText(c.querySelector('.spec-value'), item.value);
        });
    }

    function applyHelpData(data) {
        safeText($('#help-docs .section-title'), data.title);
        safeText($('#help-docs .section-subtitle'), data.subtitle);
        const stepCards = document.querySelectorAll('.step-card');
        (data.steps || []).forEach((step, i) => {
            if (!stepCards[i]) return;
            safeText(stepCards[i].querySelector('.step-title'), step.title);
            safeText(stepCards[i].querySelector('.step-desc'), step.desc);
        });
    }

    function applyFeaturesData(data) {
        safeText($('#features .section-title'), data.title);
        safeText($('#features .section-subtitle'), data.subtitle);
        const featureCards = document.querySelectorAll('.feature-card');
        (data.items || []).forEach((item, i) => {
            if (!featureCards[i]) return;
            safeText(featureCards[i].querySelector('h3'), item.title);
            safeText(featureCards[i].querySelector('p'), item.desc);
        });
    }

    function applyGalleryData(data) {
        safeText($('#gallery .section-title'), data.title);
        safeText($('#gallery .section-subtitle'), data.subtitle);
        if (data.items && data.items.length) {
            galleryImages.length = 0;
            data.items.forEach(g => galleryImages.push({ src: g.src, desc: g.caption }));
        }
    }

    function applyTeamData(data) {
        safeText($('#team .section-title'), data.title);
        safeText($('#team .section-subtitle'), data.subtitle);
        const originalCards = document.querySelectorAll('.team-card:not(.team-card-clone)');
        (data.members || []).forEach((m, i) => {
            if (!originalCards[i]) return;
            const c = originalCards[i];
            safeText(c.querySelector('.team-name'), m.name);
            safeText(c.querySelector('.team-role'), m.role);
            safeText(c.querySelector('.team-desc'), m.desc);
            const contactBtn = c.querySelector('.team-contact-btn');
            if (contactBtn && m.contact_link) {
                safeLink(contactBtn, m.contact_link);
            }
        });
        // Refresh clones to match updated originals
        const wrapper = document.getElementById('teamWrapper');
        if (wrapper) {
            wrapper.querySelectorAll('.team-card-clone').forEach(clone => clone.remove());
            wrapper.querySelectorAll('.team-card').forEach(card => {
                const clone = card.cloneNode(true);
                clone.classList.add('team-card-clone');
                wrapper.appendChild(clone);
            });
        }
    }

    function applyCommunityData(data) {
        safeText($('#community .section-title'), data.title);
        safeText($('#community .section-subtitle'), data.subtitle);
        const comCards = document.querySelectorAll('.community-card');
        [0, 1].forEach(i => {
            if (!comCards[i]) return;
            const prefix = i === 0 ? 'qq' : 'wechat';
            safeText(comCards[i].querySelector('h3'), data[prefix + '_text'] || '');
            safeText(comCards[i].querySelector('p'), data[prefix + '_desc'] || '');
            const qr = comCards[i].querySelector('.qr-code');
            if (qr && data[prefix + '_qr']) {
                qr.textContent = '';
                const img = createSafeImg(data[prefix + '_qr'], '二维码');
                img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
                qr.appendChild(img);
                qr.style.opacity = '1';
                qr.style.background = 'none';
            }
            const link = comCards[i].querySelector('a');
            safeLink(link, data[prefix + '_link']);
        });
    }

    function applyFooterData(data) {
        safeText($('.footer-desc'), data.desc);
        const copy = document.querySelector('.footer-bottom .container p:first-child');
        if (copy && data.copyright) copy.textContent = data.copyright;

        if (data.friend_links && data.friend_links.length) {
            const list = document.getElementById('footerFriendLinks');
            if (list) {
                list.textContent = '';
                data.friend_links.forEach(link => {
                    const li = document.createElement('li');
                    const a = document.createElement('a');
                    a.textContent = link.name;
                    safeLink(a, link.url);
                    if (!a.href) a.href = '#';
                    li.appendChild(a);
                    list.appendChild(li);
                });
            }
        }
    }

    // --- Fetch online player count for hero status ---
    function updateOnlineCount() {
        const statusText = $('.highlight-green');
        if (!statusText) return;

        fetch('players.php')
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(res) {
                if (res && res.success && res.players && Array.isArray(res.players)) {
                    const onlinePlayers = res.players.filter(function(p) { return p.isOnline; });
                    statusText.textContent = '在线 (' + onlinePlayers.length + ')';
                } else {
                    statusText.textContent = '在线';
                }
            })
            .catch(function() {
                statusText.textContent = '在线';
            });
    }

    // --- Fetch players list from API (via PHP proxy) ---
    function fetchPlayers() {
        const playersGrid = document.getElementById('playersGrid');
        if (!playersGrid) return;

        fetch('players.php')
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(res) {
                if (!res || !res.success || !res.players || !Array.isArray(res.players)) {
                    playersGrid.innerHTML = '<div class="players-loading">暂无玩家数据</div>';
                    return;
                }

                const players = res.players;
                // 排序：在线玩家排前面，离线玩家排后面
                players.sort(function(a, b) {
                    if (a.isOnline && !b.isOnline) return -1;
                    if (!a.isOnline && b.isOnline) return 1;
                    return 0;
                });
                if (players.length === 0) {
                    playersGrid.innerHTML = '<div class="players-loading">当前没有玩家在线</div>';
                    return;
                }

                let html = '';
                for (let i = 0; i < players.length; i++) {
                    const p = players[i];
                    const onlineClass = p.isOnline ? 'online' : 'offline';
                    const onlineText = p.isOnline ? '在线' : '离线';

                    // Use minotar with player name for avatar (fast & reliable)
                    const avatarUrl = 'https://minotar.net/avatar/' + encodeURIComponent(p.name) + '/48';

                    let gamemodeText = p.gamemode || 'survival';
                    const gamemodeMap = { adventure: '冒险', creative: '创造', survival: '生存', spectator: '旁观' };
                    gamemodeText = gamemodeMap[gamemodeText] || gamemodeText;

                    let banHtml = '';
                    if (p.isBanned) {
                        banHtml = '<div class="player-ban-badge">封禁</div>';
                        if (p.banReason) {
                            banHtml += '<div class="player-ban-reason">' + p.banReason + '</div>';
                        }
                    }

                    html += '<div class="player-card">' +
                        '<div class="player-avatar">' +
                            '<img src="' + avatarUrl + '" alt="' + p.name + '" loading="lazy">' +
                        '</div>' +
                        '<div class="player-info">' +
                            '<div class="player-name">' + p.name + '</div>' +
                            '<div class="player-meta">' +
                                '<span class="player-status-badge ' + onlineClass + '">' + onlineText + '</span>' +
                                '<span class="player-gamemode-badge">' + gamemodeText + '</span>' +
                                banHtml +
                            '</div>' +
                        '</div>' +
                    '</div>';
                }
                playersGrid.innerHTML = html;

                // Add click handlers on player avatars to open detail modal
                const playerCards = playersGrid.querySelectorAll('.player-card');
                for (var j = 0; j < playerCards.length; j++) {
                    (function(card, player) {
                        var avatar = card.querySelector('.player-avatar');
                        if (avatar) {
                            avatar.style.cursor = 'pointer';
                            avatar.addEventListener('click', function(e) {
                                e.stopPropagation();
                                openPlayerDetail(player.uuid, player.name);
                            });
                        }
                    })(playerCards[j], players[j]);
                }
            })
            .catch(function() {
                const el = document.getElementById('playersGrid');
                if (el) el.innerHTML = '<div class="players-loading">加载失败</div>';
            });
    }

    // --- Player Detail Modal ---
    const playerDetailModal = document.getElementById('playerDetailModal');
    const modalContent = document.getElementById('modalContent');
    const modalCloseBtn = document.getElementById('modalCloseBtn');

    function openPlayerDetail(uuid, name) {
        if (!playerDetailModal || !modalContent) return;

        playerDetailModal.classList.add('active');
        modalContent.innerHTML = '<div class="modal-loading">加载中...</div>';

        fetch('player_detail.php?uuid=' + encodeURIComponent(uuid))
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(res) {
                if (!res || !res.success || !res.data) {
                    modalContent.innerHTML = '<div class="modal-loading">加载失败</div>';
                    return;
                }

                const p = res.data;
                const avatarUrl = 'https://minotar.net/avatar/' + encodeURIComponent(p.name) + '/80';
                const gamemodeMap = { adventure: '冒险', creative: '创造', survival: '生存', spectator: '旁观' };
                const gamemodeText = gamemodeMap[p.gamemode] || p.gamemode || '生存';
                const onlineText = p.isOnline ? '在线' : '离线';
                const onlineClass = p.isOnline ? 'online' : 'offline';
                const bannedText = p.isBanned ? '是' : '否';
                const bannedClass = p.isBanned ? 'banned' : 'not-banned';

                var html = '<div class="modal-player-header">' +
                    '<div class="modal-player-avatar"><img src="' + avatarUrl + '" alt="' + p.name + '"></div>' +
                    '<div>' +
                        '<div class="modal-player-name">' + p.name + '</div>' +
                        '<div class="modal-player-uuid">' + p.uuid + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="modal-details">' +
                    '<div class="modal-detail-row">' +
                        '<span class="modal-detail-label">状态</span>' +
                        '<span class="modal-detail-value ' + onlineClass + '">' + onlineText + '</span>' +
                    '</div>' +
                    '<div class="modal-detail-row">' +
                        '<span class="modal-detail-label">游戏模式</span>' +
                        '<span class="modal-detail-value">' + gamemodeText + '</span>' +
                    '</div>' +
                    '<div class="modal-detail-row">' +
                        '<span class="modal-detail-label">封禁状态</span>' +
                        '<span class="modal-detail-value ' + bannedClass + '">' + bannedText + '</span>' +
                    '</div>';

                if (p.isBanned && p.banReason) {
                    html += '<div class="modal-ban-reason">封禁原因: ' + p.banReason + '</div>';
                }

                html += '</div>';
                modalContent.innerHTML = html;
            })
            .catch(function() {
                modalContent.innerHTML = '<div class="modal-loading">加载失败</div>';
            });
    }

    function closePlayerDetail() {
        if (playerDetailModal) {
            playerDetailModal.classList.remove('active');
        }
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closePlayerDetail);
    }
    if (playerDetailModal) {
        playerDetailModal.addEventListener('click', function(e) {
            if (e.target === playerDetailModal) {
                closePlayerDetail();
            }
        });
    }
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closePlayerDetail();
        }
    });

    // Plugins removed: plugin grid and related fetching were removed per user request.

    // --- Fetch monitor data ---
    function fetchMonitor() {
        const monitorGrid = document.getElementById('monitorGrid');
        if (!monitorGrid) return;

        fetch('monitor.php')
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(res) {
                if (!res || !res.success || !res.data) {
                    monitorGrid.innerHTML = '<div class="players-loading">暂无监控数据</div>';
                    return;
                }

                var d = res.data;

                function getBarClass(val) {
                    if (val < 50) return 'green';
                    if (val < 80) return 'yellow';
                    return 'red';
                }

                var cpuVal = d.cpu != null ? d.cpu : 0;
                var memVal = d.memory != null ? d.memory : 0;
                var tpsVal = d.tps != null ? d.tps : 0;

                // TPS color: green >= 19, yellow >= 15, red < 15
                var tpsBarClass = 'green';
                if (tpsVal < 15) tpsBarClass = 'red';
                else if (tpsVal < 19) tpsBarClass = 'yellow';

                // TPS percentage for bar (max 20)
                var tpsPercent = Math.min(100, (tpsVal / 20) * 100);

                var html =
                    '<div class="monitor-card">' +
                        '<div class="monitor-card-icon">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9H15V15H9V9Z"/></svg>' +
                        '</div>' +
                        '<div class="monitor-card-label">CPU 使用率</div>' +
                        '<div class="monitor-card-value">' + cpuVal.toFixed(1) + '<span class="monitor-card-unit">%</span></div>' +
                        '<div class="monitor-card-bar"><div class="monitor-card-bar-fill ' + getBarClass(cpuVal) + '" style="width:' + cpuVal + '%"></div></div>' +
                    '</div>' +
                    '<div class="monitor-card">' +
                        '<div class="monitor-card-icon">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12H20"/><path d="M12 4V20"/></svg>' +
                        '</div>' +
                        '<div class="monitor-card-label">内存使用率</div>' +
                        '<div class="monitor-card-value">' + memVal.toFixed(1) + '<span class="monitor-card-unit">%</span></div>' +
                        '<div class="monitor-card-bar"><div class="monitor-card-bar-fill ' + getBarClass(memVal) + '" style="width:' + memVal + '%"></div></div>' +
                    '</div>' +
                    '<div class="monitor-card">' +
                        '<div class="monitor-card-icon">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6V12L16 14"/></svg>' +
                        '</div>' +
                        '<div class="monitor-card-label">TPS</div>' +
                        '<div class="monitor-card-value">' + tpsVal.toFixed(1) + '<span class="monitor-card-unit">/20</span></div>' +
                        '<div class="monitor-card-bar"><div class="monitor-card-bar-fill ' + tpsBarClass + '" style="width:' + tpsPercent + '%"></div></div>' +
                    '</div>';

                monitorGrid.innerHTML = html;
            })
            .catch(function() {
                var el = document.getElementById('monitorGrid');
                if (el) el.innerHTML = '<div class="players-loading">加载失败</div>';
            });
    }

    // --- Fetch and apply CMS data ---
    fetch('admin/data/content.json')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (!data) return;
            if (data.site)      applySiteData(data.site);
            if (data.hero)      applyHeroData(data.hero);
            if (data.specs)     applySpecsData(data.specs);
            if (data.help)      applyHelpData(data.help);
            if (data.features)  applyFeaturesData(data.features);
            if (data.gallery)   applyGalleryData(data.gallery);
            if (data.team)      applyTeamData(data.team);
            if (data.community) applyCommunityData(data.community);
            if (data.footer)    applyFooterData(data.footer);
            updateOnlineCount();
            fetchPlayers();
        })
        .catch(() => {});

    // Fetch monitor data (independent of CMS)
    fetchMonitor();

    // --- Team Carousel: clone cards for seamless loop ---
    const teamWrapper = document.getElementById('teamWrapper');
    if (teamWrapper) {
        const originalCards = teamWrapper.querySelectorAll('.team-card');
        for (let i = 0; i < originalCards.length; i++) {
            const clone = originalCards[i].cloneNode(true);
            clone.classList.add('team-card-clone');
            teamWrapper.appendChild(clone);
        }
        const clonedImgs = teamWrapper.querySelectorAll('img[data-src]');
        for (let i = 0; i < clonedImgs.length; i++) io.observe(clonedImgs[i]);

        // Pause carousel animation when off-screen to save CPU
        const teamSection = document.getElementById('team');
        if (teamSection) {
            const teamIo = new IntersectionObserver((entries) => {
                teamWrapper.style.animationPlayState = entries[0].isIntersecting ? 'running' : 'paused';
            }, { rootMargin: '100px 0px' });
            teamIo.observe(teamSection);
        }
    }

    // --- Contact Form ---
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        const uploadArea = document.getElementById('uploadArea');
        const uploadInput = document.getElementById('attachment');
        const uploadPreview = document.getElementById('uploadPreview');
        const msgEditor = document.getElementById('msgEditor');
        let selectedFiles = [];
        const MAX_FILES = 3;
        const MAX_SIZE = 5 * 1024 * 1024;

        function updatePreview() {
            uploadPreview.innerHTML = '';
            selectedFiles.forEach((file, i) => {
                const item = document.createElement('div');
                item.className = 'upload-preview-item';
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.alt = file.name;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'remove-btn';
                btn.textContent = '×';
                btn.setAttribute('aria-label', '移除图片');
                btn.addEventListener('click', () => { selectedFiles.splice(i, 1); updatePreview(); });
                item.appendChild(img);
                item.appendChild(btn);
                uploadPreview.appendChild(item);
            });
            const hint = document.getElementById('attachHint');
            if (hint) hint.textContent = selectedFiles.length > 0 ? selectedFiles.length + '/3 张' : '最多3张，每张≤5MB';
        }

        function addFiles(files) {
            for (const file of files) {
                if (selectedFiles.length >= MAX_FILES) break;
                if (!file.type.startsWith('image/')) continue;
                if (file.size > MAX_SIZE) { alert('图片 "' + file.name + '" 超过5MB限制'); continue; }
                selectedFiles.push(file);
            }
            updatePreview();
        }

        if (uploadArea && uploadInput) {
            uploadArea.addEventListener('click', () => uploadInput.click());
            uploadInput.addEventListener('change', () => { addFiles(uploadInput.files); uploadInput.value = ''; });
        }
        if (msgEditor) {
            msgEditor.addEventListener('dragover', (e) => { e.preventDefault(); msgEditor.style.borderColor = '#10b981'; });
            msgEditor.addEventListener('dragleave', (e) => { if (!msgEditor.contains(e.relatedTarget)) msgEditor.style.borderColor = ''; });
            msgEditor.addEventListener('drop', (e) => { e.preventDefault(); msgEditor.style.borderColor = ''; addFiles(e.dataTransfer.files); });
        }

        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const submitBtn = contactForm.querySelector('.submit-btn');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span>发送中...</span>';
            submitBtn.style.opacity = '0.8';
            submitBtn.disabled = true;

            const formData = new FormData(contactForm);
            formData.delete('attachments');
            selectedFiles.forEach((file, i) => formData.append('image_' + i, file));

            fetch('submit_message.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    submitBtn.innerHTML = '<span>发送成功！</span>';
                    submitBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                    submitBtn.style.opacity = '1';
                    contactForm.reset();
                    selectedFiles = [];
                    updatePreview();
                    setTimeout(() => { submitBtn.innerHTML = originalText; submitBtn.style.background = ''; submitBtn.disabled = false; }, 3000);
                } else {
                    alert('发送失败: ' + result.message);
                    submitBtn.innerHTML = originalText; submitBtn.style.opacity = ''; submitBtn.disabled = false;
                }
            })
            .catch(() => { alert('发送出错，请稍后重试'); submitBtn.innerHTML = originalText; submitBtn.style.opacity = ''; submitBtn.disabled = false; });
        });
    }
});