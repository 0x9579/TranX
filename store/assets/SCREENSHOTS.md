# 商店截图

**不要**把大尺寸宣传图放进 `extension/`，以免增大安装包。

---

## 可直接上传（已处理为标准尺寸）

优先使用：

```text
store/assets/chrome-1280x800/
```

| 文件 | 内容 | 尺寸 |
|------|------|------|
| `01-hover-english.png` | 英语悬停释义 | **1280×800** |
| `02-hover-english-alt.png` | 英语悬停（另一例） | 1280×800 |
| `03-hover-english-saved.png` | 英语已收藏状态 | 1280×800 |
| `04-hover-japanese-line.png` | 日语整行翻译 | 1280×800 |
| `05-popup-vocab-list.png` | 生词本弹窗 | 1280×800 |
| `06-popup-settings.png` | 设置页 | 1280×800 |

备用（小图）：`store/assets/chrome-640x400/`（同样 6 张，**640×400**）。

处理方式：等比例缩放后居中，深色背景 `#0F1419` 填充；弹窗小图略放大并加浅阴影，避免糊在角落。

---

## 原始截图（未标准化）

本目录下 `example-*.png`、`list.png`、`settings.png` 为原始素材，**勿直接上传**商店。

---

## 建议规格（商店官方）

以 [Chrome Web Store 图片要求](https://developer.chrome.com/docs/webstore/images) 为准：

| 项目 | 要求 |
|------|------|
| 截图 | **1280×800**（优先）或 640×400 |
| 格式 | PNG 或 JPEG |
| 数量 | 至少 1 张，建议 3–5 张 |

---

## 小图 / 图标

| 用途 | 来源 |
|------|------|
| 商店与扩展图标 128 | `extension/icons/icon128.png` |
