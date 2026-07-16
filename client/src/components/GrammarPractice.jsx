import React, { useEffect, useState, useCallback } from 'react';
import { CATEGORIES } from '../data/categories.js';
import { api } from '../api.js';

export default function GrammarPractice({ refreshKey, onAttempt }) {
  const [expanded, setExpanded] = useState({});
  const [weakMap, setWeakMap] = useState({}); // "category__subcategory" -> count
  const [statsMap, setStatsMap] = useState({}); // "category__subcategory" -> {attempts, correctCount}
  const [selected, setSelected] = useState(null); // { category, subcategory }

  const loadWeakAndStats = useCallback(async () => {
    try {
      const [weak, progress] = await Promise.all([api.getWeakAreas(), api.getProgress()]);
      const wMap = {};
      for (const w of weak) wMap[`${w.category}__${w.subcategory}`] = w.totalCount;
      setWeakMap(wMap);

      const sMap = {};
      for (const s of progress.bySubcategory) sMap[`${s.category}__${s.subcategory}`] = s;
      setStatsMap(sMap);
    } catch (e) {
      // 靜默失敗，不影響主要練習功能
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadWeakAndStats();
  }, [refreshKey, loadWeakAndStats]);

  const toggleCategory = (key) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div>
      {CATEGORIES.map((cat) => (
        <div className="category-block" key={cat.key}>
          <div
            className="category-header"
            style={{ background: cat.color }}
            onClick={() => toggleCategory(cat.key)}
          >
            <span>{expanded[cat.key] ? '▾' : '▸'} {cat.label}</span>
          </div>
          {expanded[cat.key] && (
            <div className="category-body">
              {cat.items.map((item) => {
                const k = `${cat.key}__${item.key}`;
                const weakCount = weakMap[k];
                const stat = statsMap[k];
                const isActive = selected?.category === cat.key && selected?.subcategory === item.key;
                return (
                  <div
                    className="subitem"
                    key={item.key}
                    style={isActive ? { background: '#F0F1FA' } : undefined}
                    onClick={() => setSelected({ category: cat.key, subcategory: item.key, color: cat.color })}
                  >
                    <span>
                      {item.label}
                      {weakCount ? <span className="badge">{weakCount} 次錯誤</span> : null}
                      {stat ? (
                        <span className="stat-badge">
                          練習 {stat.attempts} 次・答對率 {Math.round((stat.correctCount / stat.attempts) * 100)}%
                        </span>
                      ) : null}
                    </span>
                    <span className="muted">開始練習 →</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {selected && (
        <PracticePanel
          key={`${selected.category}-${selected.subcategory}`}
          selected={selected}
          onAttempt={() => {
            onAttempt?.();
            loadWeakAndStats();
          }}
        />
      )}
    </div>
  );
}

const STAGE_LABEL = {
  simple: '簡單題 Simple',
  mixed: '混合題 Mixed',
  comprehensive: '綜合題 Comprehensive'
};
const TYPE_LABEL = {
  'fill-in-blank': '填空題 Fill-in-blank',
  'error-correction': '找錯題 Error Correction',
  translation: '中翻英 Translation',
  'multiple-choice': '選擇題 Multiple Choice'
};

function PracticePanel({ selected, onAttempt }) {
  const [loadingQ, setLoadingQ] = useState(false);
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [conceptIntro, setConceptIntro] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  // 問老師
  const [tutorQ, setTutorQ] = useState('');
  const [tutorAsking, setTutorAsking] = useState(false);
  const [tutorReplies, setTutorReplies] = useState([]); // [{q, a}]

  const loadQuestion = useCallback(async () => {
    setLoadingQ(true);
    setError('');
    setFeedback(null);
    setAnswer('');
    setRetryCount(0);
    setSummary(null);
    setTutorReplies([]);
    try {
      const q = await api.generateQuestion(selected.category, selected.subcategory);
      setQuestion(q);
      if (q.conceptIntro) setConceptIntro(q.conceptIntro);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingQ(false);
    }
  }, [selected]);

  useEffect(() => {
    loadQuestion();
  }, [loadQuestion]);

  const handleSubmit = async () => {
    if (!answer.trim()) {
      setError('請先輸入你的答案');
      return;
    }
    setGrading(true);
    setError('');
    try {
      const result = await api.gradeAnswer(
        selected.category,
        selected.subcategory,
        question.question,
        answer,
        question.questionType,
        question.topic,
        retryCount
      );
      setFeedback(result);
      onAttempt?.();
      if (!result.isCorrect) {
        setRetryCount((c) => c + 1);
      } else if (result.summaryDue) {
        setLoadingSummary(true);
        try {
          const s = await api.summarizeProgress(selected.category, selected.subcategory);
          setSummary(s);
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingSummary(false);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setGrading(false);
    }
  };

  const handleRetry = () => {
    setFeedback(null);
    setError('');
  };

  const handleAskTutor = async () => {
    if (!tutorQ.trim()) return;
    setTutorAsking(true);
    setError('');
    try {
      const r = await api.askTutor(selected.category, selected.subcategory, tutorQ, {
        conceptIntro,
        question: question?.question,
        userAnswer: answer || undefined,
        feedback: feedback || undefined
      });
      setTutorReplies((prev) => [...prev, { q: tutorQ, a: r.answerZh }]);
      setTutorQ('');
    } catch (e) {
      setError(e.message);
    } finally {
      setTutorAsking(false);
    }
  };

  const mustRetry = feedback && !feedback.isCorrect; // 規則3：答錯必須重做同一題
  const canNext = feedback && feedback.isCorrect;

  return (
    <div className="card practice-panel">
      <h3 style={{ marginTop: 0, color: selected.color }}>
        {selected.category} — {selected.subcategory}
      </h3>

      {loadingQ && <div className="loading">AI 出題中...</div>}

      {conceptIntro && !loadingQ && (
        <div className="question-box" style={{ background: '#F7F8FC', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>📘 概念講解 Concept Introduction</div>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{conceptIntro}</div>
        </div>
      )}

      {question && !loadingQ && (
        <div className="question-box">
          <div className="muted" style={{ marginBottom: 6 }}>
            {STAGE_LABEL[question.difficultyStage] || ''}・{TYPE_LABEL[question.questionType] || question.questionType}
            {question.topic ? `・主題：${question.topic}` : ''}
          </div>
          <div className="muted" style={{ marginBottom: 6 }}>{question.instructionZh}</div>
          <div style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{question.question}</div>
          {retryCount > 0 && !feedback && (
            <div style={{ marginTop: 8, color: '#B54708', fontWeight: 600 }}>
              第 {retryCount + 1} 次作答（答對才能進入下一題）
            </div>
          )}
        </div>
      )}

      {question && (
        <>
          <textarea
            style={{ minHeight: 100 }}
            placeholder="請輸入你的答案..."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={grading || !!feedback}
          />
          <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
            {!feedback && (
              <button className="primary" onClick={handleSubmit} disabled={grading}>
                {grading ? '批改中...' : '提交答案'}
              </button>
            )}
            {mustRetry && (
              <button className="primary" onClick={handleRetry}>
                重新作答本題
              </button>
            )}
            <button
              className="secondary"
              onClick={loadQuestion}
              disabled={loadingQ || mustRetry}
              title={mustRetry ? '答對本題後才能進入下一題' : undefined}
            >
              {canNext ? '下一題 →' : '換一題'}
            </button>
          </div>
          {mustRetry && (
            <div className="muted" style={{ marginTop: 6 }}>
              🔒 本題尚未答對，請根據批改內容重新作答，答對後才能進入下一題。
            </div>
          )}
        </>
      )}

      {error && <div className="error-msg">{error}</div>}

      {feedback && (
        <div className={`feedback-box ${feedback.isCorrect ? 'correct' : 'wrong'}`}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {feedback.isCorrect ? '✅ 答對了！' : '❌ 尚未完全正確'}
            {feedback.stagePromoted && <span style={{ marginLeft: 8 }}>🎉 難度升級：{STAGE_LABEL[feedback.difficultyStage]}</span>}
          </div>

          {feedback.bothOptionsFlawed && (
            <div style={{ background: '#FFF4E5', padding: '8px 10px', borderRadius: 6, marginBottom: 8 }}>
              <strong>⚠️ 誠實說明：</strong>本題選項設計有瑕疵。{feedback.flawedExplanationZh}
            </div>
          )}

          {feedback.corrections?.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8, fontSize: 14 }}>
              <thead>
                <tr>
                  {['使用者用法', '問題', '修正'].map((h) => (
                    <th key={h} style={{ border: '1px solid #ddd', padding: '6px 8px', background: '#F0F1FA', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {feedback.corrections.map((c, i) => (
                  <tr key={i}>
                    <td style={{ border: '1px solid #ddd', padding: '6px 8px' }}>{c.userUsage}</td>
                    <td style={{ border: '1px solid #ddd', padding: '6px 8px' }}>{c.issue}</td>
                    <td style={{ border: '1px solid #ddd', padding: '6px 8px' }}>{c.correction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginBottom: 6 }}>
            <strong>參考答案：</strong>{feedback.correctAnswer}
          </div>
          <div className="explain" style={{ whiteSpace: 'pre-wrap' }}>{feedback.explanationZh}</div>
          {feedback.relatedRule && (
            <div style={{ marginTop: 6 }}>
              <strong>📎 相關規則/搭配：</strong>
              <span style={{ whiteSpace: 'pre-wrap' }}>{feedback.relatedRule}</span>
            </div>
          )}
        </div>
      )}

      {loadingSummary && <div className="loading">產生進度總結中...</div>}
      {summary && (
        <div className="question-box" style={{ background: '#FFFBEB', marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            進度總結：{'⭐'.repeat(summary.stars)}{'☆'.repeat(5 - summary.stars)}（{summary.stars}/5）
          </div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{summary.summaryZh}</div>
          {summary.adviceZh && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}><strong>建議：</strong>{summary.adviceZh}</div>}
        </div>
      )}

      {question && (
        <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>🙋 問老師（隨時可提問）</div>
          {tutorReplies.map((t, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>你：{t.q}</div>
              <div style={{ whiteSpace: 'pre-wrap', background: '#F7F8FC', padding: '8px 10px', borderRadius: 6, marginTop: 4 }}>{t.a}</div>
            </div>
          ))}
          <textarea
            style={{ minHeight: 60 }}
            placeholder="對概念、題目或批改結果有疑問嗎？隨時提問，老師會認真分析回覆..."
            value={tutorQ}
            onChange={(e) => setTutorQ(e.target.value)}
          />
          <div style={{ marginTop: 6 }}>
            <button className="secondary" onClick={handleAskTutor} disabled={tutorAsking || !tutorQ.trim()}>
              {tutorAsking ? '老師思考中...' : '送出提問'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
