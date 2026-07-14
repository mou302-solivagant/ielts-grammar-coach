import React, { useState } from 'react';
import { api } from '../api.js';

const CRITERIA_LABELS = {
  taskAchievement: '寫作任務達成 Task Achievement',
  coherenceCohesion: '連貫與銜接 Coherence & Cohesion',
  lexicalResource: '詞彙運用 Lexical Resource',
  grammarAccuracy: '文法準確度 Grammar Accuracy'
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB，留一點餘裕給 base64 膨脹後仍小於 body 上限

export default function WritingAnalysis({ onAnalyzed }) {
  const [taskType, setTaskType] = useState('task2');
  const [promptText, setPromptText] = useState('');
  const [essayText, setEssayText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [image, setImage] = useState(null); // { mediaType, data, previewUrl }

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('圖片格式請使用 PNG、JPEG、WEBP 或 GIF');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('圖片檔案太大，請控制在 8MB 以內');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result; // "data:image/png;base64,xxxx"
      const base64 = dataUrl.split(',')[1];
      setImage({ mediaType: file.type, data: base64, previewUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => setImage(null);

  const handleAnalyze = async () => {
    if (!essayText.trim()) {
      setError('請先貼上你的作文內容');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const imagePayload = taskType === 'task1' && image ? { mediaType: image.mediaType, data: image.data } : undefined;
      const data = await api.analyzeWriting(taskType, essayText, imagePayload, promptText);
      setResult(data);
      onAnalyzed?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="radio-group">
          <label>
            <input
              type="radio"
              checked={taskType === 'task1'}
              onChange={() => setTaskType('task1')}
            />{' '}
            Task 1
          </label>
          <label>
            <input
              type="radio"
              checked={taskType === 'task2'}
              onChange={() => setTaskType('task2')}
            />{' '}
            Task 2
          </label>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="muted" style={{ marginBottom: 6 }}>
            題目（選填，貼上完整題目可讓 AI 更準確評估 Task Achievement）
          </div>
          <textarea
            style={{ minHeight: 80 }}
            placeholder={
              taskType === 'task1'
                ? '例如：The chart below shows... Summarise the information by selecting and reporting the main features...'
                : '例如：Some people believe that... To what extent do you agree or disagree?'
            }
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
          />
        </div>

        {taskType === 'task1' && (
          <div style={{ marginBottom: 14 }}>
            <div className="muted" style={{ marginBottom: 6 }}>
              上傳題目圖表（長條圖／折線圖／圓餅圖／地圖／流程圖等，選填，但強烈建議上傳以提升 Task Achievement 評分準確度）
            </div>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageChange} />
            {image && (
              <div style={{ marginTop: 10 }}>
                <img
                  src={image.previewUrl}
                  alt="Task 1 圖表預覽"
                  style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8, border: '1px solid #D8DAE8' }}
                />
                <div style={{ marginTop: 6 }}>
                  <button className="secondary" onClick={clearImage}>移除圖片</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="muted" style={{ marginBottom: 6 }}>作文內容</div>
        <textarea
          placeholder="請貼上你的 IELTS 作文內容..."
          value={essayText}
          onChange={(e) => setEssayText(e.target.value)}
        />
        <div style={{ marginTop: 12 }}>
          <button className="primary" onClick={handleAnalyze} disabled={loading}>
            {loading ? 'AI 分析中...' : '開始分析'}
          </button>
        </div>
        {error && <div className="error-msg">{error}</div>}
      </div>

      {result && (
        <>
          <div className="band-hero">
            <div className="muted" style={{ color: '#DDE3FF' }}>預估 Band Score</div>
            <div className="band-num">{result.bandScore}</div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0, color: '#2C3E7A' }}>評分標準細項</h3>
            <div className="score-grid">
              {Object.entries(result.criteria || {}).map(([key, val]) => (
                <div className="score-card" key={key}>
                  <div>{CRITERIA_LABELS[key] || key}</div>
                  <div className="score-num">{val.score}</div>
                  <div className="explain">{val.noteZh}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0, color: '#2C3E7A' }}>逐句修正</h3>
            {(result.sentenceCorrections || []).length === 0 && (
              <div className="muted">沒有偵測到需要修正的句子。</div>
            )}
            {(result.sentenceCorrections || []).map((c, i) => (
              <div className="correction-item" key={i}>
                <div className="orig">{c.original}</div>
                <div className="fixed">{c.corrected}</div>
                <div className="explain">{c.explanationZh}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0, color: '#2C3E7A' }}>文法錯誤診斷</h3>
            {(result.errorDiagnosis || []).length === 0 && (
              <div className="muted">沒有偵測到明顯的文法錯誤類別。</div>
            )}
            {(result.errorDiagnosis || []).map((d, i) => (
              <div key={i} className="subitem" style={{ background: '#F7F8FC' }}>
                <span>{d.category} — {d.subcategory}</span>
                <span className="badge">{d.count} 次</span>
              </div>
            ))}
            <div className="muted" style={{ marginTop: 8 }}>
              這些診斷已自動帶入「文法練習」與「進度追蹤」頁面的弱項標記。
            </div>
          </div>
        </>
      )}
    </div>
  );
}
