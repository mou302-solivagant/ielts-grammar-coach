import fetch from 'node-fetch';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

// image: optional { mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', data: '<base64 string, no data: prefix>' }
export async function callClaude({ system, prompt, image, maxTokens = 2000 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY 未設定，請在 server/.env 中填入你的 API Key');
  }

  const content = [];
  if (image?.data) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data }
    });
  }
  content.push({ type: 'text', text: prompt });

  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API 錯誤 (${res.status}): ${text}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((c) => c.type === 'text');
  return textBlock ? textBlock.text : '';
}

// Claude 有時會用 ```json ... ``` 包住回應，這裡負責清理並解析
export function parseJsonFromModel(raw) {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}
