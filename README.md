# TranX

X (Twitter) 悬浮词典浏览器扩展 —— 英语查词 / 日韩整行译中 / 英语生词本。

## 仓库结构

```text
TranX/
├── extension/     # 扩展本体（开发者模式加载此目录）
├── store/         # Chrome 网上应用店上架材料（不进安装包）
└── README.md      # 本文件
```

| 目录 | 说明 |
|------|------|
| [`extension/`](./extension/) | Manifest V3 扩展源码；详见其中 README |
| [`store/`](./store/) | 商店列表文案、隐私政策、权限说明、上架清单；**打包时不要包含** |

## 开发安装

1. Chrome / Edge 打开 `chrome://extensions`（Edge：`edge://extensions`）
2. 开启 **开发者模式**
3. **加载已解压的扩展程序** → 选择：

   ```text
   …/TranX/extension
   ```

4. 打开 [https://x.com](https://x.com) 试用  

修改代码后：扩展管理页点 **刷新**，再刷新 X 页面。

## 打包（上架 / 分发）

只打包 `extension/` 下的内容，例如：

```powershell
# 在仓库根目录执行；生成的 zip 内应为 manifest.json 等，不要带 store/
Compress-Archive -Path extension\* -DestinationPath tranx-extension.zip -Force
```

**不要**把 `store/`、本 README、`.git` 打进安装包。

## 功能摘要

- 英语：悬停查中文释义，点击收藏（只存词形，**Chrome Sync** 跨设备）
- 日 / 韩：识别后整行译中；不可收藏
- 中文：永不触发取词

更多说明见 [`extension/README.md`](./extension/README.md)。

## 隐私政策（公网）

上架与对外披露使用：

**https://0x9579.github.io/TranX/privacy.html**

源文件：`docs/privacy.html`（GitHub Pages，分支 `master`，目录 `/docs`）。

## 许可证

MIT
