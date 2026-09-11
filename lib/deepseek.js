const apiBase = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

function requireKey() {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error("未检测到 DEEPSEEK_API_KEY，请配置密钥后重新处理。");
  return process.env.DEEPSEEK_API_KEY;
}

async function requestDeepSeek(body, signal) {
  const response = await fetch(`${apiBase}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${requireKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    if ([402, 429].includes(response.status)) throw new Error("DeepSeek 服务额度或请求频率受限，请检查账户余额后重试。");
    throw new Error(`DeepSeek 服务返回 ${response.status}：${detail?.error?.message || "请求失败"}`);
  }
  return response.json();
}

function extractOutputText(result) {
  if (result.output_text) return result.output_text;
  for (const item of result.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error("DeepSeek 没有返回可读取的文本结果。");
}

export async function translateSegments(segments, onBatch, { signal } = {}) {
  const translated = [];
  const batchSize = 35;
  for (let offset = 0; offset < segments.length; offset += batchSize) {
    const batch = segments.slice(offset, offset + batchSize);
    const result = await requestDeepSeek({
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      instructions: "将英文播客字幕翻译成准确自然的简体中文，并为每条字幕筛选值得提示的英文词汇。保留人名、品牌和术语；不得合并、删除或新增字幕条目。词汇必须是该条英文字幕中原样出现的单个词（不含标点），同一条内不重复；给出贴合语境的简短中文释义，并按 cet4（大学英语四级）、cet6（大学英语六级）、ielts（雅思）、advanced（高于雅思）标注难度。宁缺毋滥，不收录人名、品牌或比四级更简单的基础词。只返回符合给定 JSON 结构的结果。",
      input: JSON.stringify(batch.map(({ id, en }) => ({ id, en }))),
      text: { format: {
        type: "json_schema",
        name: "subtitle_translations",
        strict: true,
        schema: {
          type: "object",
          properties: { items: { type: "array", items: {
            type: "object",
            properties: {
              id: { type: "string" },
              zh: { type: "string" },
              vocabulary: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    word: { type: "string" },
                    zh: { type: "string" },
                    level: { type: "string", enum: ["cet4", "cet6", "ielts", "advanced"] }
                  },
                  required: ["word", "zh", "level"],
                  additionalProperties: false
                }
              }
            },
            required: ["id", "zh", "vocabulary"],
            additionalProperties: false
          } } },
          required: ["items"],
          additionalProperties: false
        }
      } }
    }, signal);
    const items = JSON.parse(extractOutputText(result)).items;
    if (items.length !== batch.length) throw new Error("翻译条目数量与原字幕不一致。");
    translated.push(...items);
    await onBatch?.(Math.min(offset + batch.length, segments.length), segments.length);
  }
  const byId = new Map(translated.map((item) => [item.id, item]));
  return segments.map((segment) => {
    const item = byId.get(segment.id);
    return { ...segment, zh: item?.zh || "", vocabulary: item?.vocabulary || [] };
  });
}

export async function summarizeTranscript({ title, podcast, segments, signal }) {
  const result = await requestDeepSeek({
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    instructions: "你是一名严谨的中文播客编辑。只根据提供的英文逐字稿总结，不补充外部事实，不虚构观点。概述写成两至三段连贯中文；提炼五至八条有信息量的要点。",
    input: JSON.stringify({
      title,
      podcast,
      transcript: segments.map(({ start, en }) => ({ start, text: en }))
    }),
    text: { format: {
      type: "json_schema",
      name: "podcast_summary",
      strict: true,
      schema: {
        type: "object",
        properties: {
          overview: { type: "string" },
          keyPoints: { type: "array", minItems: 5, maxItems: 8, items: { type: "string" } }
        },
        required: ["overview", "keyPoints"],
        additionalProperties: false
      }
    } }
  }, signal);
  const summary = JSON.parse(extractOutputText(result));
  if (!summary.overview || !Array.isArray(summary.keyPoints) || !summary.keyPoints.length) {
    throw new Error("DeepSeek 返回的总结内容不完整。");
  }
  return summary;
}
