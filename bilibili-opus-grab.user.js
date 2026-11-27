// ==UserScript==
// @name         BilibiliOpusGrab
// @name:zh-CN   bilibili图文抓取
// @namespace    bilibili-opus-grab
// @version      1.0.1
// @description  Batch-download original images from bilibili dynamics, space opus list and single opus pages.
// @description:zh-CN 批量下载 B 站动态、空间图文列表与单篇 opus 的原图，支持日期区间与自定义命名。
// @author       WangLu
// @homepageURL  https://github.com/LagomT24/BilibiliOpusGrab
// @supportURL   https://github.com/LagomT24/BilibiliOpusGrab/issues
// @original-script  https://greasyfork.org/scripts/421885 (c) owendswang, MIT
// @license      MIT
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23FB7299'/%3E%3Ccircle cx='22' cy='21' r='5' fill='%23fff'/%3E%3Cpath d='M13 45l13-15 8 9 6-6 11 12z' fill='%23fff'/%3E%3C/svg%3E
// @match        https://t.bilibili.com/*
// @match        https://space.bilibili.com/*/dynamic*
// @match        https://space.bilibili.com/*/upload/opus*
// @match        https://www.bilibili.com/opus/*
// @match        https://www.bilibili.com/v/topic/detail?*
// @connect      bilibili.com
// @connect      hdslb.com
// @connect      biliimg.com
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(async function() {
    'use strict';

    // Your code here...
    const settingVersion = 6;
    const downloadIcon = 'url(\'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEgAACxIB0t1+/AAAABx0RVh0U29mdHdhcmUAQWRvYmUgRmlyZXdvcmtzIENTNui8sowAAAHpSURBVDiNndS7a1RREMfxz9XVrI8UIkjwLxCipYVp9A+wEQsV8dFksLCwUATxAYqNIAhWO4UPsAqCCGqTQkRQULEMgojYCSK+X4nhWty7uCZ3k5gfnObMOd8zM2dmirIs9SozV+IxNmCJZk3jObZGxFSvodVweD024TMm+wDb2Iy1eDsfcCkKHMSdPsB9uFKf/UdNwK4mI+J3kyEzp5r26Z8jTa8v5N5cwEWpCdgYZh/NOtuCzGyrQiwx+B/Awcz8ovrE6Yj42crMcYyoSqRdr/nULd6X+IFfWJaZYy1cwhA24j5u1t4+mAN4D0cwhb21Q89wtSjLUmauxm1sw56IGFtIvJm5H9dxFzsj4lfR23qZeQ0HcDEijs4Du4zD6ETEoe5+0el0zuNnURTnRkdHZeYpnMUt7JrZq5k5oErLdhyPiAuZuQyn8XEJTuBMWZbLISLOqVprB55k5roe2BCe1rDdEXGhNq3CSRxrqX73U68XEXEjM99gHBOZuUVVs4+wAiMR8bjnSolv+NC3UyLiIYZVU+cFJvARwzNg/6gLLDVUfUS8UpXTw3ptjIjXDZzpmlF2p02BdmbOmn8R8V1VTiAzmybUQM0oik6n81WVl/f9wvC3M4o+9kI1bD+08A5r6rVYlapcf/0DW06ifC1dVCUAAAAASUVORK5CYII=\')';

    let notLoaded = true;
    let cardsTotal = 0;
    let skeletonsTotal = 0;

    /* =====================================================================
     * 1.0.0 UI 层
     * 视觉规范见 preview/ui-1.0.0.html：强调色只有 B 站粉 #FB7299，
     * 其余走中性灰阶；所有变量收敛在 #bog-dock / #bog-queue / #bog-layer 三处，
     * 不向宿主页面 :root 写入任何东西。
     * ================================================================== */

    const SCRIPT_VERSION = '1.0.0';

    const BOG_ICON_DOWNLOAD = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v7.5m0 0L5 7m3 3l3-3"/><path d="M2.5 12.5h11"/></svg>';
    const BOG_ICON_SETTINGS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/><circle cx="6" cy="4.5" r="1.7" style="fill:var(--bog-surface)"/><circle cx="10.5" cy="8" r="1.7" style="fill:var(--bog-surface)"/><circle cx="5.2" cy="11.5" r="1.7" style="fill:var(--bog-surface)"/></svg>';

    const BOG_CSS = `
#bog-dock,#bog-queue,#bog-layer{
  --bog-pink:#FB7299;--bog-pink-hover:#F25D8E;--bog-pink-soft:#FFECF1;
  --bog-ink:#18191C;--bog-ink-2:#61666D;--bog-ink-3:#9499A0;
  --bog-line:rgba(24,25,28,.09);--bog-line-2:rgba(24,25,28,.16);
  --bog-surface:#fff;--bog-surface-2:#F6F7F8;
  --bog-danger:#E14C4C;--bog-danger-soft:#FFECEC;
  --bog-shadow-1:0 2px 10px rgba(0,0,0,.06);
  --bog-shadow-2:0 8px 28px rgba(0,0,0,.12);
  --bog-shadow-3:0 18px 48px rgba(0,0,0,.2);
  font-family:"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei",system-ui,-apple-system,sans-serif;
  -webkit-font-smoothing:antialiased;
}
html[data-theme="dark"] #bog-dock,html[data-theme="dark"] #bog-queue,html[data-theme="dark"] #bog-layer,
body.dark #bog-dock,body.dark #bog-queue,body.dark #bog-layer{
  --bog-pink-soft:rgba(251,114,153,.16);
  --bog-ink:#E3E5E7;--bog-ink-2:#A9ADB3;--bog-ink-3:#75797F;
  --bog-line:rgba(255,255,255,.1);--bog-line-2:rgba(255,255,255,.18);
  --bog-surface:#232429;--bog-surface-2:#2B2C31;
  --bog-danger:#FF7A7A;--bog-danger-soft:rgba(255,122,122,.14);
  --bog-shadow-1:0 2px 10px rgba(0,0,0,.4);
  --bog-shadow-2:0 8px 28px rgba(0,0,0,.5);
  --bog-shadow-3:0 18px 48px rgba(0,0,0,.6);
}
#bog-dock{position:fixed;top:76px;right:16px;z-index:9998;display:flex;align-items:center;gap:4px;padding:4px;background:var(--bog-surface);border:1px solid var(--bog-line);border-radius:14px;box-shadow:var(--bog-shadow-2);}
.bog-dock-btn{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px;border:0;border-radius:10px;background:transparent;color:var(--bog-ink-2);font-family:inherit;font-size:12px;line-height:1;white-space:nowrap;cursor:pointer;transition:background .15s,color .15s;}
.bog-dock-btn svg{width:14px;height:14px;flex:none;}
.bog-dock-btn:hover{background:var(--bog-pink-soft);color:var(--bog-pink-hover);}
.bog-dock-btn:active{transform:translateY(.5px);}
.bog-dock-btn:disabled{cursor:default;opacity:.6;}
.bog-dock-btn.is-primary{background:var(--bog-pink);color:#fff;font-weight:500;box-shadow:0 2px 8px rgba(251,114,153,.32);}
.bog-dock-btn.is-primary:hover{background:var(--bog-pink-hover);color:#fff;}
.bog-dock-btn.is-primary svg{stroke:#fff;}
#bog-queue{position:fixed;top:126px;right:16px;z-index:9997;width:300px;max-height:calc(100vh - 142px);display:flex;flex-direction:column;gap:6px;overflow-y:auto;overflow-x:hidden;padding-right:2px;}
#bog-queue::-webkit-scrollbar{width:5px;}
#bog-queue::-webkit-scrollbar-thumb{background:var(--bog-line-2);border-radius:3px;}
@media (max-width:560px){#bog-dock{right:12px;}#bog-queue{left:12px;right:12px;width:auto;}}
.bog-queue-title{position:sticky;top:0;z-index:3;flex:none;display:none;align-items:center;justify-content:space-between;gap:8px;padding:5px 9px;font-size:11px;color:var(--bog-ink-3);letter-spacing:.04em;background:var(--bog-surface);border:1px solid var(--bog-line);border-radius:9px;box-shadow:var(--bog-shadow-1);}
.bog-queue-ctrls{display:inline-flex;align-items:center;gap:10px;}
.bog-queue-ctrl{border:0;background:transparent;padding:0;font-family:inherit;font-size:11px;line-height:1;color:var(--bog-ink-3);cursor:pointer;transition:color .15s;}
.bog-queue-ctrl:hover{color:var(--bog-pink-hover);}
.bog-queue-ctrl.is-danger:hover{color:var(--bog-danger);}
.bog-progress{position:relative;overflow:hidden;flex:none;display:flex;align-items:center;gap:6px;min-height:34px;padding:0 4px 0 11px;background:var(--bog-surface);border:1px solid var(--bog-line);border-radius:10px;box-shadow:var(--bog-shadow-1);}
.bog-progress::before{content:"";position:absolute;left:0;top:0;bottom:0;width:calc(var(--p,0)*1%);background:var(--bog-pink-soft);transition:width .25s ease-out;}
.bog-progress::after{content:"";position:absolute;left:0;bottom:0;height:2px;width:calc(var(--p,0)*1%);background:var(--bog-pink);transition:width .25s ease-out;}
.bog-progress-name{position:relative;flex:1;min-width:0;font-size:11.5px;line-height:32px;color:var(--bog-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bog-progress-pct{position:relative;flex:none;min-width:30px;text-align:right;font-size:11px;line-height:32px;color:var(--bog-ink-3);font-variant-numeric:tabular-nums;}
.bog-progress-x{position:relative;flex:none;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:6px;background:transparent;padding:0;font-family:inherit;font-size:15px;line-height:1;color:var(--bog-ink-3);cursor:pointer;transition:background .15s,color .15s;}
.bog-progress-x:hover{background:var(--bog-danger-soft);color:var(--bog-danger);}
.bog-progress.is-error{border-color:rgba(225,76,76,.35);}
.bog-progress.is-error::before,.bog-progress.is-error::after{display:none;}
.bog-progress.is-error .bog-progress-name{color:var(--bog-danger);}
.bog-progress.is-error .bog-progress-pct{display:none;}
.bog-progress-retry{position:relative;flex:none;height:20px;padding:0 7px;border:1px solid rgba(225,76,76,.32);border-radius:6px;background:transparent;font-family:inherit;font-size:11px;line-height:1;color:var(--bog-danger);cursor:pointer;transition:background .15s;}
.bog-progress-retry:hover{background:var(--bog-danger-soft);}
#bog-layer{position:fixed;inset:0;z-index:2147483000;}
.bog-mask{position:absolute;inset:0;background:rgba(16,17,20,.44);backdrop-filter:blur(3px);animation:bogMaskIn .16s ease-out;}
.bog-dialog{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:428px;max-width:calc(100vw - 32px);max-height:min(660px,calc(100vh - 48px));display:flex;flex-direction:column;background:var(--bog-surface);border-radius:16px;box-shadow:var(--bog-shadow-3);overflow:hidden;animation:bogDialogIn .2s cubic-bezier(.2,.8,.3,1);color:var(--bog-ink);}
@keyframes bogMaskIn{from{opacity:0;}}
@keyframes bogDialogIn{from{opacity:0;transform:translate(-50%,-50%) scale(.97);}}
.bog-hd{flex:none;display:flex;align-items:center;gap:8px;padding:15px 14px 15px 18px;border-bottom:1px solid var(--bog-line);}
.bog-hd-dot{width:6px;height:6px;border-radius:50%;background:var(--bog-pink);flex:none;}
.bog-hd-title{font-size:14px;font-weight:600;letter-spacing:-.01em;}
.bog-hd-ver{font-size:10px;font-weight:500;color:var(--bog-pink-hover);background:var(--bog-pink-soft);border-radius:4px;padding:2px 6px;font-variant-numeric:tabular-nums;}
.bog-hd-x{margin-left:auto;width:26px;height:26px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;background:transparent;padding:0;font-family:inherit;font-size:16px;line-height:1;color:var(--bog-ink-3);cursor:pointer;transition:background .15s,color .15s;}
.bog-hd-x:hover{background:var(--bog-surface-2);color:var(--bog-ink);}
.bog-bd{flex:1;min-height:0;overflow-y:auto;padding:0 18px 18px;}
.bog-bd::-webkit-scrollbar{width:6px;}
.bog-bd::-webkit-scrollbar-thumb{background:var(--bog-line-2);border-radius:3px;}
.bog-sec{padding-top:16px;}
.bog-sec+.bog-sec{margin-top:16px;border-top:1px solid var(--bog-line);}
.bog-sec-h{font-size:11px;color:var(--bog-ink-3);letter-spacing:.06em;margin-bottom:11px;}
.bog-field+.bog-field{margin-top:12px;}
.bog-field>label{display:block;font-size:12px;color:var(--bog-ink-2);margin-bottom:6px;}
.bog-hint{font-size:11px;color:var(--bog-ink-3);line-height:1.5;margin-top:6px;}
#bog-layer input[type=text],#bog-layer input[type=date],#bog-layer input[type=number]{height:34px;width:100%;padding:0 10px;border:1px solid var(--bog-line-2);border-radius:8px;background:var(--bog-surface);color:var(--bog-ink);font-family:inherit;font-size:12px;box-sizing:border-box;transition:border-color .15s,box-shadow .15s;}
#bog-layer input[type=text]:focus,#bog-layer input[type=date]:focus,#bog-layer input[type=number]:focus{outline:none;border-color:var(--bog-pink);box-shadow:0 0 0 3px var(--bog-pink-soft);}
.bog-mono{font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:11.5px;}
.bog-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;}
.bog-chip{border:0;border-radius:6px;padding:3px 7px;background:var(--bog-surface-2);color:var(--bog-ink-2);font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:10.5px;line-height:1.4;cursor:pointer;transition:background .15s,color .15s;}
.bog-chip:hover{background:var(--bog-pink-soft);color:var(--bog-pink-hover);}
.bog-row{display:flex;align-items:center;gap:8px;}
.bog-row+.bog-row{margin-top:10px;}
.bog-row-split{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.bog-switch-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:3px 0;}
.bog-switch-row+.bog-switch-row{margin-top:4px;}
.bog-switch-txt{cursor:pointer;}
.bog-switch-label{font-size:12px;color:var(--bog-ink);}
.bog-switch-desc{font-size:11px;color:var(--bog-ink-3);line-height:1.5;margin-top:2px;}
#bog-layer .bog-switch{appearance:none;-webkit-appearance:none;flex:none;width:34px;height:20px;margin:0;border:0;border-radius:10px;background:var(--bog-line-2);position:relative;cursor:pointer;transition:background .16s;box-sizing:border-box;}
#bog-layer .bog-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.22);transition:transform .16s;}
#bog-layer .bog-switch:checked{background:var(--bog-pink);}
#bog-layer .bog-switch:checked::after{transform:translateX(14px);}
#bog-layer .bog-switch:focus-visible{outline:2px solid var(--bog-pink);outline-offset:2px;}
.bog-num{width:76px;text-align:center;font-variant-numeric:tabular-nums;}
.bog-mini{flex:1;min-width:0;}
.bog-mini>label{display:block;font-size:12px;color:var(--bog-ink-2);margin-bottom:6px;}
.bog-range-arrow{flex:none;font-size:11px;color:var(--bog-ink-3);}
.bog-inline-label{font-size:12px;color:var(--bog-ink-2);margin:0;}
.bog-ft{flex:none;display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--bog-line);background:var(--bog-surface-2);}
.bog-btn{height:32px;padding:0 16px;border-radius:8px;font-family:inherit;font-size:12px;font-weight:500;line-height:1;cursor:pointer;transition:background .15s,border-color .15s,color .15s;}
.bog-btn-ghost{border:1px solid var(--bog-line-2);background:transparent;color:var(--bog-ink-2);}
.bog-btn-ghost:hover{border-color:var(--bog-ink-3);color:var(--bog-ink);}
.bog-btn-primary{border:0;background:var(--bog-pink);color:#fff;box-shadow:0 2px 8px rgba(251,114,153,.32);}
.bog-btn-primary:hover{background:var(--bog-pink-hover);}
.bog-tab-btn{color:var(--bog-pink-hover)!important;font-weight:500;cursor:pointer;}
html[data-theme="dark"] .download-button i,body.dark .download-button i{filter:invert(1) brightness(1.7);}
`;

    function bogInjectStyle() {
        if (document.getElementById('bog-style')) return;
        const style = document.createElement('style');
        style.id = 'bog-style';
        style.textContent = BOG_CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    bogInjectStyle();

    /* ---------- 队列状态：暂停 / 取消 ----------
     * 暂停只拦「还没发出去的请求」：已排进限流器的任务在启动前等闸门，
     * 已经发出去的那一两个请求让它跑完，避免产出半截文件。
     * 取消靠 epoch 自增：排队中的任务发现 epoch 变了就直接作废，
     * 已经在传的用每条进度条自己挂的 _bogAbort 中止。
     */

    let bogPaused = false;
    let bogPauseWaiters = [];
    let bogEpoch = 0;

    function bogPauseGate() {
        if (!bogPaused) return Promise.resolve();
        return new Promise(function (resolve) { bogPauseWaiters.push(resolve); });
    }

    function bogSetPaused(value) {
        bogPaused = !!value;
        if (!bogPaused) {
            const waiters = bogPauseWaiters;
            bogPauseWaiters = [];
            waiters.forEach(function (fn) { fn(); });
        }
        bogUpdateQueueTitle();
    }

    /** 写进度条填充比例（0–100），两条视觉通道都由 --p 派生 */
    function bogSetProgress(el, percent) {
        if (!el) return;
        const value = Math.max(0, Math.min(100, Number(percent) || 0));
        el.style.setProperty('--p', value.toFixed(1));
    }

    /** 进度条文案：名称占左侧自适应宽度，百分比单列右对齐（等宽数字，不抖动） */
    function bogSetProgressText(el, nameText, percent) {
        if (!el) return;
        if (nameText !== null && nameText !== undefined) {
            const nameEl = el.querySelector('.bog-progress-name');
            if (nameEl) nameEl.textContent = nameText;
        }
        const pctEl = el.querySelector('.bog-progress-pct');
        if (!pctEl) return;
        pctEl.textContent = (percent === null || percent === undefined) ? '' : (Math.round(percent) + '%');
    }

    /** 按钮文案：带 <span class="bog-dock-label"> 的走内层，没有的直接写 textContent */
    function bogSetBtnText(btn, text) {
        if (!btn) return;
        const label = btn.querySelector ? btn.querySelector('.bog-dock-label') : null;
        if (label) label.textContent = text;
        else btn.textContent = text;
    }

    let downloadQueueCard = document.createElement('div');
    downloadQueueCard.id = 'bog-queue';

    let downloadQueueTitle = document.createElement('div');
    downloadQueueTitle.className = 'bog-queue-title';

    const bogTitleLabel = document.createElement('span');
    bogTitleLabel.textContent = '下载队列';

    const bogTitleCtrls = document.createElement('span');
    bogTitleCtrls.className = 'bog-queue-ctrls';

    const bogPauseBtn = document.createElement('button');
    bogPauseBtn.type = 'button';
    bogPauseBtn.className = 'bog-queue-ctrl';
    bogPauseBtn.textContent = '暂停';
    bogPauseBtn.title = '暂停下载队列';
    bogPauseBtn.addEventListener('click', function () { bogSetPaused(!bogPaused); });

    const bogCancelBtn = document.createElement('button');
    bogCancelBtn.type = 'button';
    bogCancelBtn.className = 'bog-queue-ctrl is-danger';
    bogCancelBtn.textContent = '取消';
    bogCancelBtn.title = '取消本轮全部下载';
    bogCancelBtn.addEventListener('click', bogCancelAll);

    bogTitleCtrls.appendChild(bogPauseBtn);
    bogTitleCtrls.appendChild(bogCancelBtn);
    downloadQueueTitle.appendChild(bogTitleLabel);
    downloadQueueTitle.appendChild(bogTitleCtrls);
    downloadQueueCard.appendChild(downloadQueueTitle);
    document.body.appendChild(downloadQueueCard);

    let progressBar = document.createElement('div');
    progressBar.className = 'bog-progress';
    let progressText = document.createElement('span');
    progressText.className = 'bog-progress-name';
    progressBar.appendChild(progressText);
    let progressPct = document.createElement('span');
    progressPct.className = 'bog-progress-pct';
    progressBar.appendChild(progressPct);
    let progressCloseBtn = document.createElement('button');
    progressCloseBtn.type = 'button';
    progressCloseBtn.className = 'bog-progress-x';
    progressCloseBtn.textContent = '×';
    progressCloseBtn.title = '取消';
    progressBar.appendChild(progressCloseBtn);

    /** 队列标题：条数 + 暂停态，同时负责空的自动隐藏 */
    function bogUpdateQueueTitle() {
        if (!downloadQueueTitle) return;
        const count = downloadQueueCard.querySelectorAll('.bog-progress').length;
        // 暂停时即使队列是空的也要留着标题，否则「继续 / 取消」就没地方点了：
        // 批量下载的暂停发生在建进度条之前，此时队列天然为空
        bogTitleLabel.textContent = (bogPaused ? '已暂停' : '下载队列') + (count > 0 ? (' · ' + count) : '');
        bogPauseBtn.textContent = bogPaused ? '继续' : '暂停';
        bogPauseBtn.title = bogPaused ? '恢复下载队列' : '暂停下载队列';
        downloadQueueTitle.style.display = (count > 0 || bogPaused) ? 'flex' : 'none';
    }

    /** 取消本轮全部下载：作废排队任务 + 中止在传任务 + 清空队列 */
    function bogCancelAll() {
        bogEpoch += 1;
        if (listDownloading) stopDownloadingList = true;
        bogSetPaused(false);
        const items = downloadQueueCard.querySelectorAll('.bog-progress');
        Array.prototype.forEach.call(items, function (item) {
            if (typeof item._bogAbort === 'function') {
                try { item._bogAbort(); } catch (err) {}
            }
            item.remove();
        });
        bogUpdateQueueTitle();
        const listButton = document.getElementById('listDownloadButton');
        if (listButton && listDownloading) bogSetBtnText(listButton, '正在停止…');
    }

    function sleep(seconds) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, seconds * 1000);
        });
    }

    /* =====================================================================
     * 增强补丁：opus 页面支持 / 当日连续序号 / 子目录输出
     * （UI 结构沿用上游脚本 OWENDSWANG v1.3.0，MIT 许可；本脚本自 0.9.0 起独立发版）
     * ================================================================== */

    const OPUS_LIST_API = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space';
    const OUTPUT_ROOT = 'bilibili';   // 下载目录下的子目录，最终路径 bilibili/{username}/
    // 默认图片命名：{username} {YYYY}.{MM}.{DD} ({seq}).{ext}
    // {seq} 为当日连续序号（跨作品累加），比 {index} 更能避免重名
    const DEFAULT_PIC_NAME = '{username} {YYYY}.{MM}.{DD} ({seq}).{ext}';
    // 参考脚本的出厂默认值。老用户存储里大概率还是它，需要一次性迁移
    const LEGACY_PIC_NAME = '{original}.{ext}';
    const PIC_NAME_MIGRATED_KEY = 'picNameMigrated';

    /* ---------- 原图 URL 规范化（移植自 bilibili_opus_grab.py 的 normalize_image_url） ---------- */

    const IMG_EXT_WHITELIST = {
        jpg: 1, jpeg: 1, png: 1, gif: 1, webp: 1, bmp: 1, avif: 1, heic: 1, jxl: 1,
    };

    /** 统一 https、去掉 query、去掉 CDN 的 @xxx 压缩/裁剪后缀 */
    function normalizeImageUrl(url) {
        if (!url) return '';
        let u = String(url).trim();
        if (u.startsWith('//')) {
            u = 'https:' + u;
        } else if (u.startsWith('http://')) {
            u = 'https://' + u.slice('http://'.length);
        }
        u = u.split('?')[0].split('#')[0];
        const at = u.indexOf('@');
        if (at !== -1) u = u.slice(0, at);
        return u;
    }

    /** 从 URL 取扩展名（白名单校验，与 bilibili_opus_grab.py 的 ext_from_url 一致） */
    function extFromUrl(url) {
        // 一并去掉 @ 后缀：'a.jpg@100q.webp' 的扩展名应是 jpg 而不是 webp
        const path = String(url || '').split('?')[0].split('#')[0].split('@')[0];
        const base = path.slice(path.lastIndexOf('/') + 1);
        const dot = base.lastIndexOf('.');
        const ext = dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
        if (IMG_EXT_WHITELIST[ext]) return ext === 'jpeg' ? 'jpg' : ext;
        return 'jpg';
    }

    /** 去掉最后一个扩展名后的文件名 */
    function baseNameOf(url) {
        const path = String(url || '').split('?')[0].split('#')[0];
        const base = path.slice(path.lastIndexOf('/') + 1);
        const dot = base.lastIndexOf('.');
        return dot === -1 ? base : base.slice(0, dot);
    }

    /* ---------- 图片下载节流：并发 2、每次间隔 300~550ms ---------- */

    const IMG_CONCURRENCY = 2;
    const IMG_MIN_GAP_MS = 300;

    function sleepMs(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function createLimiter(max) {
        let active = 0;
        const queue = [];
        const next = () => {
            if (active >= max || queue.length === 0) return;
            const job = queue.shift();
            active += 1;
            Promise.resolve()
                .then(job.fn)
                .then(job.resolve, job.reject)
                .then(() => {
                    active -= 1;
                    next();
                });
        };
        return function (fn) {
            return new Promise((resolve, reject) => {
                queue.push({ fn, resolve, reject });
                next();
            });
        };
    }

    const imageLimiter = createLimiter(IMG_CONCURRENCY);

    /** 把下载任务排进限流器，并保证两次请求之间有随机间隔 */
    function queueImageTask(fn) {
        const epoch = bogEpoch;
        return imageLimiter(async () => {
            // 排队期间被「取消」的，直接作废，不发请求
            if (epoch !== bogEpoch) return false;
            // 暂停闸门放在占用并发槽之后：暂停时不产生新请求，恢复后按序继续
            await bogPauseGate();
            if (epoch !== bogEpoch) return false;
            const r = await fn();
            await sleepMs(IMG_MIN_GAP_MS + Math.random() * 250);
            return r;
        });
    }

    /* ---------- 命名映射：同一张图重复处理时复用已分配的文件名 ---------- */

    function loadPicNameMap(uid) {
        const m = GM_getValue('bog-map-' + uid, null);
        return (m && typeof m === 'object') ? m : {};
    }

    /**
     * 以「日期|原图URL」为键记住已分配的文件名（对应 bilibili_opus_grab.py 的 manifest.files）。
     * 命中则复用，避免重跑时序号一路膨胀、同一张图存成多个名字。
     */
    function picNameFor(uid, key, makeName) {
        const map = loadPicNameMap(uid);
        if (map[key]) return map[key];
        const name = makeName();
        map[key] = name;
        GM_setValue('bog-map-' + uid, map);
        return name;
    }

    /**
     * 一次性迁移：老用户存储里的 dlPicName 还是参考脚本的 '{original}.{ext}'，
     * 会让新默认模板永远不生效（下载下来仍是 uuid.jpg）。
     * 只在脚本版本升级后执行一次；已是自定义模板的不动。
     */
    function ensurePicNameSetting() {
        if (GM_getValue(PIC_NAME_MIGRATED_KEY, false)) return;
        const stored = GM_getValue('dlPicName', null);
        if (stored === null || String(stored).trim() === '' || String(stored).trim() === LEGACY_PIC_NAME) {
            GM_setValue('dlPicName', DEFAULT_PIC_NAME);
        }
        GM_setValue(PIC_NAME_MIGRATED_KEY, true);
    }

    /** 当前页面对应的单篇 opus / 动态 id（仅在详情页返回） */
    function pageOpusId() {
        if (location.host === 'www.bilibili.com') {
            const m = location.pathname.match(/^\/opus\/(\d+)/);
            if (m) return m[1];
        }
        if (location.host === 't.bilibili.com') {
            const m = location.pathname.match(/^\/(\d+)/);
            if (m) return m[1];
        }
        return null;
    }

    /** 空间页 UID */
    function pageUid() {
        if (location.host === 'space.bilibili.com') {
            const m = location.pathname.match(/^\/(\d+)/);
            if (m) return m[1];
        }
        return null;
    }

    /** 与 getPicName 一致地按本地时区格式化日期，作为当日序号的键 */
    function dateKeyOf(ts) {
        const d = new Date(ts * 1000);
        const MM = (d.getMonth() + 1).toString().padStart(2, '0');
        const DD = d.getDate().toString().padStart(2, '0');
        return d.getFullYear().toString() + '.' + MM + '.' + DD;
    }

    /**
     * 当日连续序号：同一天跨作品累加，避免重名。
     * 与 Python 版 assign_filenames 的取号方式一致（max + 1）。
     */
    function nextDailySeq(userId, dateKey) {
        const key = 'seq-' + userId + '-' + dateKey;
        const next = GM_getValue(key, 0) + 1;
        GM_setValue(key, next);
        return next;
    }

    /** 'YYYY-MM-DD' → 当日 00:00 的时间戳；空值返回 null */
    function parseDateInput(value) {
        if (!value) return null;
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!m) return null;
        return Math.floor(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0).getTime() / 1000);
    }

    /** 清洗下载路径：保留 / 作为子目录分隔，逐段去掉 Windows 非法字符 */
    function sanitizeDownloadName(name) {
        return String(name).split('/').map(function(seg) {
            return seg
                .replace(/[<>:"|?*\x00-\x1f]/g, '_')
                .replace(/^\.+$/, '_')
                .trim();
        }).filter(function(seg) { return seg !== ''; }).join('/');
    }

    /**
     * 原生保存 Blob。不依赖 FileSaver：
     * 1) cdnjs 在大陆经常拉不到，@require 失败会让整个脚本不执行；
     * 2) <a download> 在 Chrome/Edge/Firefox 行为一致，文件名 100% 由脚本决定。
     */
    function saveBlobAs(blob, filename) {
        if (!blob) return;
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = filename;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            URL.revokeObjectURL(href);
            a.remove();
        }, 30000);
    }

    /** 用 GM_download 下载到子目录（saveAs 无法创建目录），带进度条 */
    function downloadWithGm(url, name, allowFlatten) {
        name = sanitizeDownloadName(name);
        if (typeof GM_download !== 'function') {
            // 管理器未授权 GM_download：退化为单层文件名，至少保证能落盘
            return downloadWrapper(url, name.split('/').pop());
        }
        console.log('[bog] GM_download name =', name);
        const progress = downloadQueueCard.appendChild(progressBar.cloneNode(true));
        const progressName = name.length > 20 ? (name.substring(0, 20) + '...') : name;
        bogSetProgressText(progress, progressName, 0);
        bogUpdateQueueTitle();
        if (url.startsWith('http://')) url = url.replace(/^http\:/, 'https:');

        return new Promise(function(resolve) {
            const task = GM_download({
                url,
                name,
                saveAs: false,
                conflictAction: 'overwrite',
                headers: {
                    Referer: 'https://www.bilibili.com/',
                    Origin: 'https://www.bilibili.com',
                },
                onprogress: function(e) {
                    if (!e || !e.total) return;
                    const percent = e.loaded / e.total * 100;
                    bogSetProgress(progress, percent);
                    bogSetProgressText(progress, null, percent);
                },
                onload: function() {
                    bogSetProgress(progress, 100);
                    bogSetProgressText(progress, null, 100);
                    setTimeout(function() {
                        progress.remove();
                        bogUpdateQueueTitle();
                    }, 1000);
                    resolve(true);
                },
                onerror: function(e) {
                    // 子目录写入不被支持时，退化为单层文件名重试一次，避免整张图失败
                    if (allowFlatten !== false && name.indexOf('/') !== -1) {
                        console.warn('[bog] 子目录写入失败，改用单层文件名重试:', e && e.error, name);
                        progress.remove();
                        bogUpdateQueueTitle();
                        resolve(downloadWithGm(url, name.split('/').pop(), false));
                        return;
                    }
                    downloadError(e, url, name, progress);
                    resolve(false);
                },
                ontimeout: function(e) {
                    downloadError(e, url, name, progress);
                    resolve(false);
                },
            });
            progress._bogAbort = function() {
                try { task.abort(); } catch (err) {}
            };
            progress.lastChild.onclick = function() {
                try { task.abort(); } catch (err) {}
                this.parentNode.remove();
                bogUpdateQueueTitle();
            };
        });
    }

    /** 逐篇下载时的日期区间 / 篇数上限过滤，由 downloadList 设置 */
    const listFilter = { active: false, sinceTs: null, untilTs: null, limit: 0, done: 0 };

    function filterPass(ts) {
        if (!listFilter.active) return true;
        if (listFilter.sinceTs && ts < listFilter.sinceTs) return false;
        if (listFilter.untilTs && ts >= listFilter.untilTs + 86400) return false;
        return true;
    }


    function oXMLHttpRequest(url, type) {
        // console.log('oXMLHttpRequest started: ' + url);
        return new Promise(function(resolve, reject) {
            let oReq = new XMLHttpRequest();
            oReq.open("GET", url);
            oReq.withCredentials = true;
            oReq.responseType = type;
            oReq.onload = (e) => {
                // console.log(e);
                // console.log(oReq.response);
                // console.log('oXMLHttpRequest finished: ' + url);
                resolve(oReq.response);
            };
            oReq.onerror = (e) => { console.log(e); alert('请求失败！'); resolve(null); };
            oReq.onabort = (e) => { console.log(e); alert('请求被中断！'); resolve(null); };
            oReq.ontimeout = (e) => { console.log(e); alert('请求超时！'); resolve(null); };
            oReq.send(null);
        });
    }

    function gmXMLHttpRequest(url, responseType, progress, progressName, progressMin = 0, progressMax = 100) {
        // console.log('gmXMLHttpRequest started: ' + url);
        const urlObj = new URL(url);
        return new Promise(function(resolve, reject) {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: ((responseType === 'text') ? undefined : responseType),
                headers: {
                    'Referer': urlObj.protocol + '//' + urlObj.host,
                    'Origin': urlObj.protocol + '//' + urlObj.host,
                },
                onprogress: (e) => {
                    // e = { int done, finalUrl, bool lengthComputable, int loaded, int position, int readyState, response, str responseHeaders, responseText, responseXML, int status, statusText, int total, int totalSize }
                    const percent = e.done / e.total * (progressMax - progressMin) / 100 + progressMin;
                    bogSetProgress(progress, percent);
                    bogSetProgressText(progress, null, percent);
                },
                onload: function({ response, responseText }) {
                    // console.log(response);
                    let size = 'unknown size';
                    if (responseType === 'blob') {
                        size = response.size.toString() + 'B';
                    } else if (responseType === 'arraybuffer') {
                        size = response.byteLength.toString() + 'B';
                    } else if (responseType === 'text') {
                        size = new TextEncoder().encode(responseText).length.toString() + 'B';
                    }
                    // console.log('gmXMLHttpRequest finished: (' + size + ') ' + url);
                    if (responseType === 'text') {
                        resolve(responseText);
                    } else {
                        resolve(response);
                    }
                },
                onabort: function(e) { console.log(e); alert('请求失败！'); resolve(null); },
                onerror: function(e) { console.log(e); alert('请求被中断！'); resolve(null); },
                ontimeout: function(e) { console.log(e); alert('请求超时！'); resolve(null); },
            });
        });
    }

    /*function saveAs(blob, name) {
        const link = document.createElement("a");
        link.style.display = "none";
        link.href = URL.createObjectURL(blob);
        link.download = name;
        link.target = '_blank';
        document.body.appendChild(link);
        // console.log(link);
        link.click();
        const timeout = setTimeout(() => {
            URL.revokeObjectURL(link.href);
            link.parentNode.removeChild(link);
        }, 1000);
    }*/

    function downloadError(e, url, name, progress) {
        // console.log(e, url);
        /*GM_notification({
            title: 'Download error',
            text: 'Error: ' + e.error + '\nUrl: ' + url,
            silent: true,
            timeout: 3,
        });*/
        const shortName = name.length > 16 ? (name.substring(0, 16) + '…') : name;
        const errText = (e && e.error) ? e.error : '未知错误';
        progress.classList.add('is-error');
        progress._bogAbort = null;
        bogSetProgressText(progress, shortName + ' · ' + errText, null);
        progress.title = name + '\n' + errText;
        let progressRetryBtn = document.createElement('button');
        progressRetryBtn.type = 'button';
        progressRetryBtn.className = 'bog-progress-retry';
        progressRetryBtn.textContent = '重试';
        progressRetryBtn.title = '重试这张';
        progressRetryBtn.onclick = function(e) {
            this.parentNode.remove();
            downloadWrapper(url, name);
        };
        // 顺序：文件名 → [重试] → [×]。重试是恢复动作靠内，关闭是不可逆动作固定最右端，
        // 避免手滑把「还想再试一次」点成「关掉」。
        progress.insertBefore(progressRetryBtn, progress.lastChild);
        progress.lastChild.title = '关闭';
        progress.lastChild.onclick = function(e) {
            this.parentNode.remove();
            bogUpdateQueueTitle();
        };
        // setTimeout(() => { progress.remove(); if(downloadQueueCard.childElementCount == 1) downloadQueueTitle.style.display = 'none'; }, 1000);
    }

    function downloadWrapper(url, name, responseType = 'blob') {
        // 只有显式开启子目录时才交给 GM_download。
        // Tampermonkey 在部分下载模式下会忽略 name（TM issue #1695），
        // 导致文件按 URL 原名保存（如 00b85b41-....jpg），所以默认走扁平保存。
        if (responseType === 'blob' && name.indexOf('/') !== -1 && GM_getValue('dlUseSubdir', false)) {
            return downloadWithGm(url, name);
        }
        const flatName = name.split('/').pop();
        const progress = downloadQueueCard.appendChild(progressBar.cloneNode(true));
        const progressName = name.length > 20 ? (name.substring(0,20) + '...') : name;
        bogSetProgressText(progress, progressName, 0);
        bogUpdateQueueTitle();
        if (url.startsWith('http://')) url = url.replace(/^http\:/, 'https:');
        return new Promise(function(resolve, reject) {
            /*const download = GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType,
                headers: {
                    Referer: location.protocol + '//' + location.hostname,
                    Origin: location.protocol + '//' + location.hostname,
                },
                onprogress: (e) => {
                    // e = { int done, finalUrl, bool lengthComputable, int loaded, int position, int readyState, response, str responseHeaders, responseText, responseXML, int status, statusText, int total, int totalSize }
                    const percent = e.done / e.total * 100;
                    progress.style.background = 'linear-gradient(to right, green ' + percent + '%, transparent ' + percent + '%)';
                    bogSetProgressText(progress, null, percent);
                },
                onload: function({ response }) {
                    // console.log(response);
                    const timeout = setTimeout(() => {
                        progress.remove();
                        if(downloadQueueCard.childElementCount == 1) downloadQueueTitle.style.display = 'none';
                    }, 1000);
                    progress.lastChild.onclick = function(e) {
                        clearTimeout(timeout);
                        this.parentNode.remove();
                        if(downloadQueueCard.childElementCount == 1) downloadQueueTitle.style.display = 'none';
                    };
                    if (responseType === 'arraybuffer') {
                        resolve(response);
                    } else {
                        saveAs(response, name);
                        resolve(true);
                    }
                },
                onabort: function(e) { console.log(e); resolve(null); },
                onerror: function(e) { downloadError(e, url, name, progress); console.log(e); resolve(null); },
                ontimeout: function(e) { downloadError(e, url, name, progress); console.log(e); resolve(null); },
            });
            progress.lastChild.onclick = function(e) {
                download.abort();
                this.parentNode.remove();
                if(downloadQueueCard.childElementCount == 1) downloadQueueTitle.style.display = 'none';
            };*/
            const oReq = new XMLHttpRequest();
            oReq.open("GET", url);
            oReq.responseType = responseType;
            oReq.onprogress = (e) => {
                // console.log(e);
                const percent = e.loaded / e.total * 100;
                bogSetProgress(progress, percent);
                bogSetProgressText(progress, null, percent);
            };
            oReq.onload = (e) => {
                progress._bogAbort = null;
                const timeout = setTimeout(() => {
                    progress.remove();
                    bogUpdateQueueTitle();
                }, 1000);
                progress.lastChild.onclick = function(e) {
                    clearTimeout(timeout);
                    this.parentNode.remove();
                    oReq.abort();
                    bogUpdateQueueTitle();
                };
                if (responseType === 'arraybuffer') {
                    resolve(oReq.response);
                } else if (oReq.status !== 200 || !oReq.response) {
                    // 403/404 时别把错误页当成图片存下来
                    downloadError({ error: 'HTTP ' + oReq.status }, url, flatName, progress);
                    resolve(false);
                } else {
                    // 用扁平文件名交给 <a download>，文件名不会被管理器丢弃
                    saveBlobAs(oReq.response, flatName);
                    resolve(true);
                }
            };
            oReq.onerror = (e) => { downloadError(e, url, name, progress); resolve(null); };
            oReq.onabort = (e) => { resolve(null); };
            oReq.ontimeout = (e) => { downloadError(e, url, name, progress); resolve(null); };
            progress._bogAbort = function() {
                try { oReq.abort(); } catch (err) {}
            };
            oReq.send();
            progress.lastChild.onclick = function(e) {
                this.parentNode.remove();
                oReq.abort();
                bogUpdateQueueTitle();
            };
        });
    }

    /*function getPicName(nameSetting, originalName, index, data) {
        const card = JSON.parse(data.card.card);
        // console.log(card);
        let setName = nameSetting;
        setName = setName.replace('{original}', originalName.split('.')[0]);
        setName = setName.replace('{ext}', originalName.split('.')[1]);
        const userName = card.user?.name || data.card.desc.user_profile.info.uname;
        const userId = card.user?.uid || data.card.desc.user_profile.info.uid;
        const dynamicId = data.card.desc.dynamic_id_str;
        const content = card.item?.description || card.title || '';
        // console.log("content: ", content);
        setName = setName.replace('{username}', userName);
        setName = setName.replace('{userid}', userId);
        setName = setName.replace('{dynamicid}', dynamicId);
        setName = setName.replace('{index}', index);
        setName = setName.replace('{content}', content.substring(0, 25));
        let YYYY, MM, DD, HH, mm, ss;
        const postAt = new Date((card.item?.upload_time || data.card.desc.timestamp) * 1000);
        YYYY = postAt.getFullYear().toString();
        MM = (postAt.getMonth() + 1).toString().padStart(2, '0');
        DD = postAt.getDate().toString().padStart(2, '0');
        HH = postAt.getHours().toString().padStart(2, '0');
        mm = postAt.getMinutes().toString().padStart(2, '0');
        ss = postAt.getSeconds().toString().padStart(2, '0');
        setName = setName.replace('{YYYY}', YYYY);
        setName = setName.replace('{MM}', MM);
        setName = setName.replace('{DD}', DD);
        setName = setName.replace('{HH}', HH);
        setName = setName.replace('{mm}', mm);
        setName = setName.replace('{ss}', ss);
        //if (retweetPostId && GM_getValue('retweetMode', false)) {
        //    setName = setName.replace('{re.mblogid}', retweetPostId);
        //    setName = setName.replace('{re.username}', retweetUserName);
        //    setName = setName.replace('{re.userid}', retweetUserId);
        //    setName = setName.replace('{re.uid}', retweetPostUid);
        //    setName = setName.replace('{re.content}', retweetContent.substring(0, 25));
        //    let reYYYY, reMM, reDD, reHH, remm, ress;
        //    const retweetPostAt = new Date(retweetPostTime);
        //    if (retweetPostTime) {
        //        reYYYY = retweetPostAt.getFullYear().toString();
        //        reMM = (retweetPostAt.getMonth() + 1).toString().padStart(2, '0');
        //        reDD = retweetPostAt.getDate().toString().padStart(2, '0');
        //        reHH = retweetPostAt.getHours().toString().padStart(2, '0');
        //        remm = retweetPostAt.getMinutes().toString().padStart(2, '0');
        //        ress = retweetPostAt.getSeconds().toString().padStart(2, '0');
        //    }
        //    setName = setName.replace('{re.YYYY}', reYYYY);
        //    setName = setName.replace('{re.MM}', reMM);
        //    setName = setName.replace('{re.DD}', reDD);
        //    setName = setName.replace('{re.HH}', reHH);
        //    setName = setName.replace('{re.mm}', remm);
        //    setName = setName.replace('{re.ss}', ress);
        //}
        return setName.replace(/[<|>|*|"|\/|\\|\||:|?|\n]/g, '_');
    }*/

    function getPicName(nameSetting, originalName, index, item, sourceUrl) {
        const author = item.modules.module_author;
        const dynamic = item.modules.module_dynamic;
        // console.log(card);
        let setName = nameSetting;
        // {original} / {ext} 不再用 split('.') 猜，避免 'a.b.jpg@100q.webp' 这类 URL 取错
        setName = setName.replace('{original}', baseNameOf(originalName));
        setName = setName.replace('{ext}', extFromUrl(sourceUrl || originalName));
        const userName = author.name;
        const userId = author.mid;
        const dynamicId = item.id_str;
        const majorBlock = dynamic.major || {};
        const content = (majorBlock.opus && majorBlock.opus.summary && majorBlock.opus.summary.text)
            || (majorBlock.draw && majorBlock.draw.summary && majorBlock.draw.summary.text)
            || '';
        // console.log("content: ", content);
        setName = setName.replace('{username}', userName);
        setName = setName.replace('{userid}', userId);
        setName = setName.replace('{dynamicid}', dynamicId);
        setName = setName.replace('{index}', index);
        setName = setName.replace('{content}', content.substring(0, 25));
        let YYYY, MM, DD, HH, mm, ss;
        const postAt = new Date(author.pub_ts * 1000);
        YYYY = postAt.getFullYear().toString();
        MM = (postAt.getMonth() + 1).toString().padStart(2, '0');
        DD = postAt.getDate().toString().padStart(2, '0');
        HH = postAt.getHours().toString().padStart(2, '0');
        mm = postAt.getMinutes().toString().padStart(2, '0');
        ss = postAt.getSeconds().toString().padStart(2, '0');
        // {date} = 2021.08.02；{seq} = 当天第几张（跨作品连续，取号即消耗）
        setName = setName.replace('{date}', YYYY + '.' + MM + '.' + DD);
        setName = setName.replace('{seq}', nextDailySeq(userId, YYYY + '.' + MM + '.' + DD));
        setName = setName.replace('{YYYY}', YYYY);
        setName = setName.replace('{MM}', MM);
        setName = setName.replace('{DD}', DD);
        setName = setName.replace('{HH}', HH);
        setName = setName.replace('{mm}', mm);
        setName = setName.replace('{ss}', ss);
        return setName.replace(/[<|>|*|"|\/|\\|\||:|?|\n]/g, '_');
    }

    // For 'https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/get_dynamic_detail?dynamic_id=' + dynId
    // But it has deprecated
    /*async function handleImageDynamic(data) {
        const card = JSON.parse(data.card.card);
        const pictures = card.item.pictures;
        // console.log(pictures);
        if (Array.isArray(pictures)) {
            await Promise.all(pictures.map(function(picture, index) {
                // console.log(picture);
                const pictureUrl = picture.img_src;
                const originalName = pictureUrl.split('/')[pictureUrl.split('/').length - 1];
                const pictureName = getPicName(GM_getValue('dlPicName', '{original}.{ext}'), originalName, index + 1, data);
                //GM_download({
                //    url: pictureUrl,
                //    name: pictureName,
                //    onerror: function(e) { console.log(e); alert('下载失败！'); },
                //    ontimeout: function(e) { console.log(e); alert('下载超时！'); },
                //});
                return downloadWrapper(pictureUrl, pictureName);
            }));
        }
    }*/

    async function handleImageDynamic(item) {
        // DRAW 类型作品的 major.opus 为 null，直接取 .pics 会抛异常导致“点了没反应”
        const major = item.modules.module_dynamic.major || {};
        const opusPics = major.opus && major.opus.pics;
        const drawItems = major.draw && major.draw.items;
        const pictures = opusPics || drawItems || [];
        if (!Array.isArray(pictures) || pictures.length === 0) return false;

        const author = item.modules.module_author;
        const userName = (author.name || 'unknown').replace(/[<|>|*|"|\/|\\|\||:|?|\n]/g, '_');
        const uid = author.mid;
        const dateKey = dateKeyOf(author.pub_ts);
        const template = GM_getValue('dlPicName', DEFAULT_PIC_NAME);
        const seen = new Set();
        const jobs = [];

        pictures.forEach(function(picture, index) {
            // 去 @ 压缩后缀 + 统一 https，拿到的才是原图（同 bilibili_opus_grab.py 的 normalize_image_url）
            const pictureUrl = normalizeImageUrl(picture.url || picture.src);
            if (!pictureUrl || seen.has(pictureUrl)) return;   // 同一篇里可能重复出现同一张图
            seen.add(pictureUrl);

            const originalName = pictureUrl.slice(pictureUrl.lastIndexOf('/') + 1);
            // 以「日期|URL」为键复用已分配的名字，重跑不会让序号继续膨胀
            const pictureName = picNameFor(uid, dateKey + '|' + pictureUrl, function() {
                return getPicName(template, originalName, index + 1, item, pictureUrl);
            });
            // 输出到 bilibili/{username}/ 下，与文件名模板解耦
            jobs.push(queueImageTask(function() {
                return downloadWrapper(pictureUrl, OUTPUT_ROOT + '/' + userName + '/' + pictureName);
            }));
        });

        const results = await Promise.all(jobs);
        return results.some(Boolean);
    }

    // For 'https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/get_dynamic_detail?dynamic_id=' + dynId
    // But it has deprecated
    /*async function handleArticleDynamic(data) {
        const card = JSON.parse(data.card.card);
        const pictures = card.image_urls;
        // console.log(pictures);
        if (Array.isArray(pictures)) {
            await Promise.all(pictures.map(function(picture, index) {
                // console.log(picture);
                const pictureUrl = picture;
                const originalName = pictureUrl.split('/')[pictureUrl.split('/').length - 1];
                const pictureName = getPicName(GM_getValue('dlPicName', '{original}.{ext}'), originalName, index + 1, data);
                //GM_download({
                //    url: pictureUrl,
                //    name: pictureName,
                //    onerror: function(e) { console.log(e); alert('下载失败！'); },
                //    ontimeout: function(e) { console.log(e); alert('下载超时！'); },
                //});
                return downloadWrapper(pictureUrl, pictureName);
            }));
        }
    }*/

    // For 'https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/get_dynamic_detail?dynamic_id=' + dynId
    // But it has deprecated.
    function getDynamicDetail(dynId) {
        /*return new Promise(function(resolve, reject) {
            GM_xmlhttpRequest({
                method: 'GET',
                // url: 'https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/get_dynamic_detail?dynamic_id=' + dynId,
                url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/detail?id=' + dynId,
                responseType: 'json',
                onload: function({ response }) {
                    // console.log(response);
                    resolve(response);
                },
                onabort: function(e) { resolve(null); },
                onerror: function(e) { resolve(null); },
                ontimeout: function(e) { resolve(null); },
            });
        });*/
        // return oXMLHttpRequest('https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/get_dynamic_detail?dynamic_id=' + dynId, 'json');
        return oXMLHttpRequest('https://api.bilibili.com/x/polymer/web-dynamic/v1/detail?id=' + dynId + '&features=itemOpusStyle,opusBigCover,onlyfansVote,endFooterHidden,decorationCard,onlyfansAssetsV2,ugcDelete,onlyfansQaCard,editable,opusPrivateVisible,avatarAutoTheme,sunflowerStyle,cardsEnhance,eva3CardOpus,eva3CardVideo,eva3CardComment,eva3CardVote,eva3CardUser', 'json');
    }

    // For 'https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/get_dynamic_detail?dynamic_id=' + dynId
    // But it has deprecated.
    /*async function handleDynamicDownload(dynId, downloadButton) {
        if (downloadButton) {
            downloadButton.textContent = '下载中……';
        }
        // console.log('handleDynamicDownload: ' + dynId);
        try {
            let skipped;
            let dynRes = await getDynamicDetail(dynId);
            // console.log(dynRes.data);
            if (dynRes.data.card.desc) {
                if (dynRes.data.card.desc.orig_dy_id) {
                    dynRes = await getDynamicDetail(dynRes.data.card.desc.orig_dy_id_str);
                }
                // console.log(dynRes.data);
                const card = JSON.parse(dynRes.data.card.card);
                switch(dynRes.data.card.desc.type) {
                    case 1:
                        // 转发
                        break;
                    case 2:
                        // 图片
                        // console.log('picture');
                        skipped = await handleImageDynamic(dynRes.data);
                        break;
                    case 4:
                        // 文字
                        break;
                    case 8:
                        // 视频
                        // console.log('video');
                        skipped = await handleVideoDynamic(dynRes.data);
                        break;
                    case 64:
                        // 专栏
                        skipped = await handleArticleDynamic(dynRes.data);
                        break;
                    case 256:
                        // 音频
                        break;
                    default:
                        break;
                }
                if (!skipped) {
                    GM_setValue('bog-dl-' + dynId, true);
                }
                if (downloadButton) {
                    if (!skipped) {
                        downloadButton.textContent = '已下载';
                    } else {
                        downloadButton.textContent = '下载';
                    }
                }
                return true;
            } else {
                if (!listDownloading) alert('无法下载！');
                return true;
            }
        } catch(e) {
            console.error(e);
            if (downloadButton) {
                downloadButton.textContent = GM_getValue('bog-dl-' + dynId, false) ? '已下载' : '下载';
            }
            if (!listDownloading) alert('无法下载！');
            return false;
        }
    }*/

    // For 'https://api.bilibili.com/x/polymer/web-dynamic/v1/detail?id=' + dynId
    async function handleDynamicDownload(dynId, downloadButton) {
        if (downloadButton) {
            bogSetBtnText(downloadButton, '下载中…');
        }
        // console.log('handleDynamicDownload: ' + dynId);
        try {
            let skipped;
            let dynRes = await getDynamicDetail(dynId);
            // console.log(dynRes.data);
            let item = dynRes.data.item;
            if (item.orig) {
                item = item.orig;
            }
            // 批量下载时按设置里的日期区间过滤（单篇手动下载不受影响）
            const pubTs = item.modules.module_author.pub_ts;
            if (!filterPass(pubTs)) {
                if (downloadButton) {
                    bogSetBtnText(downloadButton, '区间外');
                }
                return 'skip';
            }
            // console.log(item);
            const major = item.modules.module_dynamic.major;
            const epochBefore = bogEpoch;
            if (major.draw || major.opus) {
                // 图片
                // console.log('picture');
                skipped = await handleImageDynamic(item);
            } else {
                // 视频（major.archive）、直播（major.live_rcmd）等不在本脚本范围内
                if (!listDownloading) alert('该动态不含图片，无法下载！');
                return true;
            }
            // 中途被「取消」：不能记成已下载，否则重跑会被跳过
            if (epochBefore !== bogEpoch) {
                if (downloadButton) {
                    bogSetBtnText(downloadButton, '已取消');
                }
                return false;
            }
            if (!skipped) {
                GM_setValue('bog-dl-' + dynId, true);
            }
            if (downloadButton) {
                if (!skipped) {
                    bogSetBtnText(downloadButton, '已下载');
                } else {
                    bogSetBtnText(downloadButton, '下载');
                }
            }
            return true;
        } catch(e) {
            console.error(e);
            if (downloadButton) {
                bogSetBtnText(downloadButton, GM_getValue('bog-dl-' + dynId, false) ? '已下载' : '下载');
            }
            if (!listDownloading) alert('无法下载！');
            return false;
        }
    }

    function addOpusDownloadButton(card) {
        if (card.getElementsByClassName('download-button').length > 0 || document.getElementById('opusDownloadButton')) {
            return;
        }
        // console.log(card);
        const buttonBar = card.getElementsByClassName('bili-tabs__nav__items')[0];
        const pageDynId = pageOpusId() || (window.location.pathname.match(/BV[a-zA-Z0-9]{10}/)?.[0]);
        // console.log('pageDynId: ', pageDynId);
        const doneText = GM_getValue('bog-dl-' + pageDynId, false) ? '已下载' : '下载';
        let downloadButton;
        if (buttonBar) {
            // 有 tab 栏：挂进 B 站原生 tab 条，沿用宿主样式，只加一点粉色强调
            downloadButton = document.createElement('div');
            downloadButton.classList.add('bili-tabs__nav__item', 'bog-tab-btn');
            downloadButton.textContent = doneText;
        } else {
            // 单篇 opus / 动态详情页没有 tab 栏：作为主按钮落进左下角悬浮入口
            downloadButton = document.createElement('button');
            downloadButton.type = 'button';
            downloadButton.id = 'opusDownloadButton';
            downloadButton.className = 'bog-dock-btn is-primary';
            downloadButton.innerHTML = BOG_ICON_DOWNLOAD + '<span class="bog-dock-label">' + doneText + '</span>';
        }
        downloadButton.classList.add('download-button');
        if (!buttonBar) {
            const dock = bogEnsureDock();
            dock.insertBefore(downloadButton, dock.firstChild);
        }
        downloadButton.addEventListener('click', async function(event) {
                const dynId = (window.location.pathname.match(/BV[a-zA-Z0-9]{10}/)?.[0]) || (window.location.pathname.match(/^\/opus\/(\d+)$/)?.[1]) || (window.location.pathname.match(/^\/\d+$/)?.[0]);
                // console.log(dynId);
                await handleDynamicDownload(dynId, this);
                /*const content = document.body.querySelector('div.opus-module-content');
                const list = content.querySelectorAll('div.bili-album__preview__picture__img');
                // console.log(list);
                for (const item of list) {
                    let imgUrl = item.style.backgroundImage.split(/"|@/)[1] || item.querySelector('img').src.split('@')[0];
                    if (imgUrl.startsWith('//')) {
                        imgUrl = 'https:' + imgUrl;
                    }
                    const imgName = imgUrl.split('/')[imgUrl.split('/').length - 1];
                    // console.log(imgUrl);
                    // console.log(imgName);
                    GM_download(imgUrl, imgName);
                }
                const topAlbum = document.body.querySelector('div.opus-module-top__album');
                if (topAlbum) {
                    const topAlbumIndicatorList = topAlbum.querySelectorAll('div.horizontal-scroll-album__indicator > div > img');
                    const topAlbumList = topAlbum.querySelectorAll('div.horizontal-scroll-album__pic__img > img');
                    let topList = topAlbumList;
                    if (topAlbumIndicatorList.length > 0) topList = topAlbumIndicatorList;
                    for (const item of topList) {
                        let imgUrl = item.src.split(/@/)[0];
                        if (imgUrl.startsWith('//')) {
                            imgUrl = 'https:' + imgUrl;
                        }
                        const imgName = imgUrl.split('/')[imgUrl.split('/').length - 1];
                        // console.log(imgUrl);
                        // console.log(imgName);
                        GM_download(imgUrl, imgName);
                    }
                }*/
            });
            if (buttonBar) buttonBar.appendChild(downloadButton);
    }

    function checkDynDownloaded(card) {
        // console.log('checkDynDownloaded: ', card);
        const opusCard = card.querySelector('div.dyn-card-opus');
        // console.log("opusCard: ", opusCard);
        const videoCard = card.querySelector('a.bili-dyn-card-video');
        // console.log("videoCard: ", videoCard);
        let dynId, BvId;
        if (opusCard) {
            dynId = opusCard.$log?.click.value.card_id || opusCard.$log?.show.value.card_id;
        }
        if (videoCard) {
            BvId = videoCard.href.match(/BV[a-z|A-Z|0-9]{10}/g)[0];
        }
        // console.log('dynId: ', dynId, ', BvId: ', BvId);
        if (dynId || BvId) {
            const downloadBtnTextEle = card.querySelector('div.bili-dyn-item__footer > div.bili-dyn-item__action.download-button > div.bili-dyn-action > span') || card.querySelector('div.bili-tabs__nav__items div.bili-tabs__nav__item.download-button');
            if (downloadBtnTextEle && (downloadBtnTextEle !== '已下载') && (GM_getValue('bog-dl-' + dynId, false) || GM_getValue('bog-dl-' + BvId, false))) {
                downloadBtnTextEle.textContent = '已下载';
                return true;
            }
        }
        return false;
    }

    function checkDynDownloadedHandler(event) {
        const card = event.target;
        checkDynDownloaded(card);
        card.removeEventListener('mouseenter', checkDynDownloaded);
    }

    function addDownloadButton(card) {
        // console.log('addDownloadButton', card);
        if(card.getElementsByClassName('download-button').length == 0) {
            if(card.getElementsByClassName('bili-dyn-item__footer').length > 0) {
                card.querySelectorAll('div.bili-dyn-item__footer > div.bili-dyn-item__action').forEach((ele) => { ele.style.marginRight = '48px'; });
                let buttonBar = card.getElementsByClassName('bili-dyn-item__footer')[0];
                let downloadButton = document.createElement('div');
                downloadButton.classList.add('bili-dyn-item__action');
                downloadButton.classList.add('download-button');
                let span = document.createElement('div');
                span.classList.add('bili-dyn-action');
                let icon = document.createElement('i');
                icon.style.width = '20px';
                icon.style.height = '20px';
                icon.style.transform = 'scale(0.8)';
                icon.style.backgroundImage = downloadIcon;
                icon.style.backgroundRepeat = 'no-repeat';
                icon.style.backgroundSize = '100% 100%';
                icon.style.backgroundPosition = 'center';
                const videoCard = card.querySelector('a.bili-dyn-card-video');
                // console.log("videoCard: ", videoCard);
                const descTitle = card.querySelector("div.dyn-card-opus div[data-url]");
                // console.log("descTitle: ", descTitle);
                let cardDynId, cardBvid;
                if (videoCard) {
                    cardBvid = videoCard.href.match(/BV[a-z|A-Z|0-9]{10}/g)[0];
                }
                if (descTitle) {
                    cardDynId = descTitle.getAttribute("data-url").match(/\/(\d+)$/)?.[1];
                }
                // console.log("cardDynId: ", cardDynId, ", cardBvid: ", cardBvid);
                let text = document.createElement('span');
                text.textContent = ((cardDynId && GM_getValue('bog-dl-' + cardDynId, false)) || (cardBvid && GM_getValue('bog-dl-' + cardBvid, false))) ? '已下载' : '下载';
                span.appendChild(icon);
                span.appendChild(text);
                downloadButton.appendChild(span);
                buttonBar.appendChild(downloadButton);
                downloadButton = buttonBar.getElementsByClassName('download-button')[0];
                downloadButton.addEventListener('mouseover', function(event) {
                    this.querySelector('i').style.backgroundImage = downloadIcon;
                    // console.log('over');
                });
                downloadButton.addEventListener('mouseout', function(event) {
                    this.querySelector('i').style.backgroundImage = downloadIcon;
                    // console.log('out');
                });
                downloadButton.addEventListener('click', async function(event) {
                    // console.log('click');
                    event.preventDefault();
                    const content = this.closest('div.bili-dyn-item__main');
                    // console.log(content);
                    const opusCard = content.querySelector('div.dyn-card-opus');
                    // console.log("opusCard: ", opusCard);
                    const videoCard = content.querySelector('a.bili-dyn-card-video');
                    // console.log(videoCard);
                    let dynId;
                    if (opusCard) {
                        dynId = opusCard.$log?.click.value.card_id;
                    } else if (videoCard) {
                        dynId = videoCard.$log?.click.value.card_id;
                    }
                    // console.log("dynamic id: ", dynId);
                    await handleDynamicDownload(dynId, this.querySelector('span'));
                    /*const list = content.querySelectorAll('div.bili-album__preview__picture,div.preview__picture__img.b-img');
                    // console.log(list);
                    if (list.length > 0) {
                        for (let j = 0; j < list.length; j++) {
                            let imgUrl;
                            if (list[j].querySelector('img')) {
                                imgUrl = list[j].querySelector('img').src.split(/@/)[0];
                            } else {
                                imgUrl = list[j].style.backgroundImage.split(/"|@/)[1];
                            }
                            // console.log(imgUrl);
                            if (imgUrl.startsWith('//')) {
                                imgUrl = 'https:' + imgUrl;
                            }
                            const imgName = imgUrl.split('/')[imgUrl.split('/').length - 1];
                            // console.log(imgName);
                            GM_download(imgUrl, imgName);
                        }
                    }*/
                });
                card.addEventListener('mouseenter', checkDynDownloadedHandler);
            }
        }
    }

    function handleOpusCard(card) {
        // console.log('handleOpusCard');
        // 单篇 opus / 动态详情页的容器不一定带相册类名，用 URL 判定直接挂入口
         if (pageOpusId() || card.getElementsByClassName('bili-album').length > 0 || card.getElementsByClassName('horizontal-scroll-album').length > 0 || card.getElementsByClassName('opus-module-top__album__cover').length > 0) {
             addOpusDownloadButton(card);
         }
    }

    function handleCard(card) {
        // console.log('handleCard', card);
        if (card.getElementsByClassName('bili-album').length > 0 || card.getElementsByClassName('bili-dyn-gallery').length > 0) {
            // console.log('add download button');
            card.getElementsByClassName('bili-album__preview__picture__img').forEach((img) => {
                img.addEventListener('click', function(event) {
                    addDownloadButton(card);
                });
            });
            addDownloadButton(card);
        }
    }

    function bodyMouseOver(event) {
        // console.log('bodyMouseOver');
        if (notLoaded) {
            // console.log('not loaded');
            if (document.body.querySelector('div.bili-dyn-list')) {
                // console.log('feed');
                const cards = document.body.querySelectorAll('div.bili-dyn-list div.bili-dyn-item');
                // console.log(cards.length);
                if (cards.length > cardsTotal) {
                    // console.log('cards');
                    cardsTotal = cards.length;
                    // console.log(cardsTotal);
                    for (let i = 0; i < cardsTotal; i++) {
                        // console.log('card');
                        handleCard(cards[i])
                        // startIndex += 1;
                    }
                    if (cardsTotal > 0) {
                        notLoaded = false;
                    }
                    // document.body.removeEventListener('mouseover', bodyMouseOver);
                }
            } else if (location.pathname.startsWith('/v/topic/detail') && document.body.querySelector('div.list-view.topic-list__flow-list')) {
                const cards = document.body.querySelectorAll('div.list-view.topic-list__flow-list div.bili-dyn-item');
                // console.log(cards.length);
                if (cards.length > cardsTotal) {
                    // console.log('cards');
                    cardsTotal = cards.length;
                    // console.log(cardsTotal);
                    for (let i = 0; i < cardsTotal; i++) {
                        // console.log('card');
                        handleCard(cards[i])
                        // startIndex += 1;
                    }
                    if (cardsTotal > 0) {
                        notLoaded = false;
                    }
                    document.body.removeEventListener('mouseover', bodyMouseOver);
                }
            } else if(document.body.querySelector('div.bili-dyn-item')) {
                // console.log('found single card');
                const card = document.body.querySelector('div.bili-dyn-item');
                if (card) {
                    handleCard(card);
                    notLoaded = false;
                    // document.body.removeEventListener('mouseover', bodyMouseOver);
                }
            } else if (document.body.querySelector('div.opus-detail')) {
                // console.log('found single opus card');
                const card = document.body.querySelector('div.opus-detail');
                if (card) {
                    handleOpusCard(card);
                    notLoaded = false;
                    // document.body.removeEventListener('mouseover', bodyMouseOver);
                }
            }
        }
    }

    // 瀑布流首屏卡片常常在脚本执行后才渲染出来，仅注册 /v/topic/detail 会漏掉整页
    if (location.pathname.startsWith('/v/topic/detail')
        || location.host === 'space.bilibili.com'
        || location.host === 't.bilibili.com'
        || location.host === 'www.bilibili.com') {
        document.body.addEventListener('mouseover', bodyMouseOver);
    }
    // 首屏兜底：等接口返回后再补一次（notLoaded 为 false 时是空操作）
    setTimeout(bodyMouseOver, 1200);
    setTimeout(bodyMouseOver, 3000);

    function showModal() {
        if (document.getElementById('bog-layer')) return;
        document.addEventListener('keydown', bogModalKeydown, true);

        const layer = document.createElement('div');
        layer.id = 'bog-layer';

        const mask = document.createElement('div');
        mask.className = 'bog-mask';
        mask.addEventListener('click', bogCloseModal);

        const dialog = document.createElement('div');
        dialog.className = 'bog-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', 'bilibili 图文抓取设置');

        /* ---------- 头 ---------- */
        const hd = document.createElement('div');
        hd.className = 'bog-hd';
        const hdDot = document.createElement('span');
        hdDot.className = 'bog-hd-dot';
        const hdTitle = document.createElement('span');
        hdTitle.className = 'bog-hd-title';
        hdTitle.textContent = 'bilibili 图文抓取';
        const hdVer = document.createElement('span');
        hdVer.className = 'bog-hd-ver';
        hdVer.textContent = SCRIPT_VERSION;
        const hdClose = document.createElement('button');
        hdClose.type = 'button';
        hdClose.className = 'bog-hd-x';
        hdClose.textContent = '×';
        hdClose.title = '关闭';
        hdClose.addEventListener('click', bogCloseModal);
        hd.append(hdDot, hdTitle, hdVer, hdClose);

        const bd = document.createElement('div');
        bd.className = 'bog-bd';

        function makeSection(label) {
            const sec = document.createElement('div');
            sec.className = 'bog-sec';
            const head = document.createElement('div');
            head.className = 'bog-sec-h';
            head.textContent = label;
            const body = document.createElement('div');
            sec.append(head, body);
            bd.appendChild(sec);
            return body;
        }

        function makeField(parent, labelText, control, hint) {
            const fld = document.createElement('div');
            fld.className = 'bog-field';
            if (labelText) {
                const label = document.createElement('label');
                label.textContent = labelText;
                if (control && control.id) label.setAttribute('for', control.id);
                fld.appendChild(label);
            }
            if (control) fld.appendChild(control);
            if (hint) {
                const hintEl = document.createElement('div');
                hintEl.className = 'bog-hint';
                hintEl.textContent = hint;
                fld.appendChild(hintEl);
            }
            parent.appendChild(fld);
            return fld;
        }

        function makeSwitch(parent, id, labelText, descText, checked) {
            const row = document.createElement('div');
            row.className = 'bog-switch-row';
            const txt = document.createElement('label');
            txt.className = 'bog-switch-txt';
            txt.setAttribute('for', id);
            const label = document.createElement('div');
            label.className = 'bog-switch-label';
            label.textContent = labelText;
            txt.appendChild(label);
            if (descText) {
                const desc = document.createElement('div');
                desc.className = 'bog-switch-desc';
                desc.textContent = descText;
                txt.appendChild(desc);
            }
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'bog-switch';
            input.id = id;
            input.name = id;
            input.checked = !!checked;
            row.append(txt, input);
            parent.appendChild(row);
            return input;
        }

        function makeInput(type, id, value, extraClass) {
            const input = document.createElement('input');
            input.type = type;
            input.id = id;
            input.name = id;
            if (extraClass) input.className = extraClass;
            if (value !== undefined && value !== null) input.value = value;
            return input;
        }

        function makeMiniField(parent, labelText, input) {
            const box = document.createElement('div');
            box.className = 'bog-mini';
            const label = document.createElement('label');
            label.textContent = labelText;
            label.setAttribute('for', input.id);
            input.style.width = '100%';
            box.append(label, input);
            parent.appendChild(box);
            return box;
        }

        /* ---------- 文件名 ---------- */
        const secName = makeSection('文件名');
        const inputPicName = makeInput('text', 'dlPicName', GM_getValue('dlPicName', DEFAULT_PIC_NAME), 'bog-mono');
        const fldName = makeField(secName, '下载图片文件名', inputPicName);

        // 占位符做成可点的 chip：点一下插到光标处，比原来那段 11 行纯文本说明好查
        const chips = document.createElement('div');
        chips.className = 'bog-chips';
        ['{seq}', '{index}', '{username}', '{date}', '{original}', '{ext}'].forEach(function(token) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'bog-chip';
            chip.textContent = token;
            chip.title = '插入 ' + token;
            chip.addEventListener('click', function() {
                const start = inputPicName.selectionStart === null ? inputPicName.value.length : inputPicName.selectionStart;
                const end = inputPicName.selectionEnd === null ? inputPicName.value.length : inputPicName.selectionEnd;
                inputPicName.value = inputPicName.value.slice(0, start) + token + inputPicName.value.slice(end);
                inputPicName.focus();
                inputPicName.setSelectionRange(start + token.length, start + token.length);
            });
            chips.appendChild(chip);
        });
        fldName.appendChild(chips);
        const nameHint = document.createElement('div');
        nameHint.className = 'bog-hint';
        nameHint.textContent = '图片统一存到 下载目录/bilibili/UP主名称/ 下，模板只决定最后一层文件名。';
        fldName.appendChild(nameHint);

        makeSwitch(secName, 'dlUseSubdir', '按 UP 主建子目录', '关闭时文件名一定按模板生成；开启后改用 GM_download，部分脚本管理器会忽略文件名（TM issue #1695）', GM_getValue('dlUseSubdir', false));

        /* ---------- 下载范围 ---------- */
        const secRange = makeSection('下载范围');
        const dateRow = document.createElement('div');
        dateRow.className = 'bog-row';
        const inputSince = makeInput('date', 'listDownloadSinceDate', GM_getValue('listDownloadSinceDate', ''));
        const inputUntil = makeInput('date', 'listDownloadUntilDate', GM_getValue('listDownloadUntilDate', ''));
        inputSince.style.flex = '1';
        inputUntil.style.flex = '1';
        const rangeArrow = document.createElement('span');
        rangeArrow.textContent = '至';
        rangeArrow.className = 'bog-range-arrow';
        dateRow.append(inputSince, rangeArrow, inputUntil);
        makeField(secRange, '日期区间', dateRow, '留空＝不限。对「下载当前瀑布流」与「下载本页图文」生效，区间外的动态直接跳过。');

        const limitRow = document.createElement('div');
        limitRow.className = 'bog-row-split';
        const limitLabel = document.createElement('label');
        limitLabel.setAttribute('for', 'listDownloadLimit');
        limitLabel.className = 'bog-inline-label';
        limitLabel.textContent = '最多下载篇数';
        const inputLimit = makeInput('number', 'listDownloadLimit', GM_getValue('listDownloadLimit', ''), 'bog-num');
        inputLimit.min = '1';
        inputLimit.placeholder = '不限';
        limitRow.append(limitLabel, inputLimit);
        const fldLimit = document.createElement('div');
        fldLimit.className = 'bog-field';
        fldLimit.appendChild(limitRow);
        secRange.appendChild(fldLimit);

        /* ---------- 瀑布流 ---------- */
        const secFlow = makeSection('瀑布流');
        makeSwitch(secFlow, 'listDownloadSkipReference', '跳过转发', '瀑布流里只看原创图文', GM_getValue('listDownloadSkipReference', true));
        makeSwitch(secFlow, 'listDownloadSkipAlreadyDownloaded', '跳过已下载', '同一篇作品本轮之前下过就跳过', GM_getValue('listDownloadSkipAlreadyDownloaded', true));

        const paceField = document.createElement('div');
        paceField.className = 'bog-field';
        paceField.style.marginTop = '12px';
        const paceRow = document.createElement('div');
        paceRow.className = 'bog-row';
        const inputGap = makeInput('number', 'listDownloadSleepGapSeconds', GM_getValue('listDownloadSleepGapSeconds', 2));
        inputGap.min = '0';
        const inputRetry = makeInput('number', 'listDownloadRetryAttempsLimit', GM_getValue('listDownloadRetryAttempsLimit', 3));
        inputRetry.min = '0';
        makeMiniField(paceRow, '篇间隔（秒）', inputGap);
        makeMiniField(paceRow, '自动重试次数', inputRetry);
        paceField.appendChild(paceRow);
        const paceHint = document.createElement('div');
        paceHint.className = 'bog-hint';
        paceHint.textContent = '篇与篇之间等待的秒数；请求报错后的自动重试次数。调大可降低被风控的概率。';
        paceField.appendChild(paceHint);
        secFlow.appendChild(paceField);

        /* ---------- 底 ---------- */
        const ft = document.createElement('div');
        ft.className = 'bog-ft';
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'bog-btn bog-btn-ghost';
        cancelButton.textContent = '取消';
        cancelButton.addEventListener('click', bogCloseModal);
        const okButton = document.createElement('button');
        okButton.type = 'button';
        okButton.className = 'bog-btn bog-btn-primary';
        okButton.textContent = '保存';
        okButton.addEventListener('click', function() {
            const numOr = function(raw, dflt) {
                const n = Number(raw);
                return (raw === '' || !isFinite(n)) ? dflt : Math.round(n);
            };
            GM_setValue('dlPicName', document.getElementById('dlPicName').value);
            GM_setValue('dlUseSubdir', document.getElementById('dlUseSubdir').checked);
            GM_setValue('listDownloadSkipReference', document.getElementById('listDownloadSkipReference').checked);
            GM_setValue('listDownloadSkipAlreadyDownloaded', document.getElementById('listDownloadSkipAlreadyDownloaded').checked);
            GM_setValue('listDownloadRetryAttempsLimit', numOr(document.getElementById('listDownloadRetryAttempsLimit').value, 3));
            GM_setValue('listDownloadSleepGapSeconds', numOr(document.getElementById('listDownloadSleepGapSeconds').value, 2));
            GM_setValue('listDownloadSinceDate', inputSince.value || '');
            GM_setValue('listDownloadUntilDate', inputUntil.value || '');
            GM_setValue('listDownloadLimit', inputLimit.value || '');
            GM_setValue('isSet', settingVersion);
            bogCloseModal();
        });
        ft.append(cancelButton, okButton);

        dialog.append(hd, bd, ft);
        layer.append(mask, dialog);
        document.body.appendChild(layer);
    }

    function bogCloseModal() {
        const layer = document.getElementById('bog-layer');
        if (layer) layer.parentNode.removeChild(layer);
        document.removeEventListener('keydown', bogModalKeydown, true);
    }

    function bogModalKeydown(event) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            bogCloseModal();
        }
    }

    // 先把老存储里的 '{original}.{ext}' 迁移成新模板，再决定是否弹设置面板
    ensurePicNameSetting();

    if(GM_getValue('isSet', null) !== settingVersion) {
        showModal();
    }

    bodyMouseOver();

    let mutationCount = 0;
    new MutationObserver((mutationList, observer) => {
        for (const mutation of mutationList) {
            // console.log('mutation: ', mutation);
            if (mutation.type === 'childList') {
                // if (!['svg'].includes(mutation.target.tagName)) console.log(mutation.target);
                /*for (const node of mutation.addedNodes) {
                    // console.log(node.nodeType, node);
                    if (node.nodeType === 1 && Object.keys(mutation.target.getElementsByClassName('video-like')).length > 0) {
                        // console.log(mutation.target, node);
                    }
                }*/
                // 用 classList 判断：元素常有多个 class，className 全等比较会漏掉整页卡片
                if (mutation.target.tagName === 'DIV' && (mutation.target.classList.contains('bili-dyn-list__items') || mutation.target.classList.contains('content'))) {
                    // console.log('bili-dyn-list__items: ', mutation.addedNodes);
                    for (const node of mutation.addedNodes) {
                        // console.log(node);
                        handleCard(node);
                    }
                } else if (mutation.target.tagName === 'DIV' && mutation.target.parentNode?.className === 'list-view topic-list__flow-list') {
                    // console.log('topic-list__flow-list: ', mutation.addedNodes);
                    for (const node of mutation.addedNodes) {
                        // console.log(node);
                        handleCard(node);
                    }
                }
            }
        }
    }).observe(document.body, { attributes: false, childList: true, subtree: true });

    function bogEnsureDock() {
        let dock = document.getElementById('bog-dock');
        if (!dock) {
            dock = document.createElement('div');
            dock.id = 'bog-dock';
            document.body.appendChild(dock);
        }
        return dock;
    }

    function addSettingButton() {
        const dock = bogEnsureDock();
        if (document.getElementById('settingButton')) return;
        let settingButton = document.createElement('button');
        settingButton.type = 'button';
        settingButton.id = 'settingButton';
        settingButton.className = 'bog-dock-btn';
        settingButton.innerHTML = BOG_ICON_SETTINGS + '<span class="bog-dock-label">设置</span>';
        settingButton.title = '打开设置';
        settingButton.addEventListener('click', showModal);
        dock.appendChild(settingButton);
        GM_registerMenuCommand('设置', showModal, "0");
    }

    let listDownloading = false;
    let stopDownloadingList = false;
    let listDownloadingIndex = 0;

    /** 从设置读取区间与上限，写进 listFilter */
    function loadListFilter() {
        listFilter.sinceTs = parseDateInput(GM_getValue('listDownloadSinceDate', ''));
        listFilter.untilTs = parseDateInput(GM_getValue('listDownloadUntilDate', ''));
        const limitRaw = GM_getValue('listDownloadLimit', '');
        listFilter.limit = Number(limitRaw) > 0 ? Math.floor(Number(limitRaw)) : 0;
        listFilter.done = 0;
        listFilter.active = !!(listFilter.sinceTs || listFilter.untilTs || listFilter.limit);
    }

    async function downloadList(e) {
        // 空间「图文」列表页没有 bili-dyn-list 结构，走 API 枚举
        if (/^\/\d+\/upload\/opus/.test(location.pathname)) {
            return downloadOpusListByApi(this);
        }
        // console.log(this);
        if (!listDownloading && !stopDownloadingList) {
            loadListFilter();
            listDownloading = true;
            listDownloadingIndex = 0;
            bogSetBtnText(this, '停止下载');
            // 上游这里写的是 this.disable（少个 d，并未真正禁用按钮）。
            // 这个笔误恰好让「再点一次 = 停止」可用，改成 disabled 会废掉停止入口，故保留。
            this.disable = true;
            let retryAttempts = 0;
            let idleRounds = 0;
            let lastCardsTotal = 0;
            while(!stopDownloadingList) {
                // 暂停时停在这里，不继续往下翻页、不拉新的一篇
                await bogPauseGate();
                if (listFilter.limit && listFilter.done >= listFilter.limit) {
                    bogSetBtnText(this, '已达上限 ' + listFilter.limit + ' 篇');
                    stopDownloadingList = true;
                    break;
                }
                const selfListDom = document.body.querySelector('div.bili-dyn-list');
                if (selfListDom) {
                    // console.log(selfListDom);
                    const contentDoms = selfListDom.querySelectorAll('div.bili-dyn-item__main');
                    bogSetBtnText(this, '停止下载 · 第 ' + (listDownloadingIndex + 1) + ' 个');
                    const contentDom = contentDoms[listDownloadingIndex];
                    if (contentDom) {
                        contentDom.scrollIntoView();
                        // console.log(contentDom);
                        const alreadyDownloaded = checkDynDownloaded(contentDom);
                        const downloadButton = contentDom.querySelector('div.download-button span');
                        if (downloadButton && ((!alreadyDownloaded) || (!GM_getValue('listDownloadSkipAlreadyDownloaded', true) && alreadyDownloaded)) && !(GM_getValue('listDownloadSkipReference', true) && contentDom.querySelector('div.reference'))) {
                            const opusCard = contentDom.querySelector('div.dyn-card-opus');
                            // console.log("opusCard: ", opusCard);
                            const videoCard = contentDom.querySelector('a.bili-dyn-card-video');
                            // console.log(videoCard);
                            let dynId;
                            if (opusCard) {
                                dynId = opusCard.$log?.click.value.card_id;
                            } else if (videoCard) {
                                dynId = videoCard.$log?.click.value.card_id;
                            }
                            // console.log(dynId);
                            if (dynId) {
                                const downloadSuccess = await handleDynamicDownload(dynId, downloadButton);
                                if (downloadSuccess === 'skip') {
                                    retryAttempts = 0;
                                } else if (downloadSuccess) {
                                    listFilter.done += 1;
                                    retryAttempts = 0;
                                } else {
                                    if (retryAttempts < GM_getValue('listDownloadRetryAttempsLimit', 3)) {
                                        listDownloadingIndex -= 1;
                                        retryAttempts += 1;
                                    } else if (confirm(`出现错误${e.message}，已重试 ${retryAttempts} 次，还要继续吗？\n“确定” —— 跳过（一般是接口限制了，建议跳过，手动下载保存。B站真的很严格；\n“取消” —— 停止）`)) {
                                        // listDownloadingIndex -= 1;
                                        // retryAttempts += 1;
                                        retryAttempts = 0;
                                    } else {
                                        stopDownloadingList = true;
                                    }
                                }
                            }
                            await sleep(GM_getValue('listDownloadSleepGapSeconds', 3));
                        } else {
                            await sleep(0.3);
                        }
                        listDownloadingIndex += 1;
                    } else {
                        // 当前已渲染的卡片处理完了：继续向下滚动，让瀑布流加载更多
                        if (contentDoms.length > lastCardsTotal) {
                            lastCardsTotal = contentDoms.length;
                            idleRounds = 0;
                        } else {
                            idleRounds += 1;
                        }
                        if (idleRounds >= 4) {
                            stopDownloadingList = true;
                        } else {
                            window.scrollTo(0, document.body.scrollHeight);
                            await sleep(1.5);
                        }
                    }
                } else {
                    stopDownloadingList = true;
                }
            }
            listDownloading = false;
            stopDownloadingList = false;
            retryAttempts = 0;
            listFilter.active = false;
            bogSetBtnText(this, '下载当前瀑布流');
            this.disabled = false;
        } else if (listDownloading && !stopDownloadingList) {
            stopDownloadingList = true;
            bogSetBtnText(this, '正在停止…');
        }
    }

    /**
     * 空间「图文」列表页批量下载：
     * 先用 opus/feed/space 枚举全部作品（无需反复滚动），
     * 再逐篇走 detail 接口下载，天然支持日期区间与篇数上限。
     */
    async function downloadOpusListByApi(button) {
        if (listDownloading) {
            stopDownloadingList = true;
            bogSetBtnText(button, '正在停止…');
            return;
        }
        const uid = pageUid();
        if (!uid) {
            alert('无法从网址识别 UID');
            return;
        }

        loadListFilter();
        listDownloading = true;
        stopDownloadingList = false;
        const oldText = '下载本页图文';
        bogSetBtnText(button, '停止下载');

        try {
            // 1. 枚举作品列表
            const ids = [];
            const seenIds = new Set();
            let page = 1;
            let offset = '';
            for (;;) {
                if (stopDownloadingList) break;
                bogSetBtnText(button, '停止下载 · 列出 ' + ids.length + ' 篇');
                const url = OPUS_LIST_API + '?host_mid=' + uid + '&page=' + page + '&offset=' + encodeURIComponent(offset) + '&web_location=333.1387';
                const res = await oXMLHttpRequest(url, 'json');
                if (!res || res.code !== 0) {
                    alert('获取作品列表失败：' + (res && res.message ? res.message : '未知错误'));
                    break;
                }
                const data = res.data || {};
                const items = data.items || [];
                for (const it of items) {
                    const id = String(it.opus_id || '');
                    if (id && !seenIds.has(id)) {
                        seenIds.add(id);
                        ids.push(id);
                    }
                }
                if (!data.has_more || !items.length || !data.offset) break;
                offset = data.offset;
                page += 1;
                await sleep(0.8);
            }

            // 2. 逐篇下载（倒序列表，从旧到新需要先反序？保持页面顺序即可）
            let index = 0;
            for (const opusId of ids) {
                if (stopDownloadingList) break;
                if (listFilter.limit && listFilter.done >= listFilter.limit) break;
                await bogPauseGate();
                index += 1;
                bogSetBtnText(button, '停止下载 ' + index + '/' + ids.length);
                const result = await handleDynamicDownload(opusId, null);
                if (result === true) {
                    listFilter.done += 1;
                }
                await sleep(GM_getValue('listDownloadSleepGapSeconds', 3));
            }
            bogSetBtnText(button, '已下 ' + listFilter.done + ' 篇');
        } catch (err) {
            console.error(err);
            alert('批量下载出错：' + err.message);
        } finally {
            listDownloading = false;
            stopDownloadingList = false;
            listFilter.active = false;
            setTimeout(function() {
                bogSetBtnText(button, oldText);
                button.disabled = false;
            }, 2000);
        }
    }

    function addListDownloadButton() {
        const dock = bogEnsureDock();
        if (document.getElementById('listDownloadButton')) return;
        let listDownloadButton = document.createElement('button');
        listDownloadButton.type = 'button';
        listDownloadButton.id = 'listDownloadButton';
        listDownloadButton.className = 'bog-dock-btn is-primary';
        listDownloadButton.innerHTML = BOG_ICON_DOWNLOAD + '<span class="bog-dock-label">下载当前瀑布流</span>';
        listDownloadButton.style.display = 'none';
        listDownloadButton.addEventListener('click', downloadList);
        dock.insertBefore(listDownloadButton, dock.firstChild);
    }

    function showListDownloadButton() {
        const isDynamicPage = ((window.location.host === 'space.bilibili.com') && /^\/\d+\/dynamic/.test(window.location.pathname)) || ((window.location.host === 't.bilibili.com') && (window.location.pathname === '/'));
        // 空间「图文」列表页：结构不同，走 API 枚举（见 downloadOpusListByApi）
        const isOpusListPage = (window.location.host === 'space.bilibili.com') && /^\/\d+\/upload\/opus/.test(window.location.pathname);
        const listDownloadButton = document.getElementById('listDownloadButton');
        if (listDownloadButton) {
            if (isDynamicPage) {
                bogSetBtnText(listDownloadButton, '下载当前瀑布流');
                listDownloadButton.style.display = '';
            } else if (isOpusListPage) {
                bogSetBtnText(listDownloadButton, '下载本页图文');
                listDownloadButton.style.display = '';
            } else {
                listDownloadButton.style.display = 'none';
            }
        }
    }

    const pushState = history.pushState;
    const replaceState = history.replaceState;

    history.pushState = function() {
        pushState.apply(history, arguments);
        // console.log('Pathname changed:', window.location);
        showListDownloadButton();
    };

    history.replaceState = function() {
        replaceState.apply(history, arguments);
        // console.log('Pathname changed:', window.location);
        showListDownloadButton();
    };

    addSettingButton();
    addListDownloadButton();
    showListDownloadButton();

    // 单篇 opus / 动态详情页：容器类名不稳定，用轻量轮询确保入口一定出现
    if (pageOpusId()) {
        let opusTries = 0;
        const opusTimer = setInterval(function() {
            opusTries += 1;
            if (document.getElementById('opusDownloadButton') || opusTries > 30) {
                clearInterval(opusTimer);
                return;
            }
            addOpusDownloadButton(document.body);
        }, 1000);
    }
})();
