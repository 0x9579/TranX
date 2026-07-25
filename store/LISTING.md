# Chrome 网上应用店 — 列表文案

提交商店后台时，将对应字段复制粘贴即可。可按审核反馈微调。

**manifest 当前版本：** 见 `extension/manifest.json`（撰写时为 1.3.2）

---

## 基本信息

| 字段 | 建议填写 |
|------|----------|
| **名称（中文）** | TranX — X 悬浮词典 |
| **名称（英文，可选）** | TranX — Hover Dictionary for X |
| **语言** | 中文（简体）为主；可另加 English 语言包文案（见文末） |
| **类别** | 生产力工具（Productivity）或 社交与通讯 → 以商店可选类目为准，优先 **生产力** |
| **开发者邮箱** | （填写你接收审核通知的邮箱） |
| **官网 / 主页（可选）** | 仓库或项目页 URL（若有） |
| **支持网址（可选）** | Issues / 邮箱 / 文档 URL |

名称注意：商店对商标词（如 Twitter / X）偶有审核敏感；若被拒可改为：

- `TranX — 推文悬浮词典`
- `TranX 悬浮查词`

---

## 简短描述（Short description）

限制约 **132 字符**（以商店后台为准）。

### 中文（推荐）

```text
在 X 上悬停查看英语中文释义，点击收藏生词；日韩支持整行翻译。本地生词本，简洁无账号。
```

（约 48 字，可再补功能点）

### 备选（更偏功能）

```text
X/Twitter 悬浮词典：英语查词与生词本，日语/韩语整行译中。仅在帖子内工作，中文不误触。
```

### English (optional locale)

```text
Hover dictionary on X/Twitter: English→Chinese glosses & vocab list; JA/KO full-line translate. Local-only, no account.
```

---

## 详细描述（Detailed description）

### 中文

```text
TranX 是面向 X（Twitter）的浏览器扩展：在浏览英文（及日/韩）内容时，用悬停即可查看中文解释，并把生词轻轻点进本地生词本。

【主要功能】
• 英语悬浮查词：鼠标停在单词上显示中文释义（可显示词性、音标）
• 点击收藏：左键点击英语单词加入/移出生词本（只保存词形，释义打开时再查）
• 日语 / 韩语：识别后对当前视觉「整行」做中文翻译（不拆词）
• 中文永不触发：避免在中文帖子里误弹气泡
• 卡片空白处点击：正常进入帖子，不拦路
• 显示更多、点赞、时间戳、用户名等：不拦截
• 设置：取词语言（英语/韩语/日语/自动）、悬浮延迟、音标与词性等
• 生词本：搜索、删除、清空；导出/导入 JSON（便于备份）

【适合谁】
• 经常刷英文 X 时间线、想顺手查词的中文用户
• 需要简单生词收集、不想注册查词账号的人

【隐私简述】
• 不要求登录 TranX 账号
• 生词本与设置保存在浏览器本地（或 Chrome 同步设置项）
• 查词时会向词典/翻译服务发送你当前查询的词或整行文本（详见隐私政策）
• 不会出售你的数据

【使用提示】
1. 安装后打开 x.com 或 twitter.com
2. 将鼠标悬停在英语单词上查看释义
3. 点击该单词可收藏；在扩展弹窗中管理生词本
4. 日/韩内容请在设置中选择对应语言或「自动」

如有问题或建议，请通过支持渠道联系开发者。
```

### English (optional locale)

```text
TranX is a browser extension for X (Twitter). Hover over English words for Chinese definitions, save words to a local vocab list, or translate full Japanese/Korean lines.

Features:
• English hover dictionary (Chinese glosses; optional phonetic & part of speech)
• Click to save English words only (stores the word form; definitions load on demand)
• Japanese/Korean: full visual line → Chinese translation
• Chinese text never triggers lookup
• Blank areas of a post still open the status page; likes, timestamps, “Show more” stay usable
• Local vocab book: search, delete, export/import JSON
• No TranX account required

Privacy:
Settings and vocab stay in browser storage. Lookup requests send the current word or line to dictionary/translation providers. See the privacy policy for details.

Open x.com after install, hover to look up, click English words to save.
```

---

## 商店宣传图 / 截图文案建议

截图文件放入 `assets/`，构图说明见 `assets/SCREENSHOTS.md`。

可为每张图写一句标题（后台有的区域可填）：

1. 悬浮英语单词，即时中文释义  
2. 点击单词加入本地生词本  
3. 日语 / 韩语整行翻译  
4. 生词本列表与导出  
5. 取词语言与偏好设置  

---

## 单一用途说明（Single purpose — 审核常见问题）

若后台要求「单一用途描述」：

```text
本扩展唯一用途是在 X/Twitter 网页上提供文字悬停查词/翻译，以及可选的英语生词本收藏，不包含无关的广告、挖矿或浏览劫持功能。
```
