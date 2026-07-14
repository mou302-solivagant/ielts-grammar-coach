import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, 'data.json');

const defaultData = {
  writingAnalyses: [],   // { id, taskType, essayText, bandScore, criteria, sentenceCorrections, errorDiagnosis, createdAt }
  practiceAttempts: [],  // { id, category, subcategory, question, userAnswer, isCorrect, explanationZh, correctAnswer, createdAt }
  nextAnalysisId: 1,
  nextAttemptId: 1
};

const adapter = new JSONFile(file);
const db = new Low(adapter, defaultData);

export async function initDb() {
  await db.read();
  db.data ||= structuredClone(defaultData);
  db.data.writingAnalyses ||= [];
  db.data.practiceAttempts ||= [];
  db.data.nextAnalysisId ||= 1;
  db.data.nextAttemptId ||= 1;
  await db.write();
}

export default db;
