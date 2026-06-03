import { getQuestions, saveQuestions, getUsers, saveUsers, getConfig, saveConfig } from './store.js?v=5';

// Helper to parse CSV robustly (handling commas within quotes, escaped quotes)
export function parseCSV(text) {
    const lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        let c = text[i];
        let next = text[i+1];
        if (c === '"') {
            if (inQuotes && next === '"') {
                row[row.length - 1] += '"';
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            row.push("");
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') {
                i++; // Skip \n
            }
            lines.push(row);
            row = [""];
        } else {
            row[row.length - 1] += c;
        }
    }
    if (row.length > 1 || row[0] !== "") {
        lines.push(row);
    }
    return lines;
}

// Map headers to fields dynamically
function mapCSVRowsToQuestions(rows) {
    if (rows.length < 2) throw new Error('ไฟล์ข้อมูลว่างเปล่าหรือไม่มีข้อมูลแถว');
    
    const headers = rows[0].map(h => h.trim().toLowerCase());
    
    // Find index of required fields
    const getIndex = (aliases) => {
        return headers.findIndex(h => aliases.some(alias => h.includes(alias)));
    };

    const subjectIdx = getIndex(['subject', 'วิชา']);
    const questionIdx = getIndex(['question', 'คำถาม', 'โจทย์']);
    const optionAIdx = getIndex(['option a', 'optiona', 'ตัวเลือก ก', 'ก', 'a']);
    const optionBIdx = getIndex(['option b', 'optionb', 'ตัวเลือก ข', 'ข', 'b']);
    const optionCIdx = getIndex(['option c', 'optionc', 'ตัวเลือก ค', 'ค', 'c']);
    const optionDIdx = getIndex(['option d', 'optiond', 'ตัวเลือก ง', 'ง', 'd']);
    const correctIdx = getIndex(['correct', 'เฉลย', 'คำตอบที่ถูก']);
    const explanationIdx = getIndex(['explanation', 'คำอธิบาย', 'เฉลยละเอียด', 'เหตุผล']);

    // Validation
    if (subjectIdx === -1 || questionIdx === -1 || optionAIdx === -1 || optionBIdx === -1 || 
        optionCIdx === -1 || optionDIdx === -1 || correctIdx === -1) {
        throw new Error('โครงสร้างหัวตาราง (Headers) ใน Google Sheet ไม่ถูกต้อง ยืนยันว่าต้องมีคอลัมน์: วิชา, คำถาม, ก, ข, ค, ง, เฉลย');
    }

    const questionsList = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 7 || !row[questionIdx]) continue; // Skip empty rows

        // Normalize correct answer
        let correctVal = row[correctIdx].trim().toUpperCase();
        if (correctVal.includes('ก') || correctVal === '1') correctVal = 'A';
        else if (correctVal.includes('ข') || correctVal === '2') correctVal = 'B';
        else if (correctVal.includes('ค') || correctVal === '3') correctVal = 'C';
        else if (correctVal.includes('ง') || correctVal === '4') correctVal = 'D';
        
        // Clean to only A, B, C, D
        correctVal = correctVal.charAt(0);
        if (!['A', 'B', 'C', 'D'].includes(correctVal)) {
            correctVal = 'A'; // fallback
        }

        questionsList.push({
            id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            subject: row[subjectIdx].trim(),
            question: row[questionIdx].trim(),
            options: {
                A: row[optionAIdx].trim(),
                B: row[optionBIdx].trim(),
                C: row[optionCIdx].trim(),
                D: row[optionDIdx].trim()
            },
            correct: correctVal,
            explanation: explanationIdx !== -1 && row[explanationIdx] ? row[explanationIdx].trim() : 'ไม่มีคำอธิบายเพิ่มเติม'
        });
    }

    return questionsList;
}

// Fetch questions from public Google Sheet CSV link
export async function syncFromGoogleSheets(url, mode = 'append', subjectFilter = 'all', qualification) {
    // Convert normal Google Sheets share link to direct CSV export link if applicable
    let csvUrl = url.trim();
    if (csvUrl.includes('docs.google.com/spreadsheets')) {
        if (!csvUrl.includes('output=csv') && !csvUrl.includes('/export?')) {
            // Extract spreadsheet ID
            const matches = csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (matches && matches[1]) {
                const sheetId = matches[1];
                // Check if GID is specified
                const gidMatch = csvUrl.match(/[#&]gid=([0-9]+)/);
                const gid = gidMatch ? gidMatch[1] : '0';
                csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
            }
        }
    }

    const response = await fetch(csvUrl);
    if (!response.ok) {
        throw new Error('ไม่สามารถดึงข้อมูลจากลิงก์ที่ระบุได้ กรุณาตรวจสอบสิทธิ์การแชร์ลิงก์ (ต้องแชร์สาธารณะ: ทุกคนที่มีลิงก์มีสิทธิ์ดู)');
    }

    const text = await response.text();
    const rows = parseCSV(text);
    let parsedQuestions = mapCSVRowsToQuestions(rows);

    // Tag each question with sourceFile and qualification
    parsedQuestions.forEach(q => {
        q.sourceFile = "Google Sheets Sync";
        q.qualification = qualification;
    });

    // If targeting a specific subject, override all imported questions' subject to subjectFilter
    if (subjectFilter !== 'all') {
        parsedQuestions.forEach(q => {
            q.subject = subjectFilter;
        });
    }

    const currentQuestions = getQuestions();
    let finalQuestions = [];

    if (subjectFilter === 'all') {
        if (mode === 'overwrite') {
            finalQuestions = parsedQuestions;
        } else {
            // Append mode (avoid duplicates based on question text and subject)
            finalQuestions = [...currentQuestions];
            parsedQuestions.forEach(newQ => {
                const exists = currentQuestions.some(q => q.question.toLowerCase() === newQ.question.toLowerCase() && q.subject.toLowerCase() === newQ.subject.toLowerCase());
                if (!exists) {
                    finalQuestions.push(newQ);
                }
            });
        }
    } else {
        // Specific subject mode
        if (mode === 'overwrite') {
            // Clear only questions belonging to the selected subject
            const otherQuestions = currentQuestions.filter(q => q.subject.toLowerCase() !== subjectFilter.toLowerCase());
            finalQuestions = [...otherQuestions, ...parsedQuestions];
        } else {
            // Append and avoid duplicates within this subject
            finalQuestions = [...currentQuestions];
            parsedQuestions.forEach(newQ => {
                const exists = currentQuestions.some(q => q.question.toLowerCase() === newQ.question.toLowerCase() && q.subject.toLowerCase() === subjectFilter.toLowerCase());
                if (!exists) {
                    finalQuestions.push(newQ);
                }
            });
        }
    }

    saveQuestions(finalQuestions, qualification);
    updateSubjectConfigs(qualification);
    return parsedQuestions.length;
}

// Update subject configuration keys if new subjects are added
export function updateSubjectConfigs(qualification) {
    const questions = getQuestions();
    const config = getConfig();
    
    // Get unique subjects
    const subjects = new Set();
    questions.forEach(q => {
        if (q.subject) subjects.add(q.subject);
    });

    let updated = false;
    subjects.forEach(sub => {
        if (config[sub] === undefined) {
            config[sub] = 5; // Default quota
            updated = true;
        }
    });

    if (updated) {
        saveConfig(config, qualification);
    }
}

// Add/Update individual question
export function saveQuestionItem(questionData, qualification) {
    const questions = getQuestions();
    const qScope = qualification || questionData.qualification;
    
    if (questionData.id) {
        // Edit mode
        const index = questions.findIndex(q => q.id === questionData.id);
        if (index > -1) {
            questions[index] = { ...questions[index], ...questionData };
        } else {
            questions.push(questionData);
        }
    } else {
        // Add mode
        questionData.id = 'q_' + Date.now();
        questions.push(questionData);
    }

    saveQuestions(questions, qScope);
    updateSubjectConfigs(qScope);
    return questionData;
}

// Delete question
export function deleteQuestionItem(id, qualification) {
    const questions = getQuestions();
    const updated = questions.filter(q => q.id !== id);
    saveQuestions(updated, qualification);
    updateSubjectConfigs(qualification);
}

// Save Subject Config Questions Limit
export function saveSubjectConfig(subject, count, qualification) {
    const config = getConfig();
    config[subject] = parseInt(count) || 0;
    saveConfig(config, qualification);
}

// Save Duration Limit
export function saveExamDuration(minutes, qualification) {
    const config = getConfig();
    config.durationMinutes = parseInt(minutes) || 180;
    saveConfig(config, qualification);
}

// Add Member/User
export function addMember(gmail, password, name, role = 'candidate', qualification) {
    const users = getUsers();
    const exists = users.some(u => u.gmail.toLowerCase() === gmail.toLowerCase());
    
    if (exists) {
        throw new Error('Gmail นี้ถูกใช้งานในระบบแล้ว');
    }

    const newUser = {
        gmail: gmail.toLowerCase(),
        password: password,
        name: name,
        role: role,
        qualification: qualification
    };

    users.push(newUser);
    saveUsers(users, qualification);
    return newUser;
}

// Update Member/User
export function updateMember(gmail, updateData, qualification) {
    const users = getUsers();
    const index = users.findIndex(u => u.gmail.toLowerCase() === gmail.toLowerCase());
    if (index > -1) {
        users[index] = { ...users[index], ...updateData };
        saveUsers(users, qualification);
        return users[index];
    }
    throw new Error('ไม่พบข้อมูลสมาชิกนี้');
}

// Delete Member/User
export function deleteMember(gmail, qualification) {
    const users = getUsers();
    const updated = users.filter(u => u.gmail.toLowerCase() !== gmail.toLowerCase());
    saveUsers(updated, qualification);
}
