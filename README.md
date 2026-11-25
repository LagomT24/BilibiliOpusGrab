# Bilibili 空间图文原图爬虫

抓取 B 站用户空间「图文」（`space.bilibili.com/<uid>/upload/opus`）下的**全部原图**，
按 `日期 + 序号` 命名保存。

## 命名规则

```
images/
  2021.08.02 (1).jpg
  2021.08.02 (2).png
  2021.08.05 (1).jpg
  ...
  2026.10.26 (1).jpg   ← 同一天有两篇，序号跨作品连续累加
  2026.10.26 (6).jpg
```

- 日期取作品的发布时间（北京时间）。
- 同一天有多篇作品时，按发布时间从早到晚依次编号，**不会重名**。
- 文件名一旦分配就记录在 `data/manifest.json` 中，后续增量不会打乱已有文件。
- 同一张图在同一天被多次引用只存一份；若在**不同日期**再次发布，会按当天日期另存一份，
  保证每个日期目录下都是该篇作品的完整图片。

## 安装

```bash
pip install -r requirements.txt
```

## 使用

```bash
# 先看统计，不下载
python crawl.py --dry-run

# 正式下载（默认 UID 2394319，2021-08-01 之后，存到 images/）
python crawl.py

# 常用参数
python crawl.py --uid 2394319 --since 2021-08-01 --until 2024-12-31
python crawl.py --out D:/pics --workers 6 --delay 0.2
python crawl.py --limit 20            # 只跑最近 20 篇，先看效果

# 可选：粘贴浏览器 Cookie，风控更宽松（不填也能跑）
python crawl.py --cookie "SESSDATA=xxx; bili_jct=yyy"
```

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--uid` | `2394319` | 目标用户 UID |
| `--since` | `2021-08-01` | 起始日期（含） |
| `--until` | 不限 | 结束日期（含） |
| `--out` | `images` | 图片保存目录 |
| `--data` | `data` | 缓存 / 清单目录 |
| `--workers` | `4` | 下载并发数 |
| `--delay` | `0.3` | 请求最小间隔（秒） |
| `--limit` | 不限 | 最多处理多少篇 |
| `--cookie` | 空 | 追加浏览器 Cookie（**不填也能跑**） |
| `--max-risk` | `5` | 连续风控多少次后中止本轮（0=不中止） |
| `--strict-size` | 关 | 字节数与接口记录不一致就判失败（默认只校验分辨率） |
| `--dry-run` | 关 | 只统计、预览文件名，不下载 |
| `--refresh` | 关 | 忽略缓存重新抓取 |

## 实现要点

1. **列表**：`x/polymer/web-dynamic/v1/opus/feed/space`，20 条/页，按时间倒序翻页。
2. **详情**：`x/polymer/web-dynamic/v1/opus/detail`，带 **WBI 签名** + `buvid3/buvid4` cookie。
   - `buvid3/buvid4` 是从 `x/frontend/finger/spi` **匿名领取的设备标识**，不是登录凭证；
     `nav` 接口未登录（`-101`）也会返回 WBI 密钥，所以**全程不需要 SESSDATA**。
   - 实测不带签名约 100 次请求后返回 `-352` 风控；带签名 0.25s 间隔可稳定跑。
   - 直接抓 `www.bilibili.com/opus/{id}` 网页在数百次后会 `412`，故不使用。
   - 连续 `--max-risk` 次仍被风控就中止本轮并存盘，稍后重跑自动续传（比硬顶更不容易把 IP 封久）。
3. **原图判定**：以**分辨率**为准，而不是字节数。
   - 图片 URL 去掉 CDN 的 `@xxx` 压缩后缀，下载时也不声明 `avif/webp`，
     拿到的就是网页上「查看大图」那一档，不会存成页面展示用的 `.avif`。
   - 下载后用纯 Python 解析 JPEG/PNG/GIF/WebP 头，宽高必须与接口的 `width/height` 一致。
   - 接口的 `size`(KB) 是**上传时的旧元数据**：约 13% 的历史图片 B 站 CDN 已重编码
     （实测 `@100q.png` 与默认版本 PSNR=∞，像素完全相同，说明真原图字节已不存在）。
     这类图仍会保存（分辨率一致），并记录到 `data/recompressed.json`。
4. **断点续传**：详情 JSON 缓存在 `data/opus/`，已存在的图片直接跳过。
   中断后重跑只会补缺失部分。

## 目录结构

```
crawl.py
requirements.txt
data/                 # 本地状态（不入库）
  list.json           # 作品列表
  opus/<id>.json      # 每篇的详情原始响应
  manifest.json       # (日期 + 图片 URL) -> 文件名 映射
  failed.json         # 详情抓取失败的篇目
  failed_pics.json    # 下载失败的图片
  recompressed.json   # 分辨率一致但被 CDN 重编码过的图片清单
images/               # 下载的图片（不入库）
```

## 注意事项

- 仅用于备份**自己有权保存**的公开内容，请遵守 B 站用户协议，勿高频请求。
- 不需要登录 Cookie；若遇到频繁风控，可加大 `--delay` 或粘贴自己的 Cookie。
- 极少数「充电专属」或已删除作品会抓取失败，记录在 `data/failed.json`，不会中断任务。
- 单篇最多实测 17 张图；纯文字作品自动跳过。
