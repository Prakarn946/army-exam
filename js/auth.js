import { getUsers, saveUsers } from './store.js?v=5';

const SESSION_KEY = 'army_exam_logged_in_user';

// Register a new user
export function registerUser(gmail, password, name, role = 'candidate') {
    if (!gmail || !password || !name) {
        throw new Error('กรุณากรอกข้อมูลให้ครบถ้วน');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(gmail)) {
        throw new Error('รูปแบบ Gmail ไม่ถูกต้อง');
    }

    const users = getUsers();
    const userExists = users.some(u => u.gmail.toLowerCase() === gmail.toLowerCase());
    
    if (userExists) {
        throw new Error('Gmail นี้ถูกใช้งานในระบบแล้ว');
    }

    const newUser = {
        gmail: gmail.toLowerCase(),
        password: password,
        name: name,
        role: role
    };

    users.push(newUser);
    saveUsers(users);
    
    // Sync candidate registration safely to the server database
    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
    }).catch(err => console.error("Error syncing registration to server:", err));

    return newUser;
}

// Log in a user
export async function loginUser(gmail, password) {
    if (!gmail || !password) {
        throw new Error('กรุณากรอก Gmail และรหัสผ่าน');
    }

    // Generate a unique session ID
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gmail: gmail, password: password, sessionId: sessionId })
    });

    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'เข้าสู่ระบบล้มเหลว');
    }

    const data = await res.json();
    const user = data.user;

    // Save user session and sessionId in sessionStorage
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    sessionStorage.setItem('army_exam_session_id', sessionId);
    return user;
}

// Log out user
export function logoutUser() {
    const user = getCurrentUser();
    if (user && user.gmail) {
        fetch('/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gmail: user.gmail })
        }).catch(err => console.error("Error logging out from server:", err));
    }
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('army_exam_session_id');
}

// Get current logged-in user
export function getCurrentUser() {
    const userJson = sessionStorage.getItem(SESSION_KEY);
    if (!userJson) return null;
    try {
        return JSON.parse(userJson);
    } catch (e) {
        return null;
    }
}

// Check if user is admin
export function isAdmin() {
    const user = getCurrentUser();
    return user && user.role === 'admin';
}

// Check if user is logged in
export function isLoggedIn() {
    return getCurrentUser() !== null;
}
