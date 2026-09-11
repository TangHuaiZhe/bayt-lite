# 听译台 Bayt Lite

听译台是一个面向个人使用的本地播客听译工具，提供浏览器版和 macOS 客户端：导入英文音频，在本机生成带时间戳的英文字幕，再通过 DeepSeek API（开放平台接口）翻译和总结，并让字幕高亮始终跟随播放进度。

## 功能

- 导入本地音频或视频、音频直链、Apple Podcasts（苹果播客）单集链接或 RSS（播客订阅源）单集
- 本地视频会先自动提取为 M4A 音频，后续播放与转写不再处理画面
- 使用本机 MLX Whisper（针对苹果芯片优化的语音识别模型）生成英文字幕与时间戳
- 使用 DeepSeek 生成逐段简体中文翻译
- 使用 DeepSeek 生成可持久保存的中文概述和关键要点
- 双语、仅英文、仅中文三种字幕视图
- 英文字幕生词中文提示，可按四级、六级、雅思或更高水平选择起始难度
- 播放进度与字幕高亮同步，点击字幕跳转到对应时间
- 15 秒快退/快进、倍速播放、字幕自动跟随
- 自动保存每集播放进度
- 本机 JSON（轻量数据文件）持久化、处理进度、失败重试、任务取消和完整删除
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

## macOS 客户端

首次构建前准备独立的桌面运行环境。该命令会在 `~/Library/Application Support/听译台/` 创建 Whisper 环境，并在目标目录为空时迁移现有 `.env`、任务和音频：

```bash
npm run desktop:setup
```

启动开发版客户端：

```bash
npm run desktop:dev
```

构建 Apple Silicon（苹果芯片）安装包：

```bash
npm run desktop:build
```

生成的 `.dmg` 安装镜像位于 `dist/`。客户端自带网页界面和 Node.js 服务，但仍需要系统已安装 FFmpeg；运行环境、API 密钥和用户音频不会打进安装包。

## 工作原理

1. FFmpeg 先从本地视频提取 M4A 音频，再将音频转成单声道 16 kHz MP3，并按 20 分钟切片。
2. 本机 MLX Whisper 生成英文片段和起止时间，不上传音频到外部语音服务。
3. 听译台按照英文句末标点合并短片段，再把完整句子按批次发送给 DeepSeek，获得结构化中文翻译、生词释义与难度标签。
4. 用户可以在字幕完成后按需生成整期中文概述和五至八条关键要点；结果保存在本机，不会因重复打开而再次调用接口。
5. 浏览器根据音频的当前播放秒数，用二分查找定位并高亮字幕片段。

默认使用：

- 转写模型：`mlx-community/whisper-small-mlx`
- 文本模型：`deepseek-v4-flash`

可在 `.env` 中通过 `WHISPER_MODEL` 和 `DEEPSEEK_MODEL` 覆盖。

## 数据与隐私

- 原始音频、英文转写和任务记录保存在本机。
- 只有英文字幕文本会发送给 DeepSeek，用于中文翻译和用户主动触发的 AI 总结。
- `.env`、用户音频、任务数据、本机 Python 环境和模型缓存均被 Git 忽略，不会上传到仓库。
- 删除单集时，其任务记录与导入音频会一起删除；内置演示不可删除。
- 取消处理会中止正在进行的下载、音频切片、本机转写或 DeepSeek 请求，并保留任务供随后删除。
- 重试本地任务会复用原始音频；重试链接任务会重新解析节目地址并重新下载音频。

本机数据位置：

- 任务元数据：`data/jobs.json`
- 导入音频：`data/uploads/`
- 临时切片：`data/chunks/`
- macOS 客户端：`~/Library/Application Support/听译台/`

## 开发与验证

```bash
npm run dev
npm test
node --check server.js
node --check public/app.js
```

## 当前边界

- 原生音频文件上限为 300 MB；本地视频上传后会提取为音频，大小只受本机可用存储空间限制。
- 只针对英文原音频优化，暂不支持自动语言检测和说话人区分。
- 任务队列运行在当前 Node.js 进程内；进程重启后不会自动恢复未完成任务。
- 当前 macOS 安装包未使用 Apple Developer（苹果开发者）证书签名或公证，仅用于本机开发和个人安装。
- RSS 和音频直链必须能被运行机器直接访问。
- 暂无登录、云同步、搜索、收藏、字幕编辑和原生移动端应用。

## 许可证

[MIT](LICENSE)
