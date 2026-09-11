# AGENTS.md

## 项目目标

这是一个单用户、本地优先的英文播客双语字幕播放器。第一版应保持简单：本机负责音频转写，DeepSeek 只处理英文逐字稿的中文翻译与总结，浏览器负责播放与字幕同步。

## 开发约定

- 使用中文编写用户可见文案；出现英文术语时同时给出中文说明。
- 保持 Node.js + 原生浏览器 JavaScript 的轻量架构，除非需求明确要求，不引入前端框架或数据库。
- 服务端代码使用 ECMAScript Module（ECMAScript 模块）语法。
- 文件修改应围绕当前需求，避免无关重构。
- 新增行为必须附带与风险相称的测试。

## 核心边界

- MLX Whisper 在本机生成英文字幕与时间戳。
- DeepSeek 接收英文字幕文本并返回中文翻译或总结；不得向其上传原始音频。
- AI 总结基于完整英文逐字稿生成，结果保存在对应任务中，重复打开不得自动重新计费。
- 播放器必须以音频当前时间为唯一同步依据。
- Whisper 短片段应在翻译前按照英文句末标点合并，并保留首段开始时间与末段结束时间。
- 中文文件名在进入任务记录前必须经过 multipart（多段表单）编码修复。
- Apple Podcasts 单集页面必须先解析公开页面元数据，不能把 HTML 网页当作音频传给 FFmpeg。
- 用户任务与导入音频默认只保存在 `data/`。
- 取消任务必须向下载、FFmpeg、Whisper 和 DeepSeek 传播中止信号；删除任务后，后台流程不得重新写回任务记录。

## 常用命令

```bash
npm install
npm run setup
npm test
npm run dev
```

## 发布前检查

- `npm test` 全部通过。
- `node --check server.js` 和 `node --check public/app.js` 通过。
- `.env`、API 密钥、`data/jobs.json`、`data/uploads/`、`data/chunks/`、`.venv/` 和模型缓存不得提交。
- 内置演示音频和字幕必须保持可播放、可同步。
