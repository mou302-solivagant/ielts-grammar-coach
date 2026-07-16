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

// ---------- 文法練習：共用常數與狀態工具 ----------
const QUESTION_TYPES = ['fill-in-blank', 'error-correction', 'translation', 'multiple-choice'];
const QUESTION_TYPE_ZH = {
  'fill-in-blank': '填空題',
  'error-correction': '找錯題',
  translation: '中翻英',
  'multiple-choice': '選擇題'
};
const TOPICS = [
  '城市發展 Urban Development',
  '文化遺產 Cultural Heritage',
  '科技 Technology',
  '教育 Education',
  '環境 Environment',
  '健康 Health',
  '全球化 Globalisation',
  '工作與就業 Work & Employment',
  '媒體與廣告 Media & Advertising',
  'Task 1 圖表趨勢描述 Chart Trend Description'
];
const STAGES = ['simple', 'mixed', 'comprehensive'];
const STAGE_ZH = { simple: '簡單題（單一概念）', mixed: '混合題（多概念/多空格）', comprehensive: '綜合題（完整段落，模擬 IELTS）' };
const STREAK_TO_PROMOTE = 3; // 連對3題升階
const SUMMARY_EVERY = 5; // 每完成5題觸發⭐總結

async function getState(category, subcategory) {
  const { data, error } = await supabase
    .from('subcategory_state')
    .select('*')
    .eq('category', category)
    .eq('subcategory', subcategory)
    .maybeSingle();
  if (error) throw new Error(`Supabase 讀取狀態失敗：${error.message}`);
  return (
    data || {
      category,
      subcategory,
      difficulty_stage: 'simple',
      streak: 0,
      answered_count: 0,
      mastery_stars: null,
      last_question_type: null,
      recent_topics: [],
      intro_shown_stages: []
    }
  );
}

async function saveState(state) {
  const { id, ...rest } = state;
  const { error } = await supabase
    .from('subcategory_state')
    .upsert({ ...rest, updated_at: new Date().toISOString() }, { onConflict: 'category,subcategory' });
  if (error) throw new Error(`Supabase 寫入狀態失敗：${error.message}`);
}

function pickNextQuestionType(lastType) {
  if (!lastType || !QUESTION_TYPES.includes(lastType)) return QUESTION_TYPES[0];
  return QUESTION_TYPES[(QUESTION_TYPES.indexOf(lastType) + 1) % QUESTION_TYPES.length];
}

function pickNextTopic(recentTopics) {
  const recent = new Set((recentTopics || []).slice(-5));
  const candidates = TOPICS.filter((t) => !recent.has(t));
  const pool = candidates.length ? candidates : TOPICS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------- 文法練習：產生題目 ----------
app.post('/api/generate-question', async (req, res) => {
  try {
    const { category, subcategory } = req.body;
    const state = await getState(category, subcategory);

    const questionType = pickNextQuestionType(state.last_question_type);
    const topic = pickNextTopic(state.recent_topics);
    const stage = state.difficulty_stage;
    const needIntro = !(state.intro_shown_stages || []).includes(stage);

    // 最近10題，避免重複句型/內容
    const { data: recentAttempts } = await supabase
      .from('practice_attempts')
      .select('question')
      .eq('category', category)
      .eq('subcategory', subcategory)
      .order('created_at', { ascending: false })
      .limit(10);
    const recentQuestions = [...new Set((recentAttempts || []).map((a) => a.question))];

    const system = `你是一位嚴謹的 IELTS 文法家教，教學語言規範：解釋一律用繁體中文、題目一律用英文、重要文法術語中英並列（例如「動名詞當主詞 Gerund as Subject」）。
請只回傳純 JSON，不要 markdown code fence，結構如下：

{
  ${needIntro ? `"conceptIntro": "本階段開始前的概念講解：用繁體中文解說這個文法點在「${STAGE_ZH[stage]}」階段的核心規則，附 2-3 個英文例句（例句主題與 IELTS 相關），術語中英並列。",\n  ` : ''}"question": "英文題目本體",
  "instructionZh": "用繁體中文簡短說明這題要做什麼",
  "questionType": "${questionType}"
}

嚴格要求：
1. 題型必須是「${QUESTION_TYPE_ZH[questionType]} ${questionType}」，不得改成其他題型。${questionType === 'translation' ? '中翻英題：question 內先給一句繁體中文句子，要求使用者翻成英文並正確運用該文法點。' : ''}${questionType === 'multiple-choice' ? '選擇題：提供 A/B/C/D 四個選項，每個選項都必須經得起檢驗——正確選項要真正正確，錯誤選項要真正有錯。' : ''}
2. 題目主題必須圍繞「${topic}」，符合 IELTS Task 1/Task 2 常見情境。
3. 難度階段：${STAGE_ZH[stage]}。simple＝只考單一概念；mixed＝同一題混合多個相關概念或多個空格；comprehensive＝完整段落，模擬 IELTS 寫作情境。
4. 不要在 question 中洩漏答案。
${recentQuestions.length ? `5. 以下是最近出過的題目，禁止出重複或高度相似的句型/內容：\n${recentQuestions.map((q, i) => `  (${i + 1}) ${q}`).join('\n')}` : ''}`;

    const prompt = `請針對文法點「${category} - ${subcategory}」出一題。題型：${questionType}；主題：${topic}；難度：${stage}。`;
    const raw = await callClaude({ system, prompt, maxTokens: needIntro ? 2000 : 1000 });
    const parsed = parseJsonFromModel(raw);

    // 更新狀態：題型與主題輪替記錄、概念講解已顯示
    state.last_question_type = questionType;
    state.recent_topics = [...(state.recent_topics || []), topic].slice(-5);
    if (needIntro) state.intro_shown_stages = [...(state.intro_shown_stages || []), stage];
    await saveState(state);

    res.json({
      ...parsed,
      questionType, // 以伺服器決定為準
      topic,
      difficultyStage: stage,
      conceptIntro: needIntro ? parsed.conceptIntro ?? null : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- 文法練習：批改答案 ----------
app.post('/api/grade-answer', async (req, res) => {
  try {
    const { category, subcategory, question, userAnswer, questionType, topic, retryCount = 0 } = req.body;
    const state = await getState(category, subcategory);

    const isMultipleChoice = questionType === 'multiple-choice';
    const hintNote =
      retryCount >= 2
        ? `\n注意：使用者已針對本題連續答錯 ${retryCount} 次，請在 explanationZh 中給出更完整的引導與提示（例如指出關鍵字、拆解句構、給相近例句），幫助他下一次自己答對，但不要直接把完整答案寫在提示裡以外的地方。`
        : '';

    const system = `你是一位嚴謹誠實的 IELTS 文法家教，負責批改作答。教學語言規範：解釋一律用繁體中文、術語中英並列。
請只回傳純 JSON，不要 markdown code fence，結構如下：

{
  "isCorrect": true,
  "corrections": [
    { "userUsage": "使用者原本的寫法（英文片段）", "issue": "問題說明（繁體中文，術語中英並列）", "correction": "修正後的寫法（英文）" }
  ],
  "correctAnswer": "正確答案或完整修正版例句（英文）",
  "explanationZh": "繁體中文詳細解釋為什麼對或錯、這個文法點的規則",
  "relatedRule": "相關固定搭配或文法規則（繁體中文說明＋英文搭配範例）"${isMultipleChoice ? `,
  "bothOptionsFlawed": false,
  "flawedExplanationZh": "若選項設計有瑕疵，在此誠實說明"` : ''}
}

批改原則：
1. 答對時 corrections 可為空陣列，但仍要給 explanationZh 說明為什麼正確、relatedRule 補充相關搭配。
2. 答錯時每個錯誤點都要列成 corrections 的一筆（使用者用法 → 問題 → 修正）。
3. 嚴謹誠實：不能為了給分硬說使用者對，也不能吹毛求疵。意思正確但有更道地說法時，判 isCorrect: true 並在 relatedRule 補充更好的寫法。${isMultipleChoice ? '\n4. 選擇題誠實度：如果檢驗後發現不只一個選項可接受、或所有選項都不完全正確，必須設 bothOptionsFlawed: true，在 flawedExplanationZh 誠實說明每個選項的問題與真正正確的說法，此時 isCorrect 以使用者是否掌握該文法點來判定。' : ''}${hintNote}`;

    const prompt = `文法點：${category} - ${subcategory}
題型：${questionType || '未知'}；主題：${topic || '未知'}
題目：${question}
使用者的作答：${userAnswer}

請批改並回傳 JSON。`;
    const raw = await callClaude({ system, prompt, maxTokens: 1500 });
    const parsed = parseJsonFromModel(raw);
    const isCorrect = !!parsed.isCorrect;

    const { error: insertError } = await supabase.from('practice_attempts').insert({
      category,
      subcategory,
      question,
      user_answer: userAnswer,
      is_correct: isCorrect,
      explanation_zh: parsed.explanationZh ?? '',
      correct_answer: parsed.correctAnswer ?? '',
      question_type: questionType ?? null,
      topic: topic ?? null,
      retry_count: retryCount,
      difficulty_stage: state.difficulty_stage,
      corrections: parsed.corrections ?? []
    });
    if (insertError) throw new Error(`Supabase 寫入失敗：${insertError.message}`);

    // 進度推進：只有答對才過關
    let stagePromoted = false;
    if (isCorrect) {
      state.streak += 1;
      state.answered_count += 1;
      const stageIdx = STAGES.indexOf(state.difficulty_stage);
      if (state.streak >= STREAK_TO_PROMOTE && stageIdx < STAGES.length - 1) {
        state.difficulty_stage = STAGES[stageIdx + 1];
        state.streak = 0;
        stagePromoted = true;
      }
    } else {
      state.streak = 0;
    }
    await saveState(state);

    res.json({
      ...parsed,
      isCorrect,
      corrections: parsed.corrections ?? [],
      answeredCount: state.answered_count,
      difficultyStage: state.difficulty_stage,
      stagePromoted,
      summaryDue: isCorrect && state.answered_count > 0 && state.answered_count % SUMMARY_EVERY === 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- 文法練習：⭐進度總結（每完成5題） ----------
app.post('/api/summarize-progress', async (req, res) => {
  try {
    const { category, subcategory } = req.body;
    const state = await getState(category, subcategory);

    const { data: attempts, error } = await supabase
      .from('practice_attempts')
      .select('question, user_answer, is_correct, retry_count, question_type, difficulty_stage')
      .eq('category', category)
      .eq('subcategory', subcategory)
      .order('created_at', { ascending: false })
      .limit(12); // 涵蓋最近5題的重做記錄
    if (error) throw new Error(error.message);

    const system = `你是 IELTS 文法家教，請根據最近的作答記錄，總結使用者對這個文法點的掌握度。解釋用繁體中文、術語中英並列。
請只回傳純 JSON，不要 markdown code fence：

{
  "stars": 4,
  "summaryZh": "繁體中文簡短總結：掌握了什麼、哪裡還不穩",
  "adviceZh": "繁體中文建議：接下來該注意什麼"
}

stars 為 1-5 的整數（⭐掌握度）。評分要考慮：答對率、重做次數（retry_count 高代表不熟）、目前難度階段。`;

    const prompt = `文法點：${category} - ${subcategory}
目前難度階段：${state.difficulty_stage}
最近作答記錄（新到舊）：
${(attempts || [])
  .map(
    (a, i) =>
      `${i + 1}. [${a.is_correct ? '✓' : '✗'}] 題型:${a.question_type || '?'} 重試:${a.retry_count || 0} 階段:${a.difficulty_stage || '?'} 題目:${(a.question || '').slice(0, 120)}`
  )
  .join('\n')}

請總結並回傳 JSON。`;
    const raw = await callClaude({ system, prompt, maxTokens: 800 });
    const parsed = parseJsonFromModel(raw);

    const stars = Math.min(5, Math.max(1, Math.round(Number(parsed.stars) || 3)));
    state.mastery_stars = stars;
    await saveState(state);

    res.json({ ...parsed, stars });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- 文法練習：隨時問老師 ----------
app.post('/api/ask-tutor', async (req, res) => {
  try {
    const { category, subcategory, tutorQuestion, context = {} } = req.body;
    if (!tutorQuestion || !tutorQuestion.trim()) {
      return res.status(400).json({ error: '請輸入你的問題' });
    }
    const { conceptIntro, question, userAnswer, feedback } = context;

    const system = `你是一位認真負責的 IELTS 文法家教。使用者在練習過程中提出疑問，你必須認真分析、給出客觀有依據的解釋——尤其當使用者質疑批改結果或認為自己的答案也可以接受時，要逐點分析他的說法是否成立，該承認就誠實承認（包含承認題目或批改有瑕疵），不能敷衍回覆「你說得對」，也不能硬拗。
語言規範：解釋用繁體中文、英文例句用英文、術語中英並列。
請只回傳純 JSON，不要 markdown code fence：

{
  "answerZh": "繁體中文完整回覆，可包含英文例句與中英並列術語"
}`;

    const prompt = `文法點：${category} - ${subcategory}
${conceptIntro ? `本階段概念講解：${conceptIntro}\n` : ''}${question ? `目前題目：${question}\n` : ''}${userAnswer ? `使用者的作答：${userAnswer}\n` : ''}${feedback ? `最新批改結果（JSON）：${JSON.stringify(feedback)}\n` : ''}
使用者的提問：${tutorQuestion}

請認真分析並回傳 JSON。`;
    const raw = await callClaude({ system, prompt, maxTokens: 1500 });
    const parsed = parseJsonFromModel(raw);
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
