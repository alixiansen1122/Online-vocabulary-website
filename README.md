# 背单词网页

基于 Vite + React 的纯网页词汇学习工具，支持词书浏览、搜索、发音、收藏、学习进度、笔记以及 PDF/Word 词书导入。

## 本地开发

```powershell
npm.cmd install
npm.cmd run dev
```

## 构建网页

```powershell
npm.cmd run build
npm.cmd run preview
```

构建产物位于 `dist/`。

## 生成 Windows 便携包

```powershell
npm.cmd run portable
```

命令会生成：

```text
release/word-memory-web-portable.zip
```

将压缩包复制到其他 Windows 电脑并解压，双击 `start-portable.bat` 即可打开网页。目标电脑不需要安装 Node.js。

## 迁移学习数据

项目文件不包含浏览器中的学习进度。迁移前请进入网页的“仪表盘 > 数据迁移”：

1. 在旧电脑点击“导出备份”，保存 JSON 文件。
2. 将便携包和 JSON 文件复制到新电脑。
3. 启动网页后点击“导入备份”。

备份包含学习进度、收藏、笔记、搜索记录、设置和已导入词书。

## 主要目录

- `src/App.jsx`：主界面和学习逻辑
- `src/importWordBook.js`：浏览器端 PDF/Word 词书导入
- `src/offlineTts.js`：本地音频和浏览器语音兜底
- `src/data/`：内置词书及辅助数据
- `public/audio/`：英美发音音频
- `scripts/build-portable.ps1`：便携包构建脚本
- `scripts/portable-server.ps1`：Windows 本地静态服务器
