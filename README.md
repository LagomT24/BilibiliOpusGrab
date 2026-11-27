# BilibiliOpusGrab · bilibili 图文抓取

**[→ 一键安装油猴脚本](https://raw.githubusercontent.com/LagomT24/BilibiliOpusGrab/main/bilibili-opus-grab.user.js)** · 需先安装 [Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey

批量抓取 B 站「图文」（动态瀑布流、空间图文列表、单篇 opus）里的**全部原图**，按日期 + 序号命名保存。

项目提供两种形态，共用同一套接口逻辑：

| 形态 | 文件 | 适用场景 |
| --- | --- | --- |
| 油猴脚本 | `bilibili-opus-grab.user.js` | 浏览时随手下载单篇或整页列表，免登录、免部署 |
| Python 爬虫 | `bilibili_opus_grab.py` | 本地大批量备份，带断点续传与分辨率校验 |

> 只处理图片。视频、直播、专栏、番剧不在功能范围内。

**当前版本：1.0.1** — 界面改版版。脚本入口从页面左边缘的三个灰按钮收成**右上角**一个悬浮胶囊，设置面板重做分组与控件，下载队列支持**暂停 / 继续 / 取消**，并从胶囊下方依次向下排列。功能逻辑与 0.9.0 一致，未新增设置项。

## 支持的页面

| 页面 | 可用入口 |
| --- | --- |
| `space.bilibili.com/<uid>/upload/opus` | 右上角「下载本页图文」，按日期区间 + 篇数上限批量抓取 |
| `space.bilibili.com/<uid>/dynamic`、`t.bilibili.com/?tab=all` | 右上角「下载当前瀑布流」，自动滚动加载后续内容 |
| `www.bilibili.com/opus/<id>`、`t.bilibili.com/<id>`、`www.bilibili.com/v/topic/detail` | 单篇下载按钮（优先挂在 tab 栏；无 tab 栏时退化为左侧固定按钮） |

## 目录结构

```
bilibili-opus-grab/                # 仓库根目录（GitHub: BilibiliOpusGrab）
├── bilibili-opus-grab.user.js     # 油猴脚本（1.0.1）
├── bilibili_opus_grab.py          # 命令行爬虫
├── requirements.txt               # Python 依赖
├── README.md
├── LICENSE                        # MIT 许可全文（含原作者版权声明）
├── .gitignore
├── data/                          # 运行期状态，本地生成，不入库
│   ├── list.json                  # 作品列表
│   ├── opus/<id>.json             # 每篇详情原始响应（断点续传用）
│   ├── manifest.json              # (日期 + 图片 URL) -> 文件名
│   ├── failed.json                # 详情抓取失败的篇目
│   ├── failed_pics.json           # 下载失败的图片
│   └── recompressed.json          # 被 CDN 重编码过的图片清单
├── images/                        # Python 默认输出目录，本地生成，不入库
```

`data/`、`images/`、`__pycache__/` 都在 `.gitignore` 中，不会被提交。

## 安装

### 油猴脚本

1. 浏览器安装用户脚本管理器：[Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey。

2. 安装脚本，任选一种：

   **一键安装**——直接点这个链接：

   https://raw.githubusercontent.com/LagomT24/BilibiliOpusGrab/main/bilibili-opus-grab.user.js

   管理器会拦截以 `.user.js` 结尾的地址并弹出安装页，确认后点「安装」。

   **手动安装**——克隆仓库后把 `bilibili-opus-grab.user.js` 拖进浏览器窗口；或在管理器面板「添加新脚本」里用文件内容覆盖编辑器后保存。

3. 首次安装或版本升级后会弹出设置面板（`settingVersion = 6`），确认文件名模板即可开始使用。
4. 若此前装过同类脚本或旧版本（`@namespace` 不同），请先在管理器里删除旧条目，避免两份脚本同时挂载、重复生成按钮。

脚本头部声明了 `@downloadURL` 与 `@updateURL`，都指向本仓库 `main` 分支的原始文件，因此管理器会自行检查更新，无需重新手动下载。raw 地址有 CDN 缓存，新版本推送后可能需要几分钟才可见。仓库必须是 **public**，否则原始文件链接需要登录，管理器取不到内容。

### Python 爬虫

需要 Python 3.9+：

```bash
git clone https://github.com/LagomT24/BilibiliOpusGrab.git
cd bilibili-opus-grab
pip install -r requirements.txt
```

> 仓库改名过渡期间，如果上面的地址 404，请改用旧地址
> `https://github.com/LagomT24/Bilibili_Updates_Crawler.git`，内容一致。

## 使用

### 油猴脚本

打开受支持的页面，页面加载完成后点击右上角悬浮胶囊里的按钮即可，下载进度以卡片形式依次排在胶囊下方。

- **暂停 / 继续**：在队列标题栏点「暂停」。暂停只拦还没发出去的请求，已经在传的那一两张会跑完（避免存下半截文件），恢复后按序继续。
- **取消**：点「取消」结束本轮全部下载——排队中的任务直接作废，正在传的中止，队列清空。单张失败时卡片上还有「重试」。
- **单张取消**：每张图片卡片右侧的 `×` 只中止那一张。

暂停与取消都放在队列标题栏里，不额外占用界面位置。

设置面板（管理器的「设置」菜单，或首次安装时自动弹出）中与图文抓取相关的选项：

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| 下载图片文件名 | `{username} {YYYY}.{MM}.{DD} ({seq}).{ext}` | 命名模板，可用占位符见下节 |
| 按 `bilibili/UP主名称/` 子目录保存 | 关 | 开启后改用 `GM_download` 建子目录，但部分管理器/浏览器会忽略文件名（TM issue #1695）；关闭时平铺保存，文件名一定按模板生成 |
| 下载日期区间 | 空（不限） | 对「下载当前瀑布流」与「下载本页图文」生效，区间外直接跳过 |
| 最多下载篇数 | 空（不限） | 达到上限自动停止 |
| 跳过转发 | 开 | 瀑布流中跳过纯转发动态，只看原创图文 |
| 跳过已下载 | 开 | 同一篇作品在本轮之前已下过就跳过 |
| 连续下载的间隔时间（秒） | 2 | 篇与篇之间的等待时间，用于规避 API 限流 |
| 自动重试次数 | 3 | 单篇请求报错后的重试次数 |

脚本自身对图片请求做了限流：并发 2、每次请求间隔 300–550 ms 抖动，API 请求串行，命中风控会冷却重试。

### Python 爬虫

```bash
# 只统计数量与预览文件名，不下载
python bilibili_opus_grab.py --dry-run

# 正式下载（默认 UID 2394319，2021-08-01 之后，存到 images/）
python bilibili_opus_grab.py

# 指定区间与输出目录
python bilibili_opus_grab.py --uid 2394319 --since 2021-08-01 --until 2024-12-31
python bilibili_opus_grab.py --out D:/pics --workers 6 --delay 0.2

# 只跑最近 20 篇，先看效果
python bilibili_opus_grab.py --limit 20

# 可选：粘贴浏览器 Cookie（不填也能跑，风控更宽松）
python bilibili_opus_grab.py --cookie "SESSDATA=xxx; bili_jct=yyy"
```

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--uid` | `2394319` | 目标用户 UID |
| `--since` | `2021-08-01` | 起始日期（含），`YYYY-MM-DD` |
| `--until` | 不限 | 结束日期（含） |
| `--out` | `images` | 图片保存目录 |
| `--data` | `data` | 缓存 / 清单目录 |
| `--workers` | `4` | 下载并发数 |
| `--delay` | `0.3` | 请求最小间隔（秒） |
| `--limit` | 不限 | 最多处理多少篇 |
| `--cookie` | 空 | 追加浏览器 Cookie（**不填也能跑**） |
| `--max-risk` | `5` | 连续风控多少次后中止本轮（0 = 不中止） |
| `--strict-size` | 关 | 字节数与接口记录不一致即判失败（默认只校验分辨率） |
| `--dry-run` | 关 | 只统计、预览文件名，不下载 |
| `--refresh` | 关 | 忽略缓存，重新抓列表与详情 |

## 命名规则

### 油猴脚本

默认模板 `{username} {YYYY}.{MM}.{DD} ({seq}).{ext}`，产出形如：

```
花久花酒 2026.10.19 (1).png
花久花酒 2026.10.19 (2).png
```

可用占位符：

| 占位符 | 含义 |
| --- | --- |
| `{username}` / `{userid}` | UP 主昵称 / UID |
| `{dynamicid}` | 动态 id |
| `{date}` / `{YYYY}` `{MM}` `{DD}` | 发布日期（按浏览器本地时区） |
| `{HH}` `{mm}` `{ss}` | 发布时刻 |
| `{seq}` | **当日**第几张，跨作品连续累加，取号即消耗 |
| `{index}` | 当前作品内的图片序号，从 1 开始 |
| `{original}` | CDN 原文件名（已去掉 `@xxx` 压缩后缀） |
| `{ext}` | 图片扩展名，按 URL 白名单判定 |
| `{content}` | 正文前 25 个字符 |

- 文件名一旦分配，就以「日期 + 原图 URL」为键记入管理器存储（`bog-map-<uid>`），重跑时复用，序号不会一路膨胀。
- 同一篇里的重复图片只下一次；同一张图若在**不同日期**再次发布，按当天日期另存一份。

### Python 爬虫

Python 侧只按 `{date} ({n}).{ext}` 命名，不含用户名（输出目录已按用户区分）：

```
images/
  2021.08.02 (1).jpg
  2021.08.02 (2).png
  2021.08.05 (1).jpg
  ...
  2026.10.26 (1).jpg   ← 同一天有两篇，序号跨作品连续累加
  2026.10.26 (6).jpg
```

- 日期按北京时间（UTC+8）取作品发布时间。
- 命名映射写入 `data/manifest.json`，增量运行不会打乱已有文件；目录里已存在的同名文件也会参与避让。

## 实现要点

1. **列表**：`x/polymer/web-dynamic/v1/opus/feed/space`，20 条/页，按时间倒序翻页。该接口只返回 `opus_id` 与封面，没有 `pub_ts`，所以日期区间需逐篇取详情判断。
2. **详情**：`x/polymer/web-dynamic/v1/detail?id=<opus_id>`（Python 侧为 `opus/detail`），带 WBI 签名。
   - 图文数据有两条分支：`major.opus.pics` 与 `major.draw.items`（`DYNAMIC_TYPE_DRAW` 时 `major.opus` 为 `null`），两者都要做空值保护。
   - `buvid3/buvid4` 是从 `x/frontend/finger/spi` 匿名领取的设备标识，不是登录凭证；`nav` 未登录也会返回 WBI 密钥，因此**全程不需要 SESSDATA**。
   - 实测不带签名约 100 次请求后返回 `-352` 风控；带签名 0.25 s 间隔可稳定跑。直接抓 `www.bilibili.com/opus/{id}` 网页在数百次后会 `412`，故不使用。
3. **原图判定**：以**分辨率**为准，而不是字节数。
   - URL 统一 `https`、去 query、去掉 CDN 的 `@xxx` 压缩后缀，下载时也不声明 `avif/webp`，拿到的就是网页「查看大图」那一档。
   - Python 侧下载后解析 JPEG/PNG/GIF/WebP 头，宽高必须与接口的 `width/height` 一致。
   - 接口的 `size`(KB) 是上传时的旧元数据：约 13% 的历史图片已被 CDN 重编码（实测 `@100q.png` 与默认版本像素完全相同，真原图字节已不存在）。这类图仍会保存并记入 `data/recompressed.json`。
4. **下载**（油猴）：`GM_xmlhttpRequest` 取 blob → `URL.createObjectURL` → `<a download>`。`GM_download` 在部分管理器下会忽略 `name`，导致文件名退回 CDN 原名，因此默认走扁平保存。
5. **断点续传**（Python）：详情 JSON 缓存在 `data/opus/`，已存在的图片直接跳过；中断后重跑只补缺失部分。

## 注意事项与已知限制

- 仅用于备份**自己有权保存**的公开内容，请遵守 B 站用户协议，勿高频请求。
- 不需要登录 Cookie；遇到频繁风控可加大 `--delay`，或临时粘贴自己的 Cookie。
- 极少数「充电专属」、已删除或纯文字作品会跳过，失败的篇目记入 `data/failed.json`，不中断任务。
- 子目录保存依赖脚本管理器的 `GM_download` 行为，可能丢文件名。1.0.0 已在设置里把两种模式的差异写清楚，默认仍是关闭（平铺保存）。
- 日期以浏览器本地时区计算（脚本）/ 北京时间（Python），跨时区使用时注意差异。

## 版本记录

- **1.0.1**（当前）
  - 悬浮入口与下载队列移至**右上角**，队列从胶囊下方依次向下排列（原为左下角、向上堆叠）。
  - 队列卡片按键重排为「文件名 → 百分比 → 重试 → ×」：百分比拆成独立列不再挤在文件名里，失败态「重试」改为描边按钮，`×` 固定在最右端。
  - 补充 `@homepageURL`、`@supportURL`、`@downloadURL`、`@updateURL`：管理器列表可直达仓库与反馈，并支持从 GitHub 原始文件一键安装、自动检查更新。
  - 文档：README 位置描述同步为右上角；补充 MIT 归属声明与 `LICENSE`。
- **1.0.0**
  - 界面改版：左侧三个贴边灰按钮收为左下角悬浮胶囊，设置面板重做，下载队列改为卡片式堆叠。
  - 下载队列新增**暂停 / 继续 / 取消**，全部集成在队列标题栏，未新增任何常驻按钮。
  - 主题变量收敛到 `#bog-dock` / `#bog-queue` / `#bog-layer`，不向宿主页面写 `:root`；跟随 B 站深色模式。
  - 设置面板按「文件名 / 下载范围 / 瀑布流」分组，checkbox 改为开关控件，占位符做成可点击插入。
  - 修复：篇间隔或重试次数留空时会被存成 0，等于不等待直接连发；现在留空回落默认值。
  - 所有设置项 `id` 与存储键保持不变，老用户的配置直接沿用。
- **0.9.0**
  - 支持空间图文列表页、动态瀑布流、单篇 opus 三类页面。
  - 新增日期区间与篇数上限；默认命名 `{username} {date} ({seq}).{ext}`。
  - 实现原图 URL 规范化与命名映射，修复下载文件名退回 UUID 的问题。
  - 移除视频下载功能与相关 `@connect`、`@match`，项目独立发版。
  - 收尾：统一名称与仓库结构，清理过时文件与配置。

## 致谢与许可

本项目油猴脚本在 **owendswang** 的 [《下载Bilibili动态页面图片和视频》](https://greasyfork.org/scripts/421885) v1.3.0 基础上扩展而来，沿用其部分界面结构与下载逻辑。

原脚本版权归 owendswang 所有（`Copyright (c) 2021 owendswang`），以 MIT 许可发布。本项目依照 MIT 的条件使用其代码，即保留上述版权声明与许可声明；脚本头部以 `@original-script` 标注来源，完整许可文本见仓库根目录 `LICENSE`。

原脚本 v1.3.0 因捆绑 ffmpeg.wasm（核心为 GPL-2.0-or-later）而整体按 GPL-2.0 分发。本项目已移除视频下载功能及全部 ffmpeg 依赖，不再包含该部分代码，仅保留原作者以 MIT 发布的部分，因此继续以 **MIT** 许可发布。
