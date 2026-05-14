let serverIP = 'play.example.com';
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
        { src: "./egg/img1_bcd004c0.jpg", desc: "热闹的活动现场" },
        { src: "./egg/img2_ab032cdc.jpg", desc: "激情的PVP对战" }
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

        // player_count now fetched from server status API, skip CMS override

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

    // --- Fetch server online status from API (via PHP proxy to avoid CORS) ---
    function fetchServerStatus() {
        const statusDot = $('.status-dot');
        const statusContainer = $('.status-text');
        const statusText = $('.highlight-green');

        if (siteMode === 'netease') {
            if (statusContainer) {
                statusContainer.textContent = '';
                statusContainer.append('最多可支持 ');
                const span = document.createElement('span');
                span.className = 'highlight-green';
                span.textContent = neteaseTierCap;
                statusContainer.appendChild(span);
                statusContainer.append(' 名玩家');
            }
            return;
        }

        if (statusText) statusText.textContent = '加载中...';
        fetch('server_status.php')
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(res) {
                if (res && res.success && res.data) {
                    const count = res.data.p;
                    if (statusText) statusText.textContent = count;
                } else {
                    if (statusText) statusText.textContent = '离线';
                    if (statusDot) statusDot.style.backgroundColor = '#ef4444';
                }
            })
            .catch(function() {
                if (statusText) statusText.textContent = '离线';
                if (statusDot) { statusDot.style.backgroundColor = '#ef4444'; statusDot.style.boxShadow = '0 0 10px #ef4444'; }
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
            fetchServerStatus();
        })
        .catch(() => {});

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
