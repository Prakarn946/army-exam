import { getQuestions, getConfig, addAttempt } from './store.js?v=5';
import { getCurrentUser } from './auth.js?v=5';

const ACTIVE_EXAM_KEY = 'army_exam_active_session';

// Helper to shuffle an array
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Generate new exam session
export function startNewExam() {
    const questions = getQuestions();
    const config = getConfig();
    const selectedQuestions = [];

    // 1. Get questions per subject as configured in custom order
    let subjects = [];
    if (Array.isArray(config.subjectOrder)) {
        subjects = [...config.subjectOrder];
    }
    // Append any other subjects from config just in case
    Object.keys(config).forEach(key => {
        if (key !== 'durationMinutes' && key !== 'subjectOrder' && !subjects.includes(key)) {
            subjects.push(key);
        }
    });
    
    subjects.forEach(subject => {
        const subjectQuota = config[subject] || 0;
        if (subjectQuota <= 0) return;

        // Filter questions belonging to this subject
        const subjectQuestions = questions.filter(q => q.subject === subject);
        
        // Shuffle subject questions and select the quota
        const shuffledSubjectQuestions = shuffleArray(subjectQuestions);
        const selected = shuffledSubjectQuestions.slice(0, subjectQuota);
        
        selectedQuestions.push(...selected);
    });

    if (selectedQuestions.length === 0) {
        throw new Error('คลังข้อสอบว่างเปล่า หรือ แอดมินตั้งค่าจำนวนข้อสอบเป็น 0 ข้อ');
    }

    // 2. Keep the questions sorted by subject groups (no global shuffle to mix subjects)
    const finalQuestions = selectedQuestions;

    // 3. Keep choices sorted (A-D) to render ก-ง in order (no choices shuffling)
    const shuffledChoicesMap = {};
    finalQuestions.forEach(q => {
        const choices = [
            { key: 'A', text: q.options.A },
            { key: 'B', text: q.options.B },
            { key: 'C', text: q.options.C },
            { key: 'D', text: q.options.D }
        ];
        shuffledChoicesMap[q.id] = choices;
    });

    const durationMinutes = config.durationMinutes || 180;
    const durationMs = durationMinutes * 60 * 1000;
    const startTime = Date.now();

    const activeSession = {
        questions: finalQuestions,
        choicesMap: shuffledChoicesMap,
        answers: {}, // questionId -> selectedOptionKey (A, B, C, or D)
        markedForReview: [], // array of questionIds
        startTime: startTime,
        endTime: startTime + durationMs,
        currentQuestionIndex: 0
    };

    saveActiveSession(activeSession);
    return activeSession;
}

// Save exam session state to localStorage
export function saveActiveSession(session) {
    localStorage.setItem(ACTIVE_EXAM_KEY, JSON.stringify(session));
}

// Get current active session
export function getActiveSession(allowExpired = false) {
    const sessionJson = localStorage.getItem(ACTIVE_EXAM_KEY);
    if (!sessionJson) return null;
    try {
        const session = JSON.parse(sessionJson);
        // Check if exam is expired
        if (!allowExpired && Date.now() > session.endTime) {
            return null; // Expired
        }
        return session;
    } catch (e) {
        return null;
    }
}

// Clear active session
export function clearActiveSession() {
    localStorage.removeItem(ACTIVE_EXAM_KEY);
}

// Select an answer for a question
export function answerQuestion(questionId, optionKey) {
    const session = getActiveSession();
    if (!session) return;
    session.answers[questionId] = optionKey;
    saveActiveSession(session);
}

// Toggle Mark for Review
export function toggleMarkForReview(questionId) {
    const session = getActiveSession();
    if (!session) return;
    
    const index = session.markedForReview.indexOf(questionId);
    if (index > -1) {
        session.markedForReview.splice(index, 1);
    } else {
        session.markedForReview.push(questionId);
    }
    
    saveActiveSession(session);
    return session.markedForReview.includes(questionId);
}

// Submit and grade the exam
export function submitExam(userGmail, userName) {
    const session = getActiveSession(true);
    if (!session) throw new Error('ไม่พบเซสชันการสอบปัจจุบัน หรือหมดเวลาการทำข้อสอบแล้ว');

    const questions = session.questions;
    const answers = session.answers;
    
    let totalScore = 0;
    const subjectStats = {}; // subject -> { correct, total }

    // Prepare detailed answers list
    const questionResults = questions.map(q => {
        const userAnswer = answers[q.id] || null;
        const isCorrect = userAnswer === q.correct;
        
        if (isCorrect) {
            totalScore++;
        }

        // Subject stats accumulation
        if (!subjectStats[q.subject]) {
            subjectStats[q.subject] = { correct: 0, total: 0 };
        }
        subjectStats[q.subject].total++;
        if (isCorrect) {
            subjectStats[q.subject].correct++;
        }

        return {
            id: q.id,
            subject: q.subject,
            question: q.question,
            options: q.options,
            correct: q.correct,
            explanation: q.explanation,
            userAnswer: userAnswer,
            isCorrect: isCorrect,
            shuffledChoices: session.choicesMap[q.id]
        };
    });

    const totalQuestions = questions.length;
    const totalPercentage = totalQuestions > 0 ? Math.round((totalScore / totalQuestions) * 100) : 0;

    const currentUser = getCurrentUser();
    const qualification = currentUser ? currentUser.qualification : 'ม.ปลาย';

    const attemptResult = {
        id: 'att_' + Date.now(),
        userGmail: userGmail,
        userName: userName,
        timestamp: Date.now(),
        totalQuestions: totalQuestions,
        totalScore: totalScore,
        percentage: totalPercentage,
        subjectStats: subjectStats,
        questionResults: questionResults,
        qualification: qualification
    };

    // Save attempt in store
    addAttempt(attemptResult);

    // Clear session
    clearActiveSession();

    return attemptResult;
}
