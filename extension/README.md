# TranX — X (Twitter) 悬浮词典

在 X / Twitter 浏览帖子时，**鼠标悬停**英语 / 韩语 / 日语词即可看到中文释义；**左键点击**可加入 / 移出生词本。**中文永不触发**。

![Chrome](https://img.shields.io/badge/Chrome-MV3-blue) ![Edge](https://img.shields.io/badge/Edge-支持-green)

## 功能

- **多语言**：英语按**词**查；日/韩**整行翻译**；**中文不触发**
- **生词本（仅英语）**：只存词形 + 时间，经 **`chrome.storage.sync`** 跨设备同步；列表打开时实时查释义；日/韩不可收藏
- **导出 / 导入**：精简 JSON（词 + 时间）
- **缓存分离**：查词缓存与生词本分开

## 安装（开发者模式）

1. 打开 Chrome / Edge → `chrome://extensions`（Edge：`edge://extensions`）
2. 打开 **开发者模式**
3. **加载已解压的扩展程序** → 选择本目录 **`extension`**（仓库内 `TranX/extension`，不要选仓库根目录）
4. 打开 [https://x.com](https://x.com) 试用

> 修改代码后：扩展页点 **刷新**，再刷新 X 页面。  
> 上架相关文案与素材在仓库兄弟目录 [`../store/`](../store/)，不包含在本扩展包内。

## 使用

| 操作 | 说明 |
|------|------|
| 悬停词上 | 显示中文释义（依「取词语言」设置） |
| **左键点击词上** | 拦截并收藏/取消（可配置第 N 次） |
| **点击卡片空白** | 不拦截，正常进帖 |
| 中文 | **永不取词** |
| 显示更多 / 点赞 / 时间等 | 不拦截 |
| 扩展图标 | 生词本 + 设置（含源语言） |

**生词本（弹窗默认页）**

- 搜索单词或中文释义
- 单条删除 / 清空（有确认）
- 导出 JSON / 导入 JSON（合并模式，跳过已有词）

**设置**

- **取词语言**：英语 / 韩语 / 日语 / 自动
- 总开关、悬浮延迟、音标 / 词性、英文释义（仅英语）、最短词长（主要作用于英语）
- **点击收藏**：仅拦截「点在词上」；空白处进帖
- 清除词典缓存（**不影响**生词本）

## 存储说明

| Key | 位置 | 用途 |
|-----|------|------|
| `settings` | `chrome.storage.sync` | 偏好设置 |
| `tv:<word>` | `chrome.storage.sync` | 英语生词：每词一个 key，值为收藏时间戳 |
| `tranx_dict_cache` | `chrome.storage.local` | 查词缓存（不同步），可清 |

生词本依赖 Chrome 登录同一 Google 账号并开启同步；**非实时**（通常数秒～数分钟）。软上限约 480 词。旧版 local 词库会在启动时自动迁移到 sync。

导出（v3）：

```json
{
  "version": 3,
  "app": "TranX",
  "words": [{ "w": "serendipity", "t": 1720000000000 }]
}
```

## 项目结构

```
extension/
├── manifest.json
├── background/service-worker.js   # 词典 + 生词本 API
├── content/content.js|css         # 取词、Tooltip、点击收藏
├── popup/                         # 生词本列表 + 设置
├── icons/
└── README.md
```

## 技术说明

- 取词：`document.caretRangeFromPoint` + 字母边界扩展
- 点击收藏：释义已显示且点击仍是该词时切换；忽略拖选与修饰键
- 词典请求在 service worker 中完成，避免页面 CORS

## 已知限制

- 依赖第三方词典接口可用性
- 仅拉丁字母英文词；无跨设备云同步（可用导出/导入）
- X DOM 大改时选择器可能需微调

## 许可证

MIT
