// ==UserScript==
// @name         Bilibili 图文原图下载
// @name:zh-CN   Bilibili 图文原图下载
// @namespace    https://github.com/owendswang/bili-opus-downloader
// @version      0.1.0
// @description  在 B 站网页端批量下载「图文/opus」原图，按 {用户名} {日期} ({序号}) 命名。
// @description:zh-CN  在 B 站网页端批量下载「图文/opus」原图，按 {用户名} {日期} ({序号}) 命名。
// @author       local
// @license      MIT
// @match        https://space.bilibili.com/*
// @match        https://t.bilibili.com/*
// @match        https://www.bilibili.com/opus/*
// @connect      api.bilibili.com
// @connect      hdslb.com
// @connect      biliimg.com
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    if (window.__BOD_LOADED__) return;
    window.__BOD_LOADED__ = true;

    /* =========================================================================
     * 0. 常量
     * ====================================================================== */
    const SCRIPT_VERSION = '0.1.0';

    const LIST_API = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space';
    const DETAIL_API = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/detail';
    const NAV_API = 'https://api.bilibili.com/x/web-interface/nav';
    const SPI_API = 'https://api.bilibili.com/x/frontend/finger/spi';

    const MIXIN_KEY_ENC_TAB = [
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
        27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
        37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
        22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
    ];

    const KNOWN_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif']);
    const BLOCK_CODES = new Set([-352, -412, -509, -799, -10403]);
    const TZ_OFFSET_SEC = 8 * 3600;

    // —— 保守限速（与 crawl.py 的 --delay 0.3 相比更慢，避免风控）——
    const GAP_API = 700;        // 两次 API 请求最小间隔 ms（另有随机抖动）
    const JITTER_API = 350;
    const GAP_IMG = 400;        // 两次图片下载最小间隔 ms
    const CONCURRENCY_IMG = 2;  // 图片并发上限
    const MAX_RISK_STREAK = 3;  // 连续风控多少次后中止

    const ROOT_DIR = 'bilibili'; // 相对浏览器下载目录

    /* =========================================================================
     * 1. 通用工具
     * ====================================================================== */
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function fmtDate(ts) {
        // 固定按北京时间换算，不受本机时区影响，与 crawl.py 一致
        return new Date((ts + TZ_OFFSET_SEC) * 1000).toISOString().slice(0, 10).replace(/-/g, '.');
    }

    function sanitizeName(s) {
        return String(s || '')
            .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
            .replace(/^\.+$/, '_')
            .trim()
            .slice(0, 60) || 'unknown';
    }

    function normalizeImageUrl(url) {
        if (!url) return '';
        let u = String(url).trim();
        if (u.startsWith('//')) u = 'https:' + u;
        else if (u.startsWith('http://')) u = 'https://' + u.slice(7);
        u = u.split('?')[0];
        if (u.includes('@')) u = u.split('@')[0];
        return u;
    }

    function extFromUrl(url) {
        const m = /\.([A-Za-z0-9]+)$/.exec(url.split('?')[0]);
        const ext = m ? m[1].toLowerCase() : '';
        if (!KNOWN_EXT.has(ext)) return 'jpg';
        return ext === 'jpeg' ? 'jpg' : ext;
    }

    /* ---------- MD5（WBI 签名需要，浏览器没有内置 MD5） ---------- */
    const MD5_S = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    const MD5_K = new Uint32Array(64).map((_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));

    function md5Hex(input) {
        const bytes = new TextEncoder().encode(input);
        const len = bytes.length;
        const totalLen = Math.ceil((len + 9) / 64) * 64;
        const buf = new Uint8Array(totalLen);
        buf.set(bytes);
        buf[len] = 0x80;
        const dv = new DataView(buf.buffer);
        const bitLen = len * 8;
        dv.setUint32(totalLen - 8, bitLen >>> 0, true);
        dv.setUint32(totalLen - 4, Math.floor(bitLen / 4294967296), true);

        let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
        const M = new Uint32Array(16);

        for (let off = 0; off < totalLen; off += 64) {
            for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
            let A = a0, B = b0, C = c0, D = d0;
            for (let i = 0; i < 64; i++) {
                let F, g;
                if (i < 16) { F = (B & C) | (~B & D); g = i; }
                else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
                else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
                else { F = C ^ (B | ~D); g = (7 * i) % 16; }
                const tmp = D;
                D = C;
                C = B;
                const sum = (A + F + MD5_K[i] + M[g]) >>> 0;
                B = (B + ((sum << MD5_S[i]) | (sum >>> (32 - MD5_S[i])))) >>> 0;
                A = tmp;
            }
            a0 = (a0 + A) >>> 0;
            b0 = (b0 + B) >>> 0;
            c0 = (c0 + C) >>> 0;
            d0 = (d0 + D) >>> 0;
        }

        const out = new Uint8Array(16);
        const odv = new DataView(out.buffer);
        odv.setUint32(0, a0, true);
        odv.setUint32(4, b0, true);
        odv.setUint32(8, c0, true);
        odv.setUint32(12, d0, true);
        return Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('');
    }

    /* =========================================================================
     * 2. 会话：buvid + WBI 签名
     * ====================================================================== */
    const cookieJar = {
        get(name) {
            const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
            return m ? decodeURIComponent(m[1]) : '';
        },
    };

    const session = {
        buvidReady: false,
        mixinKey: '',
        mixinDate: '',

        /** 页面本身已有 buvid3/4；没有就匿名领一个。全程不需要 SESSDATA。 */
        async ensureBuvid() {
            if (this.buvidReady) return;
            if (cookieJar.get('buvid3')) { this.buvidReady = true; return; }
            try {
                const r = await gmGet(SPI_API, { headers: { Referer: 'https://www.bilibili.com/' } });
                const d = (JSON.parse(r.responseText) || {}).data || {};
                if (d.b_3 && d.b_4) {
                    document.cookie = `buvid3=${d.b_3}; domain=.bilibili.com; path=/`;
                    document.cookie = `buvid4=${d.b_4}; domain=.bilibili.com; path=/`;
                }
            } catch (e) { /* 拿不到也能继续，只是更易触发风控 */ }
            this.buvidReady = true;
        },

        async ensureMixinKey(force = false) {
            const today = fmtDate(Math.floor(Date.now() / 1000));
            if (!force && this.mixinKey && this.mixinDate === today) return this.mixinKey;

            const cached = GM_getValue('wbi', null);
            if (!force && cached && cached.date === today && cached.key) {
                this.mixinKey = cached.key;
                this.mixinDate = today;
                return this.mixinKey;
            }

            // nav 未登录会返回 -101，但 wbi_img 仍在
            const r = await gmGet(NAV_API, { headers: { Referer: 'https://www.bilibili.com/' } });
            const wbi = ((JSON.parse(r.responseText) || {}).data || {}).wbi_img || {};
            const pick = (u) => String(u || '').split('/').pop().split('.')[0];
            const raw = pick(wbi.img_url) + pick(wbi.sub_url);
            if (raw.length < 64) throw new Error('WBI 密钥获取失败');

            const key = MIXIN_KEY_ENC_TAB.map((i) => raw[i]).join('').slice(0, 32);
            this.mixinKey = key;
            this.mixinDate = today;
            GM_setValue('wbi', { date: today, key });
            return key;
        },

        sign(params) {
            const p = {};
            for (const [k, v] of Object.entries(params || {})) {
                if (v === undefined || v === null) continue;
                p[k] = String(v).replace(/[!'()*]/g, '');
            }
            p.wts = String(Math.floor(Date.now() / 1000));
            const query = Object.keys(p).sort()
                .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(p[k])}`)
                .join('&');
            p.w_rid = md5Hex(query + this.mixinKey);
            return p;
        },
    };

    /* =========================================================================
     * 3. 网络层：串行限速 + 风控退避
     * ====================================================================== */
    let nextSlot = 0;
    async function throttle(gap, jitter) {
        const now = Date.now();
        const due = Math.max(now, nextSlot);
        nextSlot = due + gap + Math.random() * jitter;
        if (due > now) await sleep(due - now);
    }

    function gmGet(url, opts = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: opts.headers || {},
                timeout: opts.timeout || 30000,
                onload: resolve,
                onerror: () => reject(new Error('网络错误')),
                ontimeout: () => reject(new Error('请求超时')),
                onabort: () => reject(new Error('请求被中断')),
            });
        });
    }

    function buildQuery(params) {
        return Object.keys(params)
            .sort()
            .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
            .join('&');
    }

    const risk = { streak: 0 };

    /**
     * 带签名 / 限速 / 风控退避的 JSON 请求。
     * @returns {Promise<any>} 接口的 data 字段
     */
    async function apiGet(url, params, { signed = false, referer = location.href } = {}) {
        await session.ensureBuvid();

        for (let attempt = 1; attempt <= 4; attempt++) {
            await throttle(GAP_API, JITTER_API);
            let p = { ...params };
            if (signed) {
                await session.ensureMixinKey(attempt > 1);
                p = session.sign(p);
            }
            const full = `${url}?${buildQuery(p)}`;

            let body;
            try {
                const r = await gmGet(full, {
                    headers: { Referer: referer, Accept: 'application/json, text/plain, */*' },
                });
                body = JSON.parse(r.responseText || '{}');
            } catch (e) {
                if (attempt === 4) throw e;
                await sleep(1500 * attempt);
                continue;
            }

            const code = Number(body.code);
            if (code === 0) { risk.streak = 0; return body.data; }

            if (BLOCK_CODES.has(code)) {
                risk.streak += 1;
                ui.log(`风控 ${code}（第 ${risk.streak} 次），冷却 ${20 * attempt}s`);
                if (risk.streak >= MAX_RISK_STREAK) throw new Error(`连续 ${MAX_RISK_STREAK} 次风控，已中止`);
                await sleep(20000 * attempt);
                session.buvidReady = false;
                continue;
            }

            // -400 之类的参数错，重试无意义
            throw new Error(`接口返回 ${code} ${body.message || ''}`.trim());
        }
        throw new Error('重试次数用尽');
    }

    /* =========================================================================
     * 4. 业务 API
     * ====================================================================== */
    async function fetchOpusList(uid, onPage) {
        const items = [];
        const seen = new Set();
        let page = 1;
        let offset = '';
        const referer = `https://space.bilibili.com/${uid}/upload/opus`;

        for (;;) {
            const data = await apiGet(
                LIST_API,
                { host_mid: uid, page, offset, web_location: '333.1387' },
                { referer }
            );
            const batch = (data && data.items) || [];
            let added = 0;
            for (const it of batch) {
                const id = String(it.opus_id || '');
                if (id && !seen.has(id)) { seen.add(id); items.push({ opus_id: id }); added++; }
            }
            onPage && onPage({ page, total: items.length, added });
            if (!data || !data.has_more || !batch.length) break;
            offset = data.offset || '';
            if (!offset) break;
            page += 1;
        }
        return items;
    }

    const detailCache = new Map();

    async function fetchDetail(uid, opusId) {
        if (detailCache.has(opusId)) return detailCache.get(opusId);
        const data = await apiGet(
            DETAIL_API,
            { id: opusId, timezone_offset: -480 },
            { signed: true, referer: `https://space.bilibili.com/${uid}/upload/opus` }
        );
        detailCache.set(opusId, data);
        return data;
    }

    /** 从 opus/detail 响应提取发布时间、作者、全部原图（逻辑对齐 crawl.py parse_post） */
    function parseDetail(data, opusId) {
        const item = data && data.data && data.data.item;
        if (!item) return null;

        let author = null, content = null, dynamic = null;
        for (const m of item.modules || []) {
            if (!author && m.module_author) author = m.module_author;
            if (!content && m.module_content) content = m.module_content;
            if (!dynamic && m.module_dynamic) dynamic = m.module_dynamic;
        }

        const pubTs = Number((author && author.pub_ts) || 0);
        if (!pubTs) return null;

        const raw = [];
        for (const para of (content && content.paragraphs) || []) {
            const pics = (para && para.pic && para.pic.pics) || [];
            raw.push(...pics);
            if (para && para.line && para.line.pic) raw.push(para.line.pic);
        }
        const major = (dynamic && dynamic.major) || {};
        for (const key of ['opus', 'draw']) {
            const block = major[key] || {};
            raw.push(...(block.pics || block.items || []));
        }

        const pics = [];
        const seen = new Set();
        for (const p of raw) {
            const url = normalizeImageUrl(p && (p.url || p.src));
            if (!url || seen.has(url)) continue;
            seen.add(url);
            pics.push({ url, width: p.width, height: p.height });
        }

        return {
            opusId,
            pubTs,
            date: fmtDate(pubTs),
            username: sanitizeName((author && author.name) || 'unknown'),
            pics,
        };
    }

    /* =========================================================================
     * 5. 清单与命名
     *    存储结构：
    *      manifest[uid] = {
    *        files: { "<date>|<url>": "<文件名>" },
    *        days:  { "<date>": <已用最大序号> },
    *        done:  { "<date>|<url>": 1 }   // 已确认下载成功的条目
    *      }
     *    按「日期 + URL」复用名字：同一图同一天只存一份，
     *    换到别的日期再发布则重新占一个序号（与 crawl.py 一致）。
     * ====================================================================== */
    const store = {
        key(uid) { return `manifest:${uid}`; },
        load(uid) {
            const m = GM_getValue(this.key(uid), null);
            if (!m || typeof m !== 'object') return { files: {}, days: {}, done: {} };
            m.files = m.files || {};
            m.days = m.days || {};
            m.done = m.done || {};
            return m;
        },
        save(uid, m) { GM_setValue(this.key(uid), m); },
    };

    /** 按发布时间正序编号，结果写入 pic.filename，并把新映射持久化 */
    function assignFilenames(posts, manifest, username) {
        const ordered = posts.slice().sort((a, b) => (a.pubTs - b.pubTs) || a.opusId.localeCompare(b.opusId));
        for (const post of ordered) {
            for (const pic of post.pics) {
                const key = `${post.date}|${pic.url}`;
                pic.key = key;
                let name = manifest.files[key];
                if (!name) {
                    const next = (manifest.days[post.date] || 0) + 1;
                    manifest.days[post.date] = next;
                    name = `${username} ${post.date} (${next}).${extFromUrl(pic.url)}`;
                    manifest.files[key] = name;
                }
                pic.filename = name;
            }
        }
        return ordered;
    }

    /* =========================================================================
     * 6. 下载
     * ====================================================================== */
    const IMG_HEADERS = {
        Referer: 'https://www.bilibili.com/',
        // 不声明 avif/webp，避免 CDN 协商成页面展示用的压缩版本
        Accept: 'image/jpeg,image/png,image/gif,image/*;q=0.9,*/*;q=0.5',
    };

    function gmDownload(url, relPath, conflictAction = 'overwrite') {
        return new Promise((resolve) => {
            if (typeof GM_download !== 'function') {
                resolve({ ok: false, err: 'GM_download 不可用' });
                return;
            }
            try {
                GM_download({
                    url,
                    name: relPath,
                    saveAs: false,
                    conflictAction,
                    headers: IMG_HEADERS,
                    onload: () => resolve({ ok: true }),
                    onerror: (e) => resolve({ ok: false, err: (e && (e.error || e.details)) || '下载失败' }),
                    ontimeout: () => resolve({ ok: false, err: '超时' }),
                });
            } catch (e) {
                resolve({ ok: false, err: String(e && e.message || e) });
            }
        });
    }

    /** 简易信号量，控制图片并发 */
    function createSemaphore(limit) {
        let active = 0;
        const queue = [];
        const next = () => {
            if (active >= limit || !queue.length) return;
            active += 1;
            const { fn, resolve, reject } = queue.shift();
            Promise.resolve()
                .then(fn)
                .then(resolve, reject)
                .finally(() => { active -= 1; next(); });
        };
        return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
    }

    const imgSlot = createSemaphore(CONCURRENCY_IMG);

    async function downloadPic(pic, username) {
        const relPath = `${ROOT_DIR}/${username}/${pic.filename}`;
        for (let attempt = 1; attempt <= 3; attempt++) {
            await throttle(GAP_IMG, 150);
            const r = await gmDownload(pic.url, relPath);
            if (r.ok) return { ok: true };
            if (attempt === 3) return { ok: false, err: r.err };
            await sleep(1200 * attempt);
        }
        return { ok: false, err: '未知' };
    }

    /* =========================================================================
     * 7. UI（后续只改这一段）
     * ====================================================================== */
    const ui = {
        root: null,
        els: {},
        logLines: [],

        log(msg) {
            const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${msg}`;
            this.logLines.push(line);
            if (this.logLines.length > 200) this.logLines.shift();
            const box = this.els.log;
            if (box) {
                box.textContent = this.logLines.slice(-8).join('\n');
                box.scrollTop = box.scrollHeight;
            }
        },

        progress(done, total, ok, fail) {
            if (!this.els.bar) return;
            const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
            this.els.bar.style.width = pct + '%';
            this.els.stat.textContent = `${done}/${total} · 成功 ${ok} · 失败 ${fail}`;
        },

        mount() {
            if (document.getElementById('bod-panel')) { this.root = document.getElementById('bod-panel'); return; }
            const wrap = document.createElement('div');
            wrap.id = 'bod-panel';
            wrap.innerHTML = `
<div id="bod-fab" title="Bilibili 图文原图下载">图文<br>下载</div>
<div id="bod-body" hidden>
  <div class="bod-row"><label>UID</label><input id="bod-uid" type="text" inputmode="numeric" placeholder="用户 UID"></div>
  <div class="bod-row"><label>起始日期</label><input id="bod-since" type="date" value="2021-08-01"></div>
  <div class="bod-row"><label>最多篇数</label><input id="bod-limit" type="number" min="1" placeholder="不限"></div>
  <div class="bod-row bod-inline">
    <label><input id="bod-dry" type="checkbox"> 只统计不下载</label>
    <label><input id="bod-skip" type="checkbox" checked> 跳过已下</label>
  </div>
  <div class="bod-row bod-actions">
    <button id="bod-start">开始</button>
    <button id="bod-stop" disabled>停止</button>
  </div>
  <div id="bod-progress"><div id="bod-bar"></div></div>
  <div id="bod-stat">就绪</div>
  <pre id="bod-log"></pre>
</div>`;
            document.body.appendChild(wrap);

            const style = document.createElement('style');
            style.textContent = `
#bod-panel{position:fixed;right:16px;bottom:16px;z-index:2147483000;font:12px/1.6 -apple-system,"Segoe UI",sans-serif;color:#18191c}
#bod-panel *{box-sizing:border-box}
#bod-fab{width:56px;height:56px;border-radius:50%;background:#00aeec;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.18);user-select:none}
#bod-fab:hover{background:#00a1d6}
#bod-body{position:absolute;right:0;bottom:68px;width:264px;background:#fff;border:1px solid #e3e5e7;border-radius:10px;padding:10px;box-shadow:0 6px 24px rgba(0,0,0,.14)}
.bod-row{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.bod-row label{flex:0 0 56px;color:#61666d}
.bod-row input[type=text],.bod-row input[type=date],.bod-row input[type=number]{flex:1;min-width:0;height:26px;border:1px solid #e3e5e7;border-radius:6px;padding:0 6px;font-size:12px;color:#18191c;background:#fff}
.bod-inline{gap:10px;justify-content:space-between}
.bod-inline label{flex:1;display:flex;align-items:center;gap:4px;color:#61666d}
.bod-actions{gap:6px}
.bod-actions button{flex:1;height:28px;border:1px solid #e3e5e7;border-radius:6px;background:#f6f7f8;color:#18191c;cursor:pointer;font-size:12px}
.bod-actions button#bod-start{background:#00aeec;border-color:#00aeec;color:#fff}
.bod-actions button:disabled{opacity:.5;cursor:not-allowed}
#bod-progress{height:6px;background:#f1f2f3;border-radius:3px;overflow:hidden;margin:8px 0 4px}
#bod-bar{height:100%;width:0;background:#00aeec;transition:width .25s}
#bod-stat{color:#61666d;font-size:11px}
#bod-log{margin:6px 0 0;max-height:96px;overflow:auto;background:#f6f7f8;border-radius:6px;padding:6px;font-size:11px;line-height:1.5;color:#61666d;white-space:pre-wrap;word-break:break-all}
.bod-pic-btn{position:absolute;top:6px;right:6px;z-index:20;width:24px;height:24px;border:none;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;font-size:13px;line-height:24px;padding:0;text-align:center}
.bod-pic-btn:hover{background:#00aeec}
#bod-single{position:fixed;right:16px;bottom:84px;z-index:2147483000;height:34px;padding:0 14px;border:none;border-radius:17px;background:#00aeec;color:#fff;font-size:13px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.18)}
#bod-single:hover{background:#00a1d6}
#bod-single:disabled{opacity:.6;cursor:default}
`;
            document.head.appendChild(style);

            this.root = wrap;
            this.els = {
                fab: wrap.querySelector('#bod-fab'),
                body: wrap.querySelector('#bod-body'),
                uid: wrap.querySelector('#bod-uid'),
                since: wrap.querySelector('#bod-since'),
                limit: wrap.querySelector('#bod-limit'),
                dry: wrap.querySelector('#bod-dry'),
                skip: wrap.querySelector('#bod-skip'),
                start: wrap.querySelector('#bod-start'),
                stop: wrap.querySelector('#bod-stop'),
                bar: wrap.querySelector('#bod-bar'),
                stat: wrap.querySelector('#bod-stat'),
                log: wrap.querySelector('#bod-log'),
            };

            this.els.fab.addEventListener('click', () => { this.els.body.hidden = !this.els.body.hidden; });
            this.els.start.addEventListener('click', () => runBatch());
            this.els.stop.addEventListener('click', () => { runner.stop = true; this.log('收到停止指令…'); });
        },
    };

    /* =========================================================================
     * 8. 批量任务
     * ====================================================================== */
    const runner = { running: false, stop: false };

    function currentUid() {
        const m = location.pathname.match(/^\/(\d+)\//);
        if (m) return m[1];
        if (location.host === 't.bilibili.com') {
            const typed = ui.els.uid && ui.els.uid.value.trim();
            return /^\d+$/.test(typed) ? typed : '';
        }
        return '';
    }

    async function runBatch() {
        if (runner.running) return;

        const uid = (ui.els.uid.value.trim() || currentUid() || '').trim();
        if (!/^\d+$/.test(uid)) { alert('请先填写正确的 UID'); return; }

        const sinceText = ui.els.since.value || '2021-08-01';
        const sinceTs = Math.floor(new Date(sinceText + 'T00:00:00+08:00').getTime() / 1000);
        const limit = Number(ui.els.limit.value) || 0;
        const dryRun = ui.els.dry.checked;

        runner.running = true;
        runner.stop = false;
        risk.streak = 0;
        ui.els.start.disabled = true;
        ui.els.stop.disabled = false;
        ui.log(`开始：UID ${uid}，起始 ${sinceText}${limit ? `，上限 ${limit} 篇` : ''}${dryRun ? '（试运行）' : ''}`);

        let okCount = 0;
        let failCount = 0;

        try {
            /* --- 8.1 列表 --- */
            const items = await fetchOpusList(uid, ({ total }) => {
                ui.progress(0, total, okCount, failCount);
                ui.els.stat.textContent = `列表 ${total} 篇`;
            });
            ui.log(`列表共 ${items.length} 篇`);

            /* --- 8.2 详情（串行，逐篇判断是否已越界） --- */
            const posts = [];
            let oldStreak = 0;
            for (let i = 0; i < items.length; i++) {
                if (runner.stop) break;
                const { opus_id: opusId } = items[i];
                let post = null;
                try {
                    const data = await fetchDetail(uid, opusId);
                    post = parseDetail(data, opusId);
                } catch (e) {
                    failCount += 1;
                    ui.log(`详情失败 ${opusId}：${e.message}`);
                }
                if (post) {
                    if (post.pubTs < sinceTs) {
                        oldStreak += 1;
                        if (oldStreak >= 3) { ui.log('连续 3 篇早于起始日期，停止翻页'); break; }
                    } else {
                        oldStreak = 0;
                        if (post.pics.length) posts.push(post);
                    }
                }
                ui.progress(i + 1, items.length, okCount, failCount);
                ui.els.stat.textContent = `读取详情 ${i + 1}/${items.length} · 已收 ${posts.length} 篇`;
                if (limit && posts.length >= limit) { ui.log(`达到上限 ${limit} 篇`); break; }
            }

            if (!posts.length) { ui.log('没有需要下载的图文'); return; }

            /* --- 8.3 命名 --- */
            const username = posts[0].username;
            const manifest = store.load(uid);
            const ordered = assignFilenames(posts, manifest, username);
            const totalPics = ordered.reduce((n, p) => n + p.pics.length, 0);
            ui.log(`共 ${ordered.length} 篇 / ${totalPics} 张图，作者名「${username}」`);

            if (dryRun) {
                for (const p of ordered) ui.log(`${p.date}  ${p.opusId}  ${p.pics.map((x) => x.filename).join(', ')}`);
                ui.log('试运行结束，未下载');
                return;
            }

            /* --- 8.4 下载 --- */
            store.save(uid, manifest);
            const skipDone = ui.els.skip.checked;
            let done = 0;
            const jobs = [];
            let skipped = 0;
            for (const p of ordered) {
                for (const pic of p.pics) {
                    if (skipDone && manifest.done[pic.key]) { skipped += 1; continue; }
                    jobs.push({ pic, username });
                }
            }
            if (skipped) ui.log(`跳过已下载 ${skipped} 张`);
            if (!jobs.length) { ui.log('没有需要补下的图片'); return; }

            const tasks = jobs.map(({ pic, username: un }) => imgSlot(async () => {
                if (runner.stop) return;
                const r = await downloadPic(pic, un);
                done += 1;
                if (r.ok) {
                    okCount += 1;
                    manifest.done[pic.key] = 1;
                } else {
                    failCount += 1;
                    ui.log(`失败 ${pic.filename}：${r.err}`);
                }
                ui.progress(done, jobs.length, okCount, failCount);
            }));

            await Promise.all(tasks);
            store.save(uid, manifest);
            ui.log(runner.stop ? '已停止（可重跑续传）' : `完成：成功 ${okCount}，失败 ${failCount}`);
        } catch (e) {
            ui.log(`中止：${e.message}`);
        } finally {
            runner.running = false;
            ui.els.start.disabled = false;
            ui.els.stop.disabled = true;
        }
    }

    /* =========================================================================
     * 9. 单篇：图片角标 + 悬浮按钮
     * ====================================================================== */
    const IMG_SCOPE_SELECTOR = [
        '.opus-module-content',
        '.opus-module-top__album',
        '.bili-album__preview',
        '.bili-dyn-content',
        '.bili-dyn-card-opus',
        '.bili-dyn-item',
    ].map((s) => `${s} img`).join(',');

    function pageOpusId() {
        const m = location.pathname.match(/^\/opus\/(\d+)/);
        if (m) return m[1];
        if (location.host === 't.bilibili.com') {
            const m2 = location.pathname.match(/^\/(\d+)/);
            if (m2) return m2[1];
        }
        return '';
    }

    let singleBusy = false;

    async function downloadSingleImage(imgUrl) {
        const opusId = pageOpusId();
        if (!opusId) return;
        const url = normalizeImageUrl(imgUrl);
        const uid = currentUid() || '0';

        try {
            const data = await fetchDetail(uid, opusId);
            const post = parseDetail(data, opusId);
            if (!post) { ui.log('本篇解析失败'); return; }
            const pic = post.pics.find((p) => p.url === url) || post.pics[0];
            if (!pic) { ui.log('本篇没有图片'); return; }

            const manifest = store.load(uid);
            assignFilenames([{ ...post, pics: [pic] }], manifest, post.username);
            store.save(uid, manifest);

            ui.log(`下载 ${pic.filename}`);
            const r = await downloadPic(pic, post.username);
            if (r.ok) { manifest.done[pic.key] = 1; store.save(uid, manifest); }
            ui.log(r.ok ? `完成 ${pic.filename}` : `失败：${r.err}`);
        } catch (e) {
            ui.log(`下载失败：${e.message}`);
        }
    }

    async function downloadWholePage(btn) {
        if (singleBusy) return;
        const opusId = pageOpusId();
        if (!opusId) return;
        singleBusy = true;
        const old = btn.textContent;
        btn.textContent = '下载中…';
        btn.disabled = true;
        try {
            const uid = currentUid() || '0';
            const data = await fetchDetail(uid, opusId);
            const post = parseDetail(data, opusId);
            if (!post) { ui.log('本篇解析失败'); return; }

            const manifest = store.load(uid);
            assignFilenames([post], manifest, post.username);
            store.save(uid, manifest);

            let ok = 0, fail = 0;
            for (const pic of post.pics) {
                const r = await downloadPic(pic, post.username);
                if (r.ok) { ok += 1; manifest.done[pic.key] = 1; }
                else { fail += 1; ui.log(`失败 ${pic.filename}：${r.err}`); }
            }
            store.save(uid, manifest);
            ui.log(`本篇 ${post.pics.length} 张：成功 ${ok}，失败 ${fail}`);
        } catch (e) {
            ui.log(`本篇下载失败：${e.message}`);
        } finally {
            singleBusy = false;
            btn.textContent = old;
            btn.disabled = false;
        }
    }

    function decorateImages(root = document) {
        let imgs;
        try { imgs = root.querySelectorAll(IMG_SCOPE_SELECTOR); } catch (e) { return; }
        for (const img of imgs) {
            if (img.dataset.bodDone) continue;
            if (!/hdslb\.com|biliimg\.com/.test(img.src || '')) continue;
            if (img.naturalWidth && img.naturalWidth < 150) continue;
            img.dataset.bodDone = '1';

            let host = img.parentElement;
            if (!host) continue;
            if (host.tagName === 'A' && host.parentElement) host = host.parentElement;
            const cs = getComputedStyle(host);
            if (cs.position === 'static') host.style.position = 'relative';

            const btn = document.createElement('button');
            btn.className = 'bod-pic-btn';
            btn.type = 'button';
            btn.title = '下载这张原图';
            btn.textContent = '↓';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                downloadSingleImage(img.src);
            }, true);
            host.appendChild(btn);
        }
    }

    function mountSingleButton() {
        if (document.getElementById('bod-single')) return;
        const btn = document.createElement('button');
        btn.id = 'bod-single';
        btn.type = 'button';
        btn.textContent = '下载本篇原图';
        btn.addEventListener('click', () => downloadWholePage(btn));
        document.body.appendChild(btn);
    }

    /* =========================================================================
     * 10. 路由
     * ====================================================================== */
    function isBatchPage() {
        const host = location.host;
        if (host === 'space.bilibili.com' && /^\/\d+\/(upload\/opus|dynamic)/.test(location.pathname)) return true;
        if (host === 't.bilibili.com' && (location.pathname === '/' || location.pathname === '/index.html')) return true;
        return false;
    }

    let observer = null;

    function route() {
        const batch = isBatchPage();
        const single = !!pageOpusId();

        if (ui.root) ui.root.style.display = batch ? '' : 'none';
        if (batch && !ui.root) { ui.mount(); ui.root.style.display = ''; }

        const sb = document.getElementById('bod-single');
        if (single) { mountSingleButton(); decorateImages(); }
        else if (sb) sb.remove();

        if (batch) {
            const uid = currentUid();
            if (uid && ui.els.uid && !ui.els.uid.value) ui.els.uid.value = uid;
        }

        if (single || batch) {
            if (!observer) {
                let timer = 0;
                observer = new MutationObserver(() => {
                    if (!single) return;
                    clearTimeout(timer);
                    timer = setTimeout(() => decorateImages(), 300);
                });
                observer.observe(document.body, { childList: true, subtree: true });
            }
        } else if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    const _push = history.pushState;
    const _replace = history.replaceState;
    history.pushState = function () { _push.apply(this, arguments); setTimeout(route, 60); };
    history.replaceState = function () { _replace.apply(this, arguments); setTimeout(route, 60); };
    window.addEventListener('popstate', () => setTimeout(route, 60));

    /* =========================================================================
     * 11. 启动
     * ====================================================================== */
    GM_registerMenuCommand('清空当前 UID 的下载清单', () => {
        const uid = currentUid();
        if (!uid) { alert('当前页面没有 UID'); return; }
        if (!confirm(`确定清空 UID ${uid} 的命名清单？清空后重新编号，可能覆盖已有文件。`)) return;
        GM_deleteValue(store.key(uid));
        alert('已清空');
    });

    GM_registerMenuCommand(`关于（v${SCRIPT_VERSION}）`, () => {
        alert(
            `Bilibili 图文原图下载 v${SCRIPT_VERSION}\n\n` +
            `命名：{用户名} {YYYY}.{MM}.{DD} ({序号}).{扩展名}\n` +
            `路径：下载目录/${ROOT_DIR}/{用户名}/\n\n` +
            `免登录运行（只用匿名 buvid 与 WBI 签名）。\n` +
            `请求间隔 ${GAP_API}ms、图片并发 ${CONCURRENCY_IMG}，触发风控会自动冷却。`
        );
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', route, { once: true });
    } else {
        route();
    }
})();
