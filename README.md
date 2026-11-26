# BilibiliOpusGrab · bilibili 图文抓取

批量抓取 B 站「图文」（动态瀑布流、空间图文列表、单篇 opus）里的**全部原图**，按日期 + 序号命名保存。

项目提供两种形态，共用同一套接口逻辑：

| 形态 | 文件 | 适用场景 |
| --- | --- | --- |
| 油猴脚本 | `bilibili-opus-grab.user.js` | 浏览时随手下载单篇或整页列表，免登录、免部署 |
| Python 爬虫 | `bilibili_opus_grab.py` | 本地大批量备份，带断点续传与分辨率校验 |

> 只处理图片。视频、直播、专栏、番剧不在功能范围内（0.9.0 已移除参考脚本自带的视频下载）。

**当前版本：0.9.0** — 功能收尾版。交互界面继续沿用上游脚本（OWENDSWANG v1.3.0）的布局，仅追加必要控件；UI 改版完成后将发布 1.0.0。

## 支持的页面

| 页面 | 可用入口 |
| --- | --- |
| `space.bilibili.com/<uid>/upload/opus` | 左下角「下载本页图文」，按日期区间 + 篇数上限批量抓取 |
| `space.bilibili.com/<uid>/dynamic`、`t.bilibili.com/?tab=all` | 左下角「下载当前瀑布流」，自动滚动加载后续内容 |
| `www.bilibili.com/opus/<id>`、`t.bilibili.com/<id>`、`www.bilibili.com/v/topic/detail` | 单篇下载按钮（优先挂在 tab 栏；无 tab 栏时退化为左侧固定按钮） |

## 目录结构

```
bilibili-opus-grab/                # 仓库根目录（GitHub: BilibiliOpusGrab）
├── bilibili-opus-grab.user.js     # 油猴脚本（0.9.0）
├── bilibili_opus_grab.py          # 命令行爬虫
├── requirements.txt               # Python 依赖
├── README.md
├── .gitignore
├── data/                          # 运行期状态，本地生成，不入库
│   ├── list.json                  # 作品列表
│   ├── opus/<id>.json             # 每篇详情原始响应（断点续传用）
│   ├── manifest.json              # (日期 + 图片 URL) -> 文件名
│   ├── failed.json                # 详情抓取失败的篇目
│   ├── failed_pics.json           # 下载失败的图片
│   └── recompressed.json          # 被 CDN 重编码过的图片清单
├── images/                        # Python 默认输出目录，本地生成，不入库
└── 下载Bilibili动态页面图片和视频.txt   # 上游参考脚本，仅本地保留，不入库
```

`data/`、`images/`、`__pycache__/` 以及参考脚本都写在 `.gitignore` 中，不会被提交。

## 安装

### 油猴脚本

1. 浏览器安装用户脚本管理器：[Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey。
2. 取得脚本，任选一种：
   - 克隆仓库后，把 `bilibili-opus-grab.user.js` 拖进浏览器窗口，管理器会自动弹出安装页；
   - 或打开管理器面板 →「添加新脚本」，用文件内容整体覆盖编辑器后保存。
3. 首次安装或版本升级后会弹出设置面板（`settingVersion = 6`），确认文件名模板即可开始使用。
4. 若此前装过上游脚本或旧版本（`@namespace` 不同），请先在管理器里删除旧条目，避免两份脚本同时挂载、重复生成按钮。

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

打开受支持的页面，页面加载完成后点击对应按钮即可；下载进度显示在右下角。

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
4. **下载**（油猴）：`GM_xmlhttpRequest` 取 blob → `URL.createObjectURL` → `<a download>`。参考脚本原先依赖的 `GM_download` 在部分管理器下会忽略 `name`，导致文件名退回 CDN 原名，因此默认走扁平保存。
5. **断点续传**（Python）：详情 JSON 缓存在 `data/opus/`，已存在的图片直接跳过；中断后重跑只补缺失部分。

## 注意事项与已知限制

- 仅用于备份**自己有权保存**的公开内容，请遵守 B 站用户协议，勿高频请求。
- 不需要登录 Cookie；遇到频繁风控可加大 `--delay`，或临时粘贴自己的 Cookie。
- 极少数「充电专属」、已删除或纯文字作品会跳过，失败的篇目记入 `data/failed.json`，不中断任务。
- 子目录保存依赖脚本管理器的 `GM_download` 行为，可能丢文件名；这是上游已知问题，UI 改版时会一并处理。
- 日期以浏览器本地时区计算（脚本）/ 北京时间（Python），跨时区使用时注意差异。

## 版本记录

- **0.9.0**（当前）
  - 支持空间图文列表页、动态瀑布流、单篇 opus 三类页面。
  - 新增日期区间与篇数上限；默认命名 `{username} {date} ({seq}).{ext}`。
  - 移植原图 URL 规范化与命名映射，修复下载文件名退回 UUID 的问题。
  - 移除参考脚本的视频下载与相关 `@connect`、`@match`，项目独立发版。
  - 收尾：统一名称与仓库结构，清理过时文件与配置。
- **1.0.0**（计划）：界面改版，随 UI 调整升版。

## 致谢与许可

油猴脚本基于 **OWENDSWANG** 的《下载Bilibili动态页面图片和视频》v1.3.0（MIT）扩展而来，保留其界面结构与大部分下载逻辑；上游参考脚本仅本地留存、不入库。本项目脚本同样以 MIT 许可发布。
