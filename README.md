# 听译台 Bayt Lite

听译台是一个面向个人使用的本地播客听译工具：导入英文音频，在本机生成带时间戳的英文字幕，再通过 DeepSeek API（开放平台接口）翻译成中文，并让字幕高亮始终跟随播放进度。

## 功能

- 导入本地音频、音频直链或 RSS（播客订阅源）单集
- 使用本机 MLX Whisper（针对苹果芯片优化的语音识别模型）生成英文字幕与时间戳
- 使用 DeepSeek 生成逐段简体中文翻译
- 双语、仅英文、仅中文三种字幕视图
- 播放进度与字幕高亮同步，点击字幕跳转到对应时间
- 15 秒快退/快进、倍速播放、字幕自动跟随
- 自动保存每集播放进度
- 本机 JSON（轻量数据文件）持久化、处理进度和任务删除
- 内置无需密钥即可播放的演示单集
- 桌面端和移动端响应式布局

## 运行环境

- Apple Silicon（苹果芯片）Mac
- Node.js 20 或更高版本
- FFmpeg（音视频处理工具）
- uv（Python 环境管理工具）
- 有可用额度的 DeepSeek API 密钥

安装系统依赖：

```bash
brew install ffmpeg uv
```

## 快速开始

```bash
git clone https://github.com/TangHuaiZhe/bayt-lite.git
cd bayt-lite
npm install
npm run setup
cp .env.example .env
```

编辑 `.env`：

```env
DEEPSEEK_API_KEY=你的真实密钥
```

启动：

```bash
npm start
```

浏览器打开 <http://localhost:4173>。不配置密钥也能使用内置演示；本机英文转写可以运行，但新音频无法完成中文翻译。

首次转写会自动下载约数百 MB 的 Whisper 模型，后续会复用本机缓存。

## 工作原理

1. FFmpeg 将音频转成单声道 16 kHz MP3，并按 20 分钟切片。
2. 本机 MLX Whisper 生成英文分段字幕和起止时间，不上传音频到外部语音服务。
3. 听译台把英文字幕按批次发送给 DeepSeek，获得结构化中文翻译。
4. 浏览器根据音频的当前播放秒数，用二分查找定位并高亮字幕片段。

默认使用：

- 转写模型：`mlx-community/whisper-small-mlx`
- 翻译模型：`deepseek-v4-flash`

可在 `.env` 中通过 `WHISPER_MODEL` 和 `DEEPSEEK_MODEL` 覆盖。

## 数据与隐私

- 原始音频、英文转写和任务记录保存在本机。
- 只有英文字幕文本会发送给 DeepSeek 用于中文翻译。
- `.env`、用户音频、任务数据、本机 Python 环境和模型缓存均被 Git 忽略，不会上传到仓库。
- 删除单集时，其任务记录与导入音频会一起删除；内置演示不可删除。

本机数据位置：

- 任务元数据：`data/jobs.json`
- 导入音频：`data/uploads/`
- 临时切片：`data/chunks/`

## 开发与验证

```bash
npm run dev
npm test
node --check server.js
node --check public/app.js
```

## 当前边界

- 单文件上限为 300 MB。
- 只针对英文原音频优化，暂不支持自动语言检测和说话人区分。
- 任务队列运行在当前 Node.js 进程内；进程重启后不会自动恢复未完成任务。
- RSS 和音频直链必须能被运行机器直接访问。
- 暂无登录、云同步、搜索、收藏、字幕编辑和原生移动端应用。

## 许可证

[MIT](LICENSE)
