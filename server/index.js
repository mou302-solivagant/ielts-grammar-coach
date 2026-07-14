import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import supabase from './db.js';
import { callClaude, parseJsonFromModel } from './claude.js';

const app = express();

// 本機開發：不設定 CORS_ORIGIN，允許任何來源。
// 正式部署：在 server 的環境變數設定 CORS_ORIGIN 為前端的實際網址（例如 https://your-app.vercel.app），
// 可用逗號分隔多個網址。
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({ origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()) : true }));

app.use(express.json({ limit: '12mb' })); // Task 1 圖表圖片以 base64 傳輸，放大 body 上限

const PORT = process.env.PORT || 5174;

// ---------- 寫作分析 ----------
app.post('/api/analyze-writing', async (req, res) => {
  try {
    const { taskType, essayText, image, promptText } = req.body; // image: { mediaType, data } (data 不含 "data:...;base64," 前綴)
    if (!essayText || !essayText.trim()) {
      return res.status(400).json({ error: '請提供作文內容' });
    }

    const hasImage = taskType === 'task1' && image?.data;
    const hasPrompt = !!(promptText && promptText.trim());

    const system = `你是一位經驗豐富的 IELTS 考官與英文寫作教練。你會針對使用者提交的 IELTS ${taskType === 'task1' ? 'Task 1' : 'Task 2'} 作文進行嚴謹評分與逐句修正。${hasImage ? '使用者同時附上了 Task 1 的圖表/圖片（例如長條圖、折線圖、圓餅圖、地圖或流程圖），請你先解讀圖片內容，再依此評估作文的 Task Achievement（資訊是否正確、有無遺漏或誤讀圖表數據、趨勢描述是否精準）。' : ''}${hasPrompt ? '使用者同時附上了完整的作文題目，請務必對照題目要求評估作文是否確實回應了題目（是否偏題、要求的重點是否都涵蓋），這會直接影響 Task Achievement 評分。' : '使用者沒有提供題目，請僅根據作文內容本身評估，Task Achievement 的評估可能較不精確，請在 noteZh 中提醒使用者下次可提供題目以獲得更準確評分。'}
請務必只回傳一個「純 JSON 物件」，不要有任何其他文字、不要用 markdown code fence。JSON 結構如下：

{
  "bandScore": 6.5,
  "criteria": {
    "taskAchievement": { "score": 6, "noteZh": "中文說明..." },
    "coherenceCohesion": { "score": 6.5, "noteZh": "中文說明..." },
    "lexicalResource": { "score": 6, "noteZh": "中文說明..." },
    "grammarAccuracy": { "score": 6, "noteZh": "中文說明..." }
  },
  "sentenceCorrections": [
    { "original": "原句", "corrected": "修正後句子", "explanationZh": "中文解釋為什麼修改" }
  ],
  "errorDiagnosis": [
    { "category": "動詞類", "subcategory": "Tense", "count": 3 },
    { "category": "連接與邏輯類", "subcategory": "Conjunction", "count": 1 }
  ]
}

errorDiagnosis 的 category 必須是以下六大類其中之一（中文名稱需完全一致）：
"句子結構類", "動詞類", "名詞/代名詞類", "修飾語類", "連接與邏輯類", "詞彙類"
subcategory 請用對應的英文文法項目名稱（例如 Fragment, Tense, Articles, Preposition, Conjunction, Word Form 等）。
只列出實際在文章中出現的錯誤類別，count 為該類別出現次數。`;

    const prompt = `作文類型：${taskType === 'task1' ? 'IELTS Writing Task 1' : 'IELTS Writing Task 2'}${hasImage ? '（已附上題目圖表，請先參考圖片再評分）' : ''}
${hasPrompt ? `\n題目：\n"""\n${promptText.trim()}\n"""\n` : ''}
作文內容：
"""
${essayText}
"""

請依照系統指示的 JSON 格式回傳完整分析。`;

    const raw = await callClaude({
      system,
      prompt,
      image: hasImage ? { mediaType: image.mediaType, data: image.data } : undefined,
      maxTokens: 4000
    });
    const parsed = parseJsonFromModel(raw);

    const { data: inserted, error: insertError } = await supabase
      .from('writing_analyses')
      .insert({
        task_type: taskType,
        prompt_text: hasPrompt ? promptText.trim() : '',
        essay_text: essayText,
        band_score: parsed.bandScore ?? null,
        criteria: parsed.criteria ?? {},
        sentence_corrections: parsed.sentenceCorrections ?? [],
        error_diagnosis: parsed.errorDiagnosis ?? []
      })
      .select()
      .single();

    if (insertError) throw new Error(`Supabase 寫入失敗：${insertError.message}`);

    res.json({
      id: inserted.id,
      taskType: inserted.task_type,
      promptText: inserted.prompt_text,
      essayText: inserted.essay_text,
      bandScore: inserted.band_score,
      criteria: inserted.criteria,
      sentenceCorrections: inserted.sentence_corrections,
      errorDiagnosis: inserted.error_diagnosis,
      createdAt: inserted.created_at
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/writing-analyses', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('writing_analyses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- 弱項（來自寫作分析診斷，累積所有分析） ----------
app.get('/api/weak-areas', async (req, res) => {
  try {
    const { data, error } = await supabase.from('writing_analyses').select('error_diagnosis');
    if (error) throw new Error(error.message);

    const totals = {};
    for (const analysis of data) {
      for (const item of analysis.error_diagnosis ?? []) {
        const key = `${item.category}__${item.subcategory}`;
        totals[key] ||= { category: item.category, subcategory: item.subcategory, totalCount: 0 };
        totals[key].totalCount += item.count || 0;
      }
    }
    const result = Object.values(totals).sort((a, b) => b.totalCount - a.totalCount);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- 文法練習：產生題目 ----------
app.post('/api/generate-question', async (req, res) => {
  try {
    const { category, subcategory } = req.body;
    const system = `你是 IELTS 文法教練，專門設計聚焦單一文法點的練習題。請只回傳純 JSON，不要 markdown code fence，結構如下：

{
  "question": "英文題目（例如填空、改錯、選擇或造句題，聚焦在指定文法點，並使用 IELTS 常見主題，如環境、教育、科技、健康等）",
  "instructionZh": "用中文簡短說明這題要做什麼",
  "questionType": "fill-in-blank | error-correction | sentence-rewrite | multiple-choice"
}

不要在 question 中洩漏答案。`;

    const prompt = `請針對文法類別「${category} - ${subcategory}」設計一題 IELTS 相關主題的練習題。`;
    const raw = await callClaude({ system, prompt, maxTokens: 800 });
    const parsed = parseJsonFromModel(raw);
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- 文法練習：批改答案 ----------
app.post('/api/grade-answer', async (req, res) => {
  try {
    const { category, subcategory, question, userAnswer } = req.body;
    const system = `你是 IELTS 文法教練，負責批改使用者針對特定文法點的練習作答。請只回傳純 JSON，不要 markdown code fence，結構如下：

{
  "isCorrect": true,
  "correctAnswer": "正確答案或參考答案",
  "explanationZh": "用中文詳細解釋為什麼對或錯，以及這個文法點的規則"
}`;

    const prompt = `文法類別：${category} - ${subcategory}\n題目：${question}\n使用者的作答：${userAnswer}\n\n請批改並回傳 JSON。`;
    const raw = await callClaude({ system, prompt, maxTokens: 800 });
    const parsed = parseJsonFromModel(raw);

    const { error: insertError } = await supabase.from('practice_attempts').insert({
      category,
      subcategory,
      question,
      user_answer: userAnswer,
      is_correct: !!parsed.isCorrect,
      explanation_zh: parsed.explanationZh ?? '',
      correct_answer: parsed.correctAnswer ?? ''
    });
    if (insertError) throw new Error(`Supabase 寫入失敗：${insertError.message}`);

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- 進度追蹤 ----------
app.get('/api/progress', async (req, res) => {
  try {
    const { data: attempts, error } = await supabase
      .from('practice_attempts')
      .select('category, subcategory, is_correct');
    if (error) throw new Error(error.message);

    const byCategoryMap = {};
    const bySubcategoryMap = {};

    for (const a of attempts) {
      byCategoryMap[a.category] ||= { category: a.category, attempts: 0, correctCount: 0 };
      byCategoryMap[a.category].attempts += 1;
      byCategoryMap[a.category].correctCount += a.is_correct ? 1 : 0;

      const key = `${a.category}__${a.subcategory}`;
      bySubcategoryMap[key] ||= { category: a.category, subcategory: a.subcategory, attempts: 0, correctCount: 0 };
      bySubcategoryMap[key].attempts += 1;
      bySubcategoryMap[key].correctCount += a.is_correct ? 1 : 0;
    }

    const totals = {
      totalAttempts: attempts.length,
      totalCorrect: attempts.filter((a) => a.is_correct).length
    };

    res.json({
      byCategory: Object.values(byCategoryMap),
      bySubcategory: Object.values(bySubcategoryMap),
      totals
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`IELTS Grammar Coach 後端已啟動： http://localhost:${PORT}`);
});
