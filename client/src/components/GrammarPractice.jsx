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

function PracticePanel({ selected, onAttempt }) {
  const [loadingQ, setLoadingQ] = useState(false);
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');

  const loadQuestion = useCallback(async () => {
    setLoadingQ(true);
    setError('');
    setFeedback(null);
    setAnswer('');
    try {
      const q = await api.generateQuestion(selected.category, selected.subcategory);
      setQuestion(q);
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
      const result = await api.gradeAnswer(selected.category, selected.subcategory, question.question, answer);
      setFeedback(result);
      onAttempt?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setGrading(false);
    }
  };

  return (
    <div className="card practice-panel">
      <h3 style={{ marginTop: 0, color: selected.color }}>
        {selected.category} — {selected.subcategory}
      </h3>

      {loadingQ && <div className="loading">AI 出題中...</div>}

      {question && !loadingQ && (
        <div className="question-box">
          <div className="muted" style={{ marginBottom: 6 }}>{question.instructionZh}</div>
          <div style={{ fontSize: 15, lineHeight: 1.6 }}>{question.question}</div>
        </div>
      )}

      {question && (
        <>
          <textarea
            style={{ minHeight: 100 }}
            placeholder="請輸入你的答案..."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
            <button className="primary" onClick={handleSubmit} disabled={grading}>
              {grading ? '批改中...' : '提交答案'}
            </button>
            <button className="secondary" onClick={loadQuestion} disabled={loadingQ}>
              換一題
            </button>
          </div>
        </>
      )}

      {error && <div className="error-msg">{error}</div>}

      {feedback && (
        <div className={`feedback-box ${feedback.isCorrect ? 'correct' : 'wrong'}`}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {feedback.isCorrect ? '✅ 答對了！' : '❌ 尚未完全正確'}
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>參考答案：</strong>{feedback.correctAnswer}
          </div>
          <div className="explain">{feedback.explanationZh}</div>
        </div>
      )}
    </div>
  );
}
