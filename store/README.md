# store/ — Chrome 网上应用店材料

本目录存放**上架与审核**相关材料，与扩展运行时无关。

- **不要**把本目录打进扩展安装包（zip / crx）
- 开发加载扩展时，请选择仓库中的 **`extension/`**

---

## 文件索引

| 路径 | 用途 | 状态 |
|------|------|------|
| [LISTING.md](./LISTING.md) | 名称、短描述、详细描述、单一用途说明 | ✅ 已撰文案 |
| [PRIVACY.md](./PRIVACY.md) | 隐私政策全文（需托管为 HTTPS 再填商店） | ✅ 已撰（待替换联系方式） |
| [PERMISSIONS.md](./PERMISSIONS.md) | 权限 / host / 内容脚本说明与审核话术 | ✅ 已撰 |
| [CHECKLIST.md](./CHECKLIST.md) | 从注册到提交的完整检查清单 | ✅ 已撰 |
| [assets/SCREENSHOTS.md](./assets/SCREENSHOTS.md) | 截图尺寸与构图说明 | ✅ 已撰 |
| [assets/](./assets/) | 放置成品截图、宣传图 | ⏳ 需你本地截图 |

---

## 你需要亲自完成的事项

1. **隐私政策上线**  
   - 编辑 `PRIVACY.md` 文末邮箱与项目链接  
   - 发布到 GitHub Pages 或其他 HTTPS 站点  
   - 将 URL 写入商店后台  

2. **截图**  
   - 按 `assets/SCREENSHOTS.md` 拍摄 1280×800 图  
   - 文件放入 `assets/`  

3. **打包**  
   - 仅打包 `extension/*`（见 `CHECKLIST.md`）  

4. **开发者账号**  
   - Google 账号 + 开发者注册费  

---

## 与扩展目录的关系

```text
TranX/
├── extension/   ← 安装包内容
└── store/       ← 本目录（文案与素材）
```
