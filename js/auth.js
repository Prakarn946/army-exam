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
export function loginUser(gmail, password) {
    if (!gmail || !password) {
        throw new Error('กรุณากรอก Gmail และรหัสผ่าน');
    }

    const users = getUsers();
    const user = users.find(u => u.gmail.toLowerCase() === gmail.toLowerCase() && u.password === password);

    if (!user) {
        throw new Error('Gmail หรือรหัสผ่านไม่ถูกต้อง');
    }

    // Save user session in sessionStorage
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return user;
}

// Log out user
export function logoutUser() {
    sessionStorage.removeItem(SESSION_KEY);
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
