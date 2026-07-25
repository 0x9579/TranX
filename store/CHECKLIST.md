# Chrome 网上应用店上架检查清单

按顺序勾选。扩展目录为仓库中的 `extension/`，本目录 `store/` **不要**打进安装包。

---

## A. 开发者账号

- [ ] 拥有 Google 账号  
- [ ] 打开 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)  
- [ ] 完成开发者注册并支付一次性注册费（约 USD $5，以页面为准）  
- [ ] 验证联系邮箱可接收审核通知  
- [ ] （如要求）完成开发者身份/地区相关验证  

---

## B. 隐私与合规材料

- [x] 完善 [`PRIVACY.md`](./PRIVACY.md) 中的联系邮箱与项目链接  
- [x] 将隐私政策发布为 **HTTPS 公网页面**（GitHub Pages：`docs/`）  
- [x] 隐私政策 URL：`https://0x9579.github.io/TranX/privacy.html`  
- [ ] 浏览器打开上述 URL 确认可访问（Pages 首次启用可能需 1–3 分钟）  
- [ ] 阅读并确认 [`PERMISSIONS.md`](./PERMISSIONS.md) 与当前 `manifest.json` 一致  
- [ ] 确认无远程可执行代码（不 `eval` 远程脚本、不加载远程 JS 逻辑）  
- [ ] 确认 `host_permissions` 均为功能必需（未用的域名考虑删除，如百度翻译）  

---

## C. 列表与资源

- [ ] 定稿 [`LISTING.md`](./LISTING.md) 名称、短描述、详细描述  
- [ ] 准备至少 **1** 张商店截图（建议 3–5 张），规格见 [`assets/SCREENSHOTS.md`](./assets/SCREENSHOTS.md)  
- [ ] 截图放入 `store/assets/`（可提交 git 或仅本地保留大图）  
- [ ] 确认 `extension/icons/` 含 128×128 等图标（manifest 已引用）  
- [ ] （可选）小宣传图 / 宣传视频  

**常见截图尺寸（以商店当前提示为准）：**

| 类型 | 常见要求 |
|------|----------|
| 截图 | 1280×800 或 640×400，JPEG/PNG，≤ 等限制见后台 |
| 图标 | 128×128 PNG（扩展内已有可复用） |

---

## D. 打包扩展

- [ ] 工作目录为仓库根，**只打包 extension 内容**  

PowerShell 示例：

```powershell
cd path\to\TranX
# 生成 zip：解压后根目录应直接看到 manifest.json
Compress-Archive -Path extension\* -DestinationPath tranx-extension.zip -Force
```

- [ ] 解压检查 zip：**根级**有 `manifest.json`，**没有** `store/`、`.git`、`README.md`（根）  
- [ ] 在干净的 Chrome 配置下「加载已解压」或「拖入 zip」做一次冒烟测试  
- [ ] 版本号已在 `extension/manifest.json` 更新（每次提交商店需递增）  

---

## E. 开发者控制台填写

- [ ] 新建商品 / 上传 zip  
- [ ] 名称、简短描述、详细描述（从 LISTING 复制）  
- [ ] 类别：生产力工具（或最接近类目）  
- [ ] 语言：中文（简体）；可选 English  
- [ ] 上传截图与图标  
- [ ] **隐私权政策 URL**  
- [ ] 权限声明 / 单一用途说明（可参考 PERMISSIONS / LISTING）  
- [ ] 数据使用披露问卷（参考 PERMISSIONS §5）  
- [ ] 分发地区：默认全球或按需  
- [ ] 定价：免费  

---

## F. 提交前功能自测

在 **x.com** 上：

- [ ] 英语词悬停出释义  
- [ ] 英语词点击可收藏；弹窗生词本可见且释义能加载  
- [ ] 卡片空白可进帖  
- [ ] 「显示更多」、点赞、时间戳可用  
- [ ] 日/韩（设置对应语言或自动）可整行翻译且**不能**收藏  
- [ ] 中文不触发气泡  
- [ ] 清除缓存不影响生词本  
- [ ] 关闭扩展开关后不再取词  

---

## G. 提交与审核后

- [ ] 提交审核  
- [ ] 保存提交编号/时间  
- [ ] 若驳回：根据邮件修改说明或代码，版本号 +1 后重传  
- [ ] 通过后：记录**正式扩展 ID**（用于文档与后续 sync 说明）  
- [ ] （可选）准备 Edge 加载项上架（独立流程，同步体系不同）  

---

## H. 常见驳回预防

| 风险 | 处理 |
|------|------|
| 权限过宽 | 去掉未使用 host；说明 storage 用途 |
| 缺少隐私政策 URL | 必须公网 HTTPS |
| 功能与描述不符 | LISTING 与真实行为一致（尤其「仅英语收藏」） |
| 商标 | 名称中 X/Twitter 被质疑时改用 LISTING 中的备选名 |
| 远程代码 | 保证逻辑全在包内 |

---

## 提交记录（自行填写）

| 日期 | 版本 | 结果 | 备注 |
|------|------|------|------|
| | | | |
