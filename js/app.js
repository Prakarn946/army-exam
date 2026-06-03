import { initStore, getQuestions, saveQuestions, getAttempts, getConfig, saveConfig, resetDatabase, getSubjects, getUsers, saveUsers, syncFromBackend, saveAttempts, getDbSizeBytes, setActiveQualification } from './store.js?v=5';
import { registerUser, loginUser, logoutUser, getCurrentUser, isAdmin, isLoggedIn } from './auth.js?v=5';
import { startNewExam, getActiveSession, answerQuestion, toggleMarkForReview, submitExam, clearActiveSession, saveActiveSession } from './exam.js?v=5';
import { saveQuestionItem, deleteQuestionItem, saveSubjectConfig, saveExamDuration, addMember, updateMember, deleteMember, syncFromGoogleSheets, updateSubjectConfigs } from './admin.js?v=5';

// Global app state
let timerIntervalId = null;
let profileCropperInstance = null;
let progressChartInstance = null;
let realtimeIntervalId = null;
let appendRealtimeActivityLog = null;
let activeQualificationScope = 'ม.ปลาย';


// UI Toast Helper
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Router: Show active view
function showView(viewId) {
    window.currentActiveView = viewId;
    if (typeof sendHeartbeat === 'function') {
        sendHeartbeat();
    }
    const views = ['auth-view', 'dashboard-view', 'exam-view', 'results-view'];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (id === viewId) {
            if (el) {
                el.classList.remove('d-none');
                el.classList.remove('fade-in');
                void el.offsetWidth; // Trigger reflow
                el.classList.add('fade-in');
            }
        } else {
            if (el) {
                el.classList.add('d-none');
                el.classList.remove('fade-in');
            }
        }
    });

    // Update Header visibility
    const header = document.getElementById('app-header');
    const user = getCurrentUser();
    
    if (user && viewId !== 'auth-view') {
        if (header) header.classList.remove('d-none');
        const userNameEl = document.getElementById('header-user-name');
        if (userNameEl) userNameEl.textContent = user.name;
        const userRoleEl = document.getElementById('header-user-role');
        if (userRoleEl) userRoleEl.textContent = user.role === 'admin' ? 'ผู้ดูแลระบบ (Admin)' : 'ผู้เข้าสอบ';
        
        // Render header avatar (image or letter fallback)
        const letterAvatar = document.getElementById('header-user-avatar-letter');
        const imgAvatar = document.getElementById('header-user-avatar-img');
        
        // Fetch fresh copy from DB because profileImage might have updated
        const freshUser = getUsers().find(u => u.gmail.toLowerCase() === user.gmail.toLowerCase()) || user;

        if (letterAvatar && imgAvatar) {
            if (freshUser.profileImage) {
                letterAvatar.classList.add('d-none');
                imgAvatar.classList.remove('d-none');
                imgAvatar.src = freshUser.profileImage;
            } else {
                letterAvatar.classList.remove('d-none');
                imgAvatar.classList.add('d-none');
                letterAvatar.textContent = freshUser.name.charAt(0).toUpperCase();
            }
        }
        
        // Show/Hide Admin toggle button
        const adminBtn = document.getElementById('admin-toggle-btn');
        if (adminBtn) {
            adminBtn.classList.add('d-none'); // Always hide admin toggle in header
        }

        // Show/Hide Admin Copy Link button
        const copyLinkBtn = document.getElementById('admin-copy-link-btn');
        if (copyLinkBtn) {
            if (user.role === 'admin') {
                copyLinkBtn.classList.remove('d-none');
            } else {
                copyLinkBtn.classList.add('d-none');
            }
        }
    } else {
        if (header) header.classList.add('d-none');
    }

    // Scroll to top
    window.scrollTo(0, 0);
}

// Periodic background sync from server
async function runPeriodicSync() {
    try {
        // Skip periodic sync during an active exam to ensure perfect performance
        if (window.currentActiveView === 'exam-view') {
            return;
        }
        
        const user = getCurrentUser();
        let scope = undefined;
        if (user) {
            scope = user.role === 'admin' ? activeQualificationScope : user.qualification;
        }
        // Background sync only needs attempts/users, so we skip downloading questions (very heavy)
        const synced = await syncFromBackend(scope, true);
        if (synced && user) {
            if (user.role === 'admin') {
                renderLeaderboard();
                renderDatabaseCapacity();
            } else {
                if (window.currentActiveView === 'dashboard-view') {
                    renderAttemptsHistory(user.gmail);
                }
            }
        }
    } catch (err) {
        console.error("Periodic sync error:", err);
    }
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Init Database Store
    const userOnLoad = getCurrentUser();
    let initScope = undefined;
    if (userOnLoad) {
        initScope = userOnLoad.role === 'admin' ? activeQualificationScope : userOnLoad.qualification;
    }
    await initStore(initScope);
    
    // Start real-time heartbeat sync loop (every 8 seconds)
    setInterval(sendHeartbeat, 8000);
    sendHeartbeat();

    // 2. Bind Auth UI switching
    const switchToReg = document.getElementById('switch-to-register');
    if (switchToReg) {
        switchToReg.addEventListener('click', () => {
            document.getElementById('login-form-container').classList.add('d-none');
            document.getElementById('register-form-container').classList.remove('d-none');
        });
    }

    const switchToLog = document.getElementById('switch-to-login');
    if (switchToLog) {
        switchToLog.addEventListener('click', () => {
            document.getElementById('register-form-container').classList.add('d-none');
            document.getElementById('login-form-container').classList.remove('d-none');
        });
    }

    // 3. Theme Toggle Button
    const themeBtn = document.getElementById('theme-toggle-btn');
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    
    themeBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';

        // Re-draw chart to adapt to theme changes
        const user = getCurrentUser();
        if (user && user.role !== 'admin' && window.currentActiveView === 'dashboard-view') {
            renderAttemptsHistory(user.gmail);
        }
    });

    // 4. Log out handler
    document.getElementById('logout-btn').addEventListener('click', () => {
        if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) {
            clearInterval(timerIntervalId);
            logoutUser();
            showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
            showView('auth-view');
        }
    });

    // 4.1. Admin Copy Link handler
    const copyLinkBtn = document.getElementById('admin-copy-link-btn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => {
            const url = window.location.origin;
            navigator.clipboard.writeText(url).then(() => {
                showToast('📋 คัดลอกลิงก์สอบเรียบร้อยแล้ว! ส่งให้สมาชิกเข้าสอบได้ทันที');
            }).catch(err => {
                // Fallback copy method
                const el = document.createElement('textarea');
                el.value = url;
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
                showToast('📋 คัดลอกลิงก์สอบเรียบร้อยแล้ว! ส่งให้สมาชิกเข้าสอบได้ทันที');
            });
        });
    }

    // 4.2. Admin Reset Leaderboard handler
    const resetLeaderboardBtn = document.getElementById('reset-leaderboard-btn');
    if (resetLeaderboardBtn) {
        resetLeaderboardBtn.addEventListener('click', () => {
            if (confirm('⚠️ คุณต้องการรีเซ็ตประวัติคะแนนสอบของทุกคนใช่หรือไม่?\nการดำเนินการนี้จะล้างบอร์ดคะแนนสูงสุดทั้งหมดกลับเป็นค่าเริ่มต้น!')) {
                saveAttempts([], activeQualificationScope);
                showToast('🔄 รีเซ็ตประวัติคะแนนสูงสุดเรียบร้อยแล้ว');
                renderLeaderboard();
            }
        });
    }

    // 4.3. Start background periodic sync from server (every 60 seconds)
    setInterval(runPeriodicSync, 60000);

    // 5. Admin Panel toggles
    const adminToggleBtn = document.getElementById('admin-toggle-btn');
    if (adminToggleBtn) {
        adminToggleBtn.addEventListener('click', () => {
            if (isAdmin()) {
                goToDashboard();
            } else {
                showToast('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้', 'error');
            }
        });
    }

    const adminBackBtn = document.getElementById('admin-back-dashboard');
    if (adminBackBtn) {
        adminBackBtn.addEventListener('click', () => {
            goToDashboard();
        });
    }

    // 6. Form submissions (Login & Register)
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            try {
                const user = await loginUser(email, pass);
                showToast(`เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ${user.name}`);
                loginForm.reset();
                checkSessionAndRedirect();
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    }

    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const pass = document.getElementById('register-password').value;
            try {
                registerUser(email, pass, name, 'candidate');
                showToast('สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบด้วยบัญชีของคุณ');
                registerForm.reset();
                document.getElementById('register-form-container').classList.add('d-none');
                document.getElementById('login-form-container').classList.remove('d-none');
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    }

    // 7. Exam controls
    const instructionModal = document.getElementById('instruction-modal');
    
    document.getElementById('dashboard-start-exam-btn').addEventListener('click', () => {
        if (instructionModal) {
            instructionModal.style.display = 'flex';
        }
    });

    const closeInstructionModal = () => {
        if (instructionModal) {
            instructionModal.style.display = 'none';
        }
    };

    const instCloseBtn = document.getElementById('instruction-modal-close');
    if (instCloseBtn) {
        instCloseBtn.addEventListener('click', closeInstructionModal);
    }

    const instCancelBtn = document.getElementById('instruction-cancel-btn');
    if (instCancelBtn) {
        instCancelBtn.addEventListener('click', closeInstructionModal);
    }

    const instStartBtn = document.getElementById('instruction-start-btn');
    if (instStartBtn) {
        instStartBtn.addEventListener('click', () => {
            closeInstructionModal();
            startExamSession();
        });
    }

    const sidebarSubmitBtn = document.getElementById('exam-sidebar-submit-btn');
    if (sidebarSubmitBtn) {
        sidebarSubmitBtn.addEventListener('click', () => {
            triggerExamSubmission();
        });
    }

    // Timeframe buttons click binder
    const tfContainer = document.getElementById('timeframe-buttons-container');
    if (tfContainer) {
        tfContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.timeframe-btn');
            if (!btn) return;
            
            tfContainer.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const user = getCurrentUser();
            if (user) {
                renderAttemptsHistory(user.gmail);
            }
        });
    }

    // 8. Auto check session on startup
    checkSessionAndRedirect();
});

// Check if logged in and route accordingly
function checkSessionAndRedirect() {
    if (isLoggedIn()) {
        // If there is an active exam running, restore it
        const activeExam = getActiveSession();
        if (activeExam) {
            showToast('กู้คืนสถานะการทำข้อสอบเดิมของคุณล่าสุด...', 'info');
            goToExamRoom(activeExam);
        } else {
            // Check if there is an expired active session in localStorage to auto-submit
            const rawSession = localStorage.getItem('army_exam_active_session');
            if (rawSession) {
                try {
                    const session = JSON.parse(rawSession);
                    if (Date.now() > session.endTime) {
                        showToast('หมดเวลาระหว่างที่คุณไม่อยู่! ระบบกำลังประมวลผลส่งคำตอบและสรุปคะแนน...', 'warning');
                        const user = getCurrentUser();
                        if (user) {
                            const result = submitExam(user.gmail, user.name);
                            showExamResults(result);
                            return;
                        }
                    }
                } catch (e) {
                    localStorage.removeItem('army_exam_active_session');
                }
            }
            goToDashboard();
        }
    } else {
        showView('auth-view');
    }
}

// ==========================================
// DASHBOARD CONTROLLERS
// ==========================================
async function goToDashboard() {
    showView('dashboard-view');
    const user = getCurrentUser();
    if (!user) return;
    
    // Sync qualification scoped data first!
    if (user.role === 'admin') {
        await syncFromBackend(activeQualificationScope);
    } else {
        await syncFromBackend(user.qualification);
    }
    
    const candidateContainer = document.getElementById('candidate-dashboard-container');
    const adminContainer = document.getElementById('admin-dashboard-container');

    if (user.role === 'admin') {
        if (candidateContainer) candidateContainer.classList.add('d-none');
        if (adminContainer) adminContainer.classList.remove('d-none');
        initAdminDashboard();
    } else {
        if (adminContainer) adminContainer.classList.add('d-none');
        if (candidateContainer) candidateContainer.classList.remove('d-none');

        const dbUserName = document.getElementById('dashboard-user-name');
        if (dbUserName) dbUserName.textContent = user.name;

        // Render Dashboard Avatar (image or letter fallback)
        const dbLetterAvatar = document.getElementById('dashboard-user-avatar-letter');
        const dbImgAvatar = document.getElementById('dashboard-user-avatar-img');
        const fileInput = document.getElementById('profile-avatar-input');

        // Fetch fresh user data from DB to check for updated image
        const freshUser = getUsers().find(u => u.gmail.toLowerCase() === user.gmail.toLowerCase()) || user;

        if (dbLetterAvatar && dbImgAvatar) {
            if (freshUser.profileImage) {
                dbLetterAvatar.classList.add('d-none');
                dbImgAvatar.classList.remove('d-none');
                dbImgAvatar.src = freshUser.profileImage;
            } else {
                dbLetterAvatar.classList.remove('d-none');
                dbImgAvatar.classList.add('d-none');
                dbLetterAvatar.textContent = freshUser.name.charAt(0).toUpperCase();
            }
        }

        // Trigger upload element clicks
        const triggerUpload = () => { if (fileInput) fileInput.click(); };
        const avatarTrigger = document.getElementById('dashboard-profile-avatar-trigger');
        if (avatarTrigger) avatarTrigger.onclick = triggerUpload;
        const profileChangeBtn = document.getElementById('dashboard-profile-change-btn');
        if (profileChangeBtn) profileChangeBtn.onclick = triggerUpload;

        // Handle profile avatar file input changes
        if (fileInput) {
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (!file.type.startsWith('image/')) {
                    showToast('กรุณาเลือกไฟล์ที่เป็นรูปภาพเท่านั้น', 'error');
                    return;
                }

                const reader = new FileReader();
                reader.onload = (evt) => {
                    const cropperModal = document.getElementById('cropper-modal');
                    const cropperImage = document.getElementById('cropper-image');
                    
                    // Setup cropper image source
                    if (cropperImage) cropperImage.src = evt.target.result;
                    if (cropperModal) cropperModal.style.display = 'flex';
                    
                    // Destroy previous cropper instance if exists
                    if (profileCropperInstance) {
                        profileCropperInstance.destroy();
                    }
                    
                    // Initialize Cropper once image is set
                    if (cropperImage) {
                        profileCropperInstance = new Cropper(cropperImage, {
                            aspectRatio: 1, // Enforce a 1:1 square crop
                            viewMode: 1,
                            dragMode: 'move',
                            autoCropArea: 0.9,
                            restore: false,
                            guides: true,
                            center: true,
                            highlight: false,
                            cropBoxMovable: true,
                            cropBoxResizable: true,
                            toggleDragModeOnDblclick: false
                        });
                    }

                    // Bind cropper confirmation button
                    const cropConfirmBtn = document.getElementById('cropper-confirm-btn');
                    if (cropConfirmBtn) {
                        cropConfirmBtn.onclick = () => {
                            if (!profileCropperInstance) return;
                            
                            // Extract cropped image resized to 200x200 (lightweight JPEG quality 0.85)
                            const canvas = profileCropperInstance.getCroppedCanvas({
                                width: 200,
                                height: 200
                            });
                            
                            const croppedBase64 = canvas.toDataURL('image/jpeg', 0.85);

                            // Save in database
                            const users = getUsers();
                            const index = users.findIndex(u => u.gmail.toLowerCase() === user.gmail.toLowerCase());
                            if (index > -1) {
                                users[index].profileImage = croppedBase64;
                                saveUsers(users);
                                
                                // Sync specifically to the server profile image endpoint
                                fetch('/api/update_profile_image', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ gmail: user.gmail, profileImage: croppedBase64 })
                                }).catch(err => console.error("Error syncing profile image to server:", err));

                                // Update session storage
                                const updatedUser = { ...user, profileImage: croppedBase64 };
                                sessionStorage.setItem('army_exam_logged_in_user', JSON.stringify(updatedUser));
                                
                                showToast('ตัดครอบและเปลี่ยนรูปโปรไฟล์ของคุณเรียบร้อยแล้ว!');
                                
                                // Clean up and close modal
                                profileCropperInstance.destroy();
                                profileCropperInstance = null;
                                if (cropperModal) cropperModal.style.display = 'none';
                                fileInput.value = '';
                                
                                // Re-render dashboard
                                goToDashboard();
                            }
                        };
                    }

                    // Bind cancel buttons
                    const closeCropper = () => {
                        if (profileCropperInstance) {
                            profileCropperInstance.destroy();
                            profileCropperInstance = null;
                        }
                        if (cropperModal) cropperModal.style.display = 'none';
                        fileInput.value = '';
                    };

                    const cropCancelBtn = document.getElementById('cropper-cancel-btn');
                    if (cropCancelBtn) cropCancelBtn.onclick = closeCropper;
                    const cropCloseBtn = document.getElementById('cropper-modal-close');
                    if (cropCloseBtn) cropCloseBtn.onclick = closeCropper;
                };
                reader.onerror = () => {
                    showToast('เกิดข้อผิดพลาดในการโหลดรูปภาพ', 'error');
                };
                reader.readAsDataURL(file);
            };
        }

        // Load configs
        const config = getConfig();
        const subjectsList = document.getElementById('dashboard-quota-list');
        if (subjectsList) {
            subjectsList.innerHTML = '';
            
            let totalQuestions = 0;
            const subjects = Object.keys(config).filter(k => k !== 'durationMinutes');
            
            subjects.forEach(subject => {
                const quota = config[subject] || 0;
                if (quota > 0) {
                    const li = document.createElement('li');
                    li.innerHTML = `<span class="badge">${subject}</span> ดึงกระสุนข้อสอบ: <strong>${quota} ข้อ</strong>`;
                    subjectsList.appendChild(li);
                    totalQuestions += quota;
                }
            });

            const qInfo = document.getElementById('dashboard-total-questions-info');
            if (qInfo) {
                qInfo.innerHTML = `🕒 เวลาจำกัด: <strong>${config.durationMinutes || 180} นาที</strong> | จำนวนข้อสอบสุ่มรวม: <strong>${totalQuestions} ข้อ</strong>`;
            }
        }

        // Load History
        renderAttemptsHistory(user.gmail);
    }
}

function renderAttemptsHistory(userGmail) {
    const allAttempts = getAttempts().filter(a => a.userGmail.toLowerCase() === userGmail.toLowerCase());
    const listContainer = document.getElementById('dashboard-history-list');
    listContainer.innerHTML = '';

    const statsAttempts = document.getElementById('stat-attempts-count');
    const statsBest = document.getElementById('stat-best-score');
    const statsLatest = document.getElementById('stat-latest-score');

    const chartCanvas = document.getElementById('progressChart');
    const chartWrapper = chartCanvas.parentElement;
    
    // Check if placeholder already exists, remove it
    let placeholder = document.getElementById('chart-placeholder');
    if (placeholder) {
        placeholder.remove();
    }

    // Set overall attempts stats
    statsAttempts.textContent = allAttempts.length;
    if (allAttempts.length > 0) {
        const percentages = allAttempts.map(a => a.percentage);
        const maxPercent = Math.max(...percentages);
        const latestPercent = allAttempts[0].percentage; // attempts is newest first (unshifted)

        statsBest.textContent = `${maxPercent}%`;
        statsLatest.textContent = `${latestPercent}%`;
    } else {
        statsBest.textContent = '0%';
        statsLatest.textContent = '0%';
    }

    // Get current selected timeframe
    const activeBtn = document.querySelector('#timeframe-buttons-container .timeframe-btn.active');
    const timeframe = activeBtn ? activeBtn.getAttribute('data-timeframe') : 'all';

    // Get filtered attempts for progress tracking
    const filteredAttempts = getFilteredAttempts(allAttempts, timeframe);

    if (allAttempts.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center" style="color: var(--text-sub); padding: 40px 0;">
                📭 ยังไม่มีประวัติการทำข้อสอบจำลอง
            </div>`;

        // Hide chart canvas and display a placeholder
        chartCanvas.classList.add('d-none');
        placeholder = document.createElement('div');
        placeholder.id = 'chart-placeholder';
        placeholder.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-sub); font-size: 13px; font-weight: 600; text-align: center;';
        placeholder.innerHTML = '📈 ทำแบบทดสอบจำลองอย่างน้อย 1 ครั้งเพื่อรายงานกราฟความก้าวหน้า';
        chartWrapper.appendChild(placeholder);
        
        if (progressChartInstance) {
            progressChartInstance.destroy();
            progressChartInstance = null;
        }

        // Set welcome recommendation
        document.getElementById('ai-progress-recommendation').innerHTML = generateAIRecommendation(allAttempts, timeframe);
    } else if (filteredAttempts.length === 0) {
        // Hide chart canvas and display timeframe specific placeholder
        chartCanvas.classList.add('d-none');
        placeholder = document.createElement('div');
        placeholder.id = 'chart-placeholder';
        placeholder.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-sub); font-size: 13px; font-weight: 600; text-align: center;';
        
        let tfText = 'ในช่วงเวลานี้';
        if (timeframe === 'day') tfText = 'ในวันนี้ (00:00 - 23:59 น.)';
        else if (timeframe === 'week') tfText = 'ในสัปดาห์นี้ (วันจันทร์ - วันอาทิตย์)';
        else if (timeframe === 'month') tfText = 'ในเดือนนี้ (วันที่ 1 - วันสุดท้ายของเดือน)';
        else if (timeframe === 'year') tfText = 'ในปีนี้ (มกราคม - ธันวาคม)';

        placeholder.innerHTML = `📈 ไม่มีประวัติการทำข้อสอบ${tfText}`;
        chartWrapper.appendChild(placeholder);
        
        if (progressChartInstance) {
            progressChartInstance.destroy();
            progressChartInstance = null;
        }

        // Set empty timeframe recommendation
        document.getElementById('ai-progress-recommendation').innerHTML = `ไม่พบข้อมูลประวัติการทำข้อสอบจำลองของคุณ <strong>${tfText}</strong> 
        คุณสามารถลองสลับเปลี่ยนเงื่อนไขการกรองช่วงเวลาอื่นด้านบน หรือกดปุ่มเริ่มสอบด้านล่างเพื่อเริ่มสอบเก็บสถิติสำหรับช่วงเวลานี้ได้ทันทีครับ`;
    } else {
        // Show chart canvas and render the chart
        chartCanvas.classList.remove('d-none');
        renderProgressChart(filteredAttempts, timeframe);

        // Set AI recommendation feedback based on filtered attempts
        document.getElementById('ai-progress-recommendation').innerHTML = generateAIRecommendation(filteredAttempts, timeframe);
    }

    // Render general history list (always shows all attempts for convenience)
    if (allAttempts.length > 0) {
        allAttempts.forEach(attempt => {
            const item = document.createElement('div');
            item.className = 'history-item';
            
            const dateStr = new Date(attempt.timestamp).toLocaleString('th-TH', {
                timeZone: 'Asia/Bangkok',
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            item.innerHTML = `
                <div class="history-info">
                    <h4>ทดสอบรอบข้อสอบรวม ${attempt.totalQuestions} ข้อ</h4>
                    <p>📅 สอบเมื่อ: ${dateStr}</p>
                </div>
                <div class="flex align-center">
                    <div class="history-score" style="background: linear-gradient(135deg, var(--primary-color), var(--primary-light)); color: white; padding: 8px 16px; border-radius: var(--radius-sm); text-align: center; min-width: 90px; box-shadow: 0 4px 10px rgba(59,91,62,0.15);">
                        <div class="history-score-val" style="color: white; font-size: 16px; font-weight: 700;">${attempt.totalScore}/${attempt.totalQuestions}</div>
                        <div class="history-score-percent" style="color: rgba(255,255,255,0.85); font-size: 11px; font-weight: 600;">ร้อยละ ${attempt.percentage}%</div>
                    </div>
                </div>
            `;

            listContainer.appendChild(item);
        });
    }
}

// Helper to convert timestamp (UTC ms) to Thailand timezone info (UTC+7)
function getThailandDate(timestamp = Date.now()) {
    const TH_OFFSET = 7 * 60 * 60 * 1000;
    const d = new Date(timestamp + TH_OFFSET);
    return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth(),
        date: d.getUTCDate(),
        day: d.getUTCDay(),
        hours: d.getUTCHours(),
        minutes: d.getUTCMinutes(),
        seconds: d.getUTCSeconds(),
        ms: d.getUTCMilliseconds()
    };
}

// Helper to construct UTC timestamp from Thailand timezone components
function getThailandEpoch(year, month, date, hour = 0, minute = 0, second = 0, ms = 0) {
    const TH_OFFSET = 7 * 60 * 60 * 1000;
    return Date.UTC(year, month, date, hour, minute, second, ms) - TH_OFFSET;
}

// Helper to calculate calendar bounds (Thailand local time)
function getCalendarBounds(timeframe) {
    const thNow = getThailandDate();
    let startTime = 0;
    let endTime = Infinity;

    if (timeframe === 'day') {
        startTime = getThailandEpoch(thNow.year, thNow.month, thNow.date, 0, 0, 0, 0);
        endTime = getThailandEpoch(thNow.year, thNow.month, thNow.date, 23, 59, 59, 999);
    } else if (timeframe === 'week') {
        const distanceToMonday = thNow.day === 0 ? 6 : thNow.day - 1;
        startTime = getThailandEpoch(thNow.year, thNow.month, thNow.date - distanceToMonday, 0, 0, 0, 0);
        endTime = getThailandEpoch(thNow.year, thNow.month, thNow.date - distanceToMonday + 6, 23, 59, 59, 999);
    } else if (timeframe === 'month') {
        startTime = getThailandEpoch(thNow.year, thNow.month, 1, 0, 0, 0, 0);
        endTime = getThailandEpoch(thNow.year, thNow.month + 1, 0, 23, 59, 59, 999);
    } else if (timeframe === 'year') {
        startTime = getThailandEpoch(thNow.year, 0, 1, 0, 0, 0, 0);
        endTime = getThailandEpoch(thNow.year, 11, 31, 23, 59, 59, 999);
    }

    return { startTime, endTime };
}

// Helper to filter attempts by timeframe
function getFilteredAttempts(attempts, timeframe) {
    if (timeframe === 'all') return attempts;
    const bounds = getCalendarBounds(timeframe);
    return attempts.filter(a => a.timestamp >= bounds.startTime && a.timestamp <= bounds.endTime);
}

// Render Progress Chart using Chart.js with timeframe labels formatting
function renderProgressChart(attempts, timeframe = 'all') {
    const ctx = document.getElementById('progressChart').getContext('2d');
    if (progressChartInstance) {
        progressChartInstance.destroy();
    }

    let labels = [];
    let data = [];

    if (timeframe === 'all') {
        const chartAttempts = [...attempts].reverse();
        labels = chartAttempts.map((attempt, index) => `ครั้งที่ ${index + 1}`);
        data = chartAttempts.map(attempt => attempt.percentage);
    } else {
        const sorted = [...attempts].reverse();
        
        if (timeframe === 'day') {
            labels = Array.from({ length: 24 }, (_, i) => {
                if (i === 0) return '00:00 น.';
                if (i === 23) return '23:59 น.';
                return `${String(i).padStart(2, '0')}:00 น.`;
            });
            data = new Array(24).fill(null);
            sorted.forEach(attempt => {
                const thDate = getThailandDate(attempt.timestamp);
                data[thDate.hours] = attempt.percentage;
            });
        } else if (timeframe === 'week') {
            labels = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
            data = new Array(7).fill(null);
            sorted.forEach(attempt => {
                const thDate = getThailandDate(attempt.timestamp);
                const index = thDate.day === 0 ? 6 : thDate.day - 1;
                data[index] = attempt.percentage;
            });
        } else if (timeframe === 'month') {
            const thNow = getThailandDate();
            const daysInMonth = new Date(Date.UTC(thNow.year, thNow.month + 1, 0)).getUTCDate();
            labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
            data = new Array(daysInMonth).fill(null);
            sorted.forEach(attempt => {
                const thDate = getThailandDate(attempt.timestamp);
                data[thDate.date - 1] = attempt.percentage;
            });
        } else if (timeframe === 'year') {
            labels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            data = new Array(12).fill(null);
            sorted.forEach(attempt => {
                const thDate = getThailandDate(attempt.timestamp);
                data[thDate.month] = attempt.percentage;
            });
        }
    }

    // Dynamic style values based on current active theme
    const style = getComputedStyle(document.documentElement);
    const primaryColor = style.getPropertyValue('--primary-color').trim() || '#3b5b3e';
    const textMain = style.getPropertyValue('--text-main').trim() || '#1c261e';
    const borderColor = style.getPropertyValue('--border-color').trim() || '#e0e5e1';

    // Create glowing neon cyan gradient for fill background
    const fillGradient = ctx.createLinearGradient(0, 0, 0, 230);
    fillGradient.addColorStop(0, 'rgba(0, 229, 255, 0.28)');
    fillGradient.addColorStop(1, 'rgba(0, 229, 255, 0.01)');

    progressChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'คะแนนร้อยละ',
                data: data,
                borderColor: '#00d2ff',
                backgroundColor: fillGradient,
                fill: true,
                tension: 0.4,
                borderWidth: 3.5,
                pointBackgroundColor: '#00d2ff',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(30, 38, 32, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                    borderColor: '#00d2ff',
                    borderWidth: 1.5,
                    titleFont: { family: 'Sarabun', size: 13, weight: 'bold' },
                    titleColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#1c261e',
                    bodyFont: { family: 'Sarabun', size: 12 },
                    bodyColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#e8ece9' : '#1c261e',
                    callbacks: {
                        label: function(context) {
                            return ` คะแนนสอบ: ${context.parsed.y}%`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        font: { family: 'Sarabun', size: 11 },
                        color: textMain,
                        stepSize: 20
                    },
                    grid: {
                        color: borderColor
                    }
                },
                x: {
                    ticks: {
                        font: { family: 'Sarabun', size: 11 },
                        color: textMain
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Generate heuristic AI recommendation report based on history data
function generateAIRecommendation(attempts, timeframe = 'all') {
    let tfText = 'ประวัติสอบทั้งหมด';
    if (timeframe === 'day') tfText = 'วันนี้ (00:00 - 23:59 น.)';
    else if (timeframe === 'week') tfText = 'สัปดาห์นี้ (วันจันทร์ - วันอาทิตย์)';
    else if (timeframe === 'month') tfText = 'เดือนนี้ (วันที่ 1 - วันสุดท้ายของเดือน)';
    else if (timeframe === 'year') tfText = 'ปีนี้ (มกราคม - ธันวาคม)';

    if (!attempts || attempts.length === 0) {
        return `สวัสดีครับผู้เข้าสอบ! ยินดีต้อนรับสู่ระบบจำลองข้อสอบกองทัพบก จากการตรวจสอบยังไม่พบประวัติการทำแบบทดสอบของคุณในระบบสำหรับช่วงเวลาที่เลือก (${tfText})
        <br><br>💡 <strong>คำแนะนำเริ่มต้น:</strong> ขอแนะนำให้เริ่มต้นโดยการกดปุ่ม <strong>"เริ่มทำข้อสอบ"</strong> บนการ์ดโปรไฟล์ของคุณ เพื่อทำการประเมินความรู้ระดับพื้นฐาน (Pre-test) ระบบจะทำการสุ่มข้อสอบตามโครงสร้างแผนจัดสรรปัจจุบัน เพื่อช่วยในการวางแผนอ่านหนังสือต่อไปครับ`;
    }

    if (attempts.length === 1) {
        const last = attempts[0];
        const pct = last.percentage;
        
        let strongest = '';
        let strongestPct = -1;
        let weakest = '';
        let weakestPct = 101;

        if (last.subjectStats) {
            Object.keys(last.subjectStats).forEach(subj => {
                const stats = last.subjectStats[subj];
                const subjPct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
                if (subjPct > strongestPct) {
                    strongestPct = subjPct;
                    strongest = subj;
                }
                if (subjPct < weakestPct) {
                    weakestPct = subjPct;
                    weakest = subj;
                }
            });
        }

        let overallText = pct >= 70 
            ? `🎉 ยินดีด้วยครับ! ผลการทดสอบในช่วงเวลา <strong>${tfText}</strong> ของคุณอยู่ในเกณฑ์ <strong>สอบผ่านเกณฑ์มาตรฐาน</strong> โดยทำคะแนนได้ร้อยละ <strong>${pct}%</strong>`
            : `⚠️ ผลการสอบในช่วงเวลา <strong>${tfText}</strong> ของคุณทำคะแนนเฉลี่ยร้อยละ <strong>${pct}%</strong> ซึ่ง<strong>ยังต่ำกว่าเกณฑ์มาตรฐานผ่านการประเมิน (70%)</strong> เล็กน้อย แต่อย่าเพิ่งท้อถอยนะครับ นี่เป็นเพียงจุดเริ่มต้นของการเรียนรู้`;

        let subjectAnalysis = '';
        if (strongest && weakest) {
            if (strongest === weakest) {
                subjectAnalysis = `<br><br>📊 <strong>วิเคราะห์จุดเด่นจุดด้อย:</strong> คะแนนของคุณเฉลี่ยเท่ากันในทุกกลุ่มวิชาที่ระดับ ${strongestPct}%`;
            } else {
                subjectAnalysis = `<br><br>📊 <strong>วิเคราะห์รายวิชา:</strong> คุณทำได้โดดเด่นเป็นพิเศษในวิชา <strong>${strongest}</strong> (ความถูกต้อง ${strongestPct}%) แต่ในขณะเดียวกัน วิชาที่ยังต้องเสริมความรู้ด่วนคือ <strong>${weakest}</strong> (ความถูกต้องเพียง ${weakestPct}%)`;
            }
        }

        return `${overallText} ${subjectAnalysis}
        <br><br>💡 <strong>แผนการศึกษาแนะนำ:</strong> ควรคลิกดูประวัติการทดสอบและใช้ระบบเฉลยละเอียดเพื่อเรียนรู้เหตุผลของข้อที่ตอบผิดในวิชา <strong>${weakest || 'วิชาที่คะแนนต่ำ'}</strong> เป็นอันดับแรก เพื่อเก็บคะแนนสะสมในจุดนี้ในการสอบครั้งถัดไปครับ`;
    }

    // attempts.length >= 2
    const last = attempts[0];
    const prev = attempts[1];
    const pct = last.percentage;
    const prevPct = prev.percentage;
    const diff = pct - prevPct;

    let progressTrend = '';
    if (diff > 0) {
        progressTrend = `📈 <strong>มีพัฒนาการที่ดีขึ้นชัดเจนในช่วงเวลา ${tfText}!</strong> คะแนนเฉลี่ยสอบล่าสุดเพิ่มขึ้นจากรอบก่อนหน้า <strong>+${diff}%</strong> (จาก ${prevPct}% เป็น ${pct}%)`;
    } else if (diff < 0) {
        progressTrend = `📉 <strong>คะแนนมีสถิติปรับตัวลดลงในช่วงเวลา ${tfText}:</strong> คะแนนสอบล่าสุดลดลงจากรอบก่อนหน้า <strong>${diff}%</strong> (จาก ${prevPct}% เป็น ${pct}%)`;
    } else {
        progressTrend = `⚖️ <strong>คะแนนอยู่ในเกณฑ์ทรงตัวในช่วงเวลา ${tfText}:</strong> คะแนนสอบล่าสุดเท่ากับรอบก่อนหน้าอยู่ที่ <strong>${pct}%</strong> ถือว่ามีความเสถียรในผลการเรียนรู้ที่ดี`;
    }

    let weakest = '';
    let weakestPct = 101;
    if (last.subjectStats) {
        Object.keys(last.subjectStats).forEach(subj => {
            const stats = last.subjectStats[subj];
            const subjPct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
            if (subjPct < weakestPct) {
                weakestPct = subjPct;
                weakest = subj;
            }
        });
    }

    let actionableTip = '';
    if (diff > 0) {
        actionableTip = `ขอแนะนำให้รักษาความสม่ำเสมอไว้ และเริ่มทบทวนรายละเอียดข้อที่ยังพลาดอยู่ทีละส่วน ส่วนใหญ่วิชา <strong>${weakest}</strong> ยังสามารถดึงคะแนนรวมให้สูงขึ้นไปอีกได้`;
    } else if (diff < 0) {
        actionableTip = `อย่าวิตกกังวลเกินไปครับ คะแนนลดลงอาจเกิดจากโจทย์บางหัวข้อที่สุ่มเจอนั้นมีความยากเป็นพิเศษ แนะนำให้ย้อนกลับไปเปิดดูเฉลยอธิบายคำตอบของข้อสอบรอบที่ผ่านมา เน้นการทบทวนความเข้าใจในหลักการของคำถามที่ตอบผิดซ้ำๆ ก่อนทำรอบต่อไป`;
    } else {
        actionableTip = `เป้าหมายหลักในรอบถัดไปคือการทะลุกำแพงคะแนนเดิม แนะนำให้เริ่มอ่านทบทวนวิชา <strong>${weakest}</strong> อย่างเข้มข้นขึ้นเพื่อเพิ่มคะแนนให้ถึงเป้าหมายถัดไป`;
    }

    return `${progressTrend}
    <br><br>📊 <strong>วิเคราะห์ข้อบกพร่องล่าสุดในช่วงกรอง:</strong> วิชา <strong>${weakest || 'วิชาหลัก'}</strong> ยังทำผลงานได้ค่อนข้างจำกัดที่ระดับความถูกต้อง <strong>${weakestPct}%</strong> ซึ่งเป็นสัดส่วนที่ดึงคะแนนเฉลี่ยของคุณลง
    <br><br>💡 <strong>ข้อแนะนำจาก AI:</strong> ${actionableTip}`;
}

// ==========================================
// EXAM SESSION CONTROLLERS
// ==========================================
function startExamSession() {
    try {
        const session = startNewExam();
        goToExamRoom(session);
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function goToExamRoom(session) {
    showView('exam-view');
    renderQuestion(session.currentQuestionIndex);
    renderQuestionGrid();
    initExamTimer(session.endTime);
}

// Render active question
function renderQuestion(index) {
    const session = getActiveSession();
    if (!session) return;

    // Update active index in state and save
    session.currentQuestionIndex = index;
    saveActiveSession(session);

    const questions = session.questions;
    const q = questions[index];

    // Headers
    document.getElementById('exam-question-subject').textContent = q.subject;
    document.getElementById('exam-question-number-title').textContent = `ข้อที่ ${index + 1} / ${questions.length}`;

    // Question body text
    const qText = document.getElementById('exam-question-text');
    if (qText) {
        qText.textContent = q.question;
        qText.classList.remove('fade-in');
        void qText.offsetWidth; // Trigger reflow
        qText.classList.add('fade-in');
    }

    // Choices
    const choicesContainer = document.getElementById('exam-choices-container');
    if (choicesContainer) {
        choicesContainer.classList.remove('fade-in');
        void choicesContainer.offsetWidth; // Trigger reflow
        choicesContainer.classList.add('fade-in');
    }
    choicesContainer.innerHTML = '';

    const questionChoices = session.choicesMap[q.id];
    const savedAnswer = session.answers[q.id];

    questionChoices.forEach(choice => {
        const div = document.createElement('div');
        div.className = `choice-item ${savedAnswer === choice.key ? 'selected' : ''}`;
        
        // Label mapping
        let labelThai = '';
        if (choice.key === 'A') labelThai = 'ก';
        else if (choice.key === 'B') labelThai = 'ข';
        else if (choice.key === 'C') labelThai = 'ค';
        else if (choice.key === 'D') labelThai = 'ง';

        div.innerHTML = `
            <div class="choice-prefix">${labelThai}</div>
            <div class="choice-content">${choice.text}</div>
        `;

        div.addEventListener('click', () => {
            // Select choice
            answerQuestion(q.id, choice.key);
            
            // Re-render choices selection instantly
            document.querySelectorAll('.choice-item').forEach(c => c.classList.remove('selected'));
            div.classList.add('selected');
            
            // Refresh sidebar grid indicator
            renderQuestionGrid();
        });

        choicesContainer.appendChild(div);
    });

    // Mark for review button state
    const markBtn = document.getElementById('exam-mark-review-btn');
    if (session.markedForReview.includes(q.id)) {
        markBtn.classList.add('active');
        markBtn.textContent = '🏳️ ปักหมุดแล้ว';
    } else {
        markBtn.classList.remove('active');
        markBtn.textContent = '🏳️ ปักหมุดทบทวน';
    }

    // Mark review click handler
    markBtn.onclick = () => {
        const isMarked = toggleMarkForReview(q.id);
        if (isMarked) {
            markBtn.classList.add('active');
            markBtn.textContent = '🏳️ ปักหมุดแล้ว';
            showToast('ปักหมุดข้อสอบนี้เพื่อการกลับมาทบทวนภายหลัง');
        } else {
            markBtn.classList.remove('active');
            markBtn.textContent = '🏳️ ปักหมุดทบทวน';
        }
        renderQuestionGrid();
    };

    // Navigation buttons config
    const prevBtn = document.getElementById('exam-prev-btn');
    const nextBtn = document.getElementById('exam-next-btn');
    const submitBtn = document.getElementById('exam-submit-btn');

    // Prev
    if (index === 0) {
        prevBtn.classList.add('d-none');
    } else {
        prevBtn.classList.remove('d-none');
        prevBtn.onclick = () => renderQuestion(index - 1);
    }

    // Next
    if (index === questions.length - 1) {
        nextBtn.classList.add('d-none');
    } else {
        nextBtn.classList.remove('d-none');
        nextBtn.onclick = () => renderQuestion(index + 1);
    }
    submitBtn.classList.add('d-none'); // Always hide bottom submit button
    renderQuestionGrid();
}
function renderQuestionGrid() {
    const session = getActiveSession();
    if (!session) return;

    const grid = document.getElementById('exam-question-grid');
    grid.innerHTML = '';

    session.questions.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'grid-item';
        item.textContent = idx + 1;

        // Apply state classes
        if (idx === session.currentQuestionIndex) {
            item.classList.add('active');
        }
        if (session.answers[q.id]) {
            item.classList.add('answered');
        }
        if (session.markedForReview.includes(q.id)) {
            item.classList.add('review');
        }

        item.addEventListener('click', () => {
            renderQuestion(idx);
        });

        grid.appendChild(item);
    });
}

// Live timer controller
function initExamTimer(endTime) {
    clearInterval(timerIntervalId);
    
    const card = document.getElementById('exam-timer-card');
    const timerVal = document.getElementById('exam-timer-val');

    function update() {
        const diff = endTime - Date.now();
        if (diff <= 0) {
            clearInterval(timerIntervalId);
            timerVal.textContent = 'หมดเวลาทำข้อสอบ';
            timerVal.style.fontSize = '18px'; // Make font smaller to fit the text
            showToast('หมดเวลาทำข้อสอบ! ระบบจะทำการส่งคำตอบอัตโนมัติ...', 'error');
            setTimeout(() => {
                autoForceSubmit();
            }, 1500); // 1.5 second delay so they can read the text
            return;
        }

        const hrs = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);

        const pad = (n) => String(n).padStart(2, '0');
        timerVal.textContent = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;

        // Warning stage: Under 15 mins (900000 ms)
        if (diff < 15 * 60 * 1000) {
            card.classList.add('danger');
        } else {
            card.classList.remove('danger');
        }
    }

    update();
    timerIntervalId = setInterval(update, 1000);
}

// User triggers submission manually
function triggerExamSubmission() {
    const session = getActiveSession();
    if (!session) return;

    const answeredCount = Object.keys(session.answers).length;
    const totalCount = session.questions.length;
    const unansweredCount = totalCount - answeredCount;

    let warningText = 'คุณต้องการที่จะยืนยันการส่งข้อสอบใช่หรือไม่? เมื่อส่งแล้วจะไม่สามารถกลับมาแก้ไขคะแนนได้อีก';
    if (unansweredCount > 0) {
        warningText = `⚠️ แจ้งเตือน! คุณยังไม่ระบุคำตอบจำนวน ${unansweredCount} ข้อ (จากทั้งหมด ${totalCount} ข้อ)\n\nคุณยังต้องการที่จะยืนยันส่งกระดาษคำตอบใช่หรือไม่?`;
    }

    if (confirm(warningText)) {
        clearInterval(timerIntervalId);
        const user = getCurrentUser();
        const result = submitExam(user.gmail, user.name);
        showToast('บันทึกคะแนนสอบของคุณเรียบร้อยแล้ว!');
        showExamResults(result);
    }
}

// Time's up submit
function autoForceSubmit() {
    const user = getCurrentUser();
    const result = submitExam(user.gmail, user.name);
    showExamResults(result);
}

// ==========================================
// RESULTS & EXPLANATIONS VIEW
// ==========================================
function showExamResults(result) {
    showView('results-view');
    
    let reviewIndex = 0;
    
    // Overall stats display
    document.getElementById('result-score-ratio').textContent = `${result.totalScore}/${result.totalQuestions}`;
    document.getElementById('result-score-percent').textContent = `ร้อยละ ${result.percentage}%`;

    const statusText = document.getElementById('result-status-text');
    const timerCard = document.getElementById('result-timer-card');
    
    const scoreVal = document.getElementById('result-score-ratio');
    const scorePercent = document.getElementById('result-score-percent');
    
    if (result.percentage >= 70) {
        statusText.textContent = 'ผ่านการเกณฑ์ทดสอบ! 🎉';
        statusText.style.color = '#ffffff';
        statusText.style.fontWeight = '700';
        timerCard.style.background = 'linear-gradient(135deg, #2e7d32, #4caf50)';
        timerCard.style.borderColor = '#1b5e20';
        timerCard.style.boxShadow = '0 8px 24px rgba(46, 125, 50, 0.3)';
        scoreVal.style.color = '#ffffff';
        scorePercent.style.color = 'rgba(255, 255, 255, 0.9)';
    } else {
        statusText.textContent = 'ไม่ผ่านการเกณฑ์สอบ ⚠️';
        statusText.style.color = '#ffffff';
        statusText.style.fontWeight = '700';
        timerCard.style.background = 'linear-gradient(135deg, #d32f2f, #ef5350)';
        timerCard.style.borderColor = '#b71c1c';
        timerCard.style.boxShadow = '0 8px 24px rgba(211, 47, 47, 0.3)';
        scoreVal.style.color = '#ffffff';
        scorePercent.style.color = 'rgba(255, 255, 255, 0.9)';
    }

    // Subject breakdown progress cards
    const breakdownContainer = document.getElementById('result-subject-breakdown-container');
    breakdownContainer.innerHTML = '';

    Object.keys(result.subjectStats).forEach(subject => {
        const stats = result.subjectStats[subject];
        const percent = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        
        const card = document.createElement('div');
        card.className = 'subject-stat-card';
        card.style.cssText = 'background: var(--bg-main); border: 1.5px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px 16px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;';
        card.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-weight: 700; font-size: 13px; color: var(--text-main);">${subject}</span>
                <span style="font-size: 11px; color: var(--text-sub);">คะแนนวิชานี้</span>
            </div>
            <div style="font-size: 18px; font-weight: 800; color: ${percent >= 70 ? 'var(--primary-color)' : 'var(--accent-color)'};">
                ${stats.correct} <span style="font-size: 13px; font-weight: 600; color: var(--text-sub);">/ ${stats.total}</span>
            </div>
        `;
        breakdownContainer.appendChild(card);
    });

    // Helper to render selected question details
    function renderReviewQuestion(idx) {
        reviewIndex = idx;
        const qResult = result.questionResults[idx];
        
        // Subject and Index header updates
        document.getElementById('result-question-subject').textContent = qResult.subject;
        document.getElementById('result-question-number-title').textContent = `ข้อที่ ${idx + 1} / ${result.totalQuestions}`;

        // Status badge
        const statusBadge = document.getElementById('result-question-status-badge');
        statusBadge.className = `review-status ${qResult.isCorrect ? 'correct' : 'incorrect'}`;
        statusBadge.textContent = qResult.isCorrect ? '✅ ตอบถูกต้อง' : (qResult.userAnswer ? '❌ ตอบไม่ถูกต้อง' : '⚠️ ไม่ได้ทำข้อนี้');

        // Question text
        document.getElementById('result-question-text').textContent = qResult.question;

        // Render option choice buttons
        const choicesContainer = document.getElementById('result-choices-container');
        choicesContainer.innerHTML = '';

        qResult.shuffledChoices.forEach(choice => {
            const chBox = document.createElement('div');
            chBox.className = 'review-choice';
            chBox.style.display = 'flex';
            chBox.style.alignItems = 'center';
            chBox.style.padding = '12px 16px';
            chBox.style.background = 'var(--bg-main)';
            chBox.style.border = '2px solid var(--border-color)';
            chBox.style.borderRadius = 'var(--radius-sm)';
            chBox.style.marginBottom = '12px';

            let tag = '';
            if (choice.key === 'A') tag = 'ก';
            else if (choice.key === 'B') tag = 'ข';
            else if (choice.key === 'C') tag = 'ค';
            else if (choice.key === 'D') tag = 'ง';

            chBox.innerHTML = `
                <div class="choice-prefix" style="margin-right: 12px; width: 28px; height: 28px; font-size: 13px; border-radius: 50%; border: 1.5px solid var(--border-color); display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; transition: var(--transition);">${tag}</div>
                <div class="choice-content" style="font-size: 14px; line-height: 1.4;">${choice.text}</div>
            `;

            const prefixEl = chBox.querySelector('.choice-prefix');

            // Apply answer colors
            if (choice.key === qResult.correct) {
                chBox.style.borderColor = '#2e7d32';
                chBox.style.backgroundColor = 'rgba(75, 181, 67, 0.06)';
                prefixEl.style.backgroundColor = '#2e7d32';
                prefixEl.style.color = '#fff';
                prefixEl.style.borderColor = '#2e7d32';
            }
            if (choice.key === qResult.userAnswer && !qResult.isCorrect) {
                chBox.style.borderColor = 'var(--accent-color)';
                chBox.style.backgroundColor = 'rgba(201, 76, 76, 0.06)';
                prefixEl.style.backgroundColor = 'var(--accent-color)';
                prefixEl.style.color = '#fff';
                prefixEl.style.borderColor = 'var(--accent-color)';
            }

            choicesContainer.appendChild(chBox);
        });

        // Explanation text box updates
        document.getElementById('result-explanation-title').textContent = `💡 คำอธิบายเฉลยที่ถูกต้อง: ตอบข้อที่ ${qResult.correct}`;
        document.getElementById('result-explanation-text').textContent = qResult.explanation || 'ไม่มีคำอธิบายเพิ่มเติม';

        // Circular grid button borders highlight
        document.querySelectorAll('#result-question-grid .grid-item').forEach((item, gridIdx) => {
            if (gridIdx === idx) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Navigation button displays
        const prevBtn = document.getElementById('result-prev-btn');
        const nextBtn = document.getElementById('result-next-btn');

        if (idx === 0) {
            prevBtn.classList.add('d-none');
        } else {
            prevBtn.classList.remove('d-none');
            prevBtn.onclick = () => renderReviewQuestion(idx - 1);
        }

        if (idx === result.totalQuestions - 1) {
            nextBtn.classList.add('d-none');
        } else {
            nextBtn.classList.remove('d-none');
            nextBtn.onclick = () => renderReviewQuestion(idx + 1);
        }
    }

    // Circular grid draw
    const grid = document.getElementById('result-question-grid');
    grid.innerHTML = '';

    result.questionResults.forEach((qResult, idx) => {
        const item = document.createElement('div');
        item.className = `grid-item ${qResult.isCorrect ? 'result-correct' : 'result-incorrect'}`;
        item.textContent = idx + 1;

        item.addEventListener('click', () => {
            renderReviewQuestion(idx);
        });

        grid.appendChild(item);
    });

    // Start with the first question review
    renderReviewQuestion(0);

    // Dashboard close button binds
    document.getElementById('result-back-dashboard-btn').onclick = () => {
        goToDashboard();
    };
}

// ==========================================
// ADMIN DASHBOARD MODULE
// ==========================================
function initAdminDashboard() {
    // Select default active tab config (Real-time Monitor) and style it active
    const realtimeTab = document.querySelector('[data-tab="admin-realtime"]');
    if (realtimeTab) {
        document.querySelectorAll('.admin-menu-item').forEach(b => {
            b.classList.remove('active');
            b.style.background = '';
            b.style.color = '';
            b.style.border = '';
            b.style.boxShadow = '';
        });
        realtimeTab.classList.add('active');
        realtimeTab.style.background = 'rgba(0, 210, 255, 0.15)';
        realtimeTab.style.color = '#00d2ff';
        realtimeTab.style.border = '1px solid rgba(0, 210, 255, 0.4)';
        realtimeTab.style.boxShadow = '0 0 8px rgba(0, 210, 255, 0.3)';
    }
    switchAdminTab('admin-realtime');

    // Bind accordion toggles once
    const parentHS = document.getElementById('parent-highschool');
    const parentBach = document.getElementById('parent-bachelor');
    const subHS = document.getElementById('sub-highschool');
    const subBach = document.getElementById('sub-bachelor');

    if (parentHS && subHS && parentBach && subBach && !parentHS.dataset.accordionBound) {
        parentHS.dataset.accordionBound = 'true';
        parentBach.dataset.accordionBound = 'true';

        parentHS.onclick = () => {
            const isHidden = subHS.classList.contains('d-none');
            if (isHidden) {
                subHS.classList.remove('d-none');
                parentHS.querySelector('.accordion-arrow').textContent = '▲';
                // Close bachelor
                subBach.classList.add('d-none');
                parentBach.querySelector('.accordion-arrow').textContent = '▼';
            } else {
                subHS.classList.add('d-none');
                parentHS.querySelector('.accordion-arrow').textContent = '▼';
            }
        };

        parentBach.onclick = () => {
            const isHidden = subBach.classList.contains('d-none');
            if (isHidden) {
                subBach.classList.remove('d-none');
                parentBach.querySelector('.accordion-arrow').textContent = '▲';
                // Close highschool
                subHS.classList.add('d-none');
                parentHS.querySelector('.accordion-arrow').textContent = '▼';
            } else {
                subBach.classList.add('d-none');
                parentBach.querySelector('.accordion-arrow').textContent = '▼';
            }
        };
    }

    // Set default accordion expanded state based on activeQualificationScope
    if (subHS && subBach && parentHS && parentBach) {
        if (activeQualificationScope === 'ม.ปลาย') {
            subHS.classList.remove('d-none');
            parentHS.querySelector('.accordion-arrow').textContent = '▲';
            subBach.classList.add('d-none');
            parentBach.querySelector('.accordion-arrow').textContent = '▼';
        } else {
            subBach.classList.remove('d-none');
            parentBach.querySelector('.accordion-arrow').textContent = '▲';
            subHS.classList.add('d-none');
            parentHS.querySelector('.accordion-arrow').textContent = '▼';
        }
    }

    // Bind tab clicks
    document.querySelectorAll('.admin-menu-item').forEach(btn => {
        const tabName = btn.getAttribute('data-tab');
        if (!tabName) return;
        
        btn.onclick = async () => {
            // Remove active classes and dynamic glow styling from all
            document.querySelectorAll('.admin-menu-item').forEach(b => {
                b.classList.remove('active');
                b.style.background = '';
                b.style.color = '';
                b.style.border = '';
                b.style.boxShadow = '';
            });
            btn.classList.add('active');
            
            // Set dynamic neon glow active styles
            const qual = btn.getAttribute('data-qual');
            if (qual === 'ม.ปลาย') {
                btn.style.background = 'rgba(255, 215, 0, 0.15)';
                btn.style.color = '#ffd700';
                btn.style.border = '1px solid rgba(255, 215, 0, 0.4)';
                btn.style.boxShadow = '0 0 8px rgba(255, 215, 0, 0.3)';
            } else if (qual === 'ป.ตรี') {
                btn.style.background = 'rgba(0, 255, 102, 0.15)';
                btn.style.color = '#00ff66';
                btn.style.border = '1px solid rgba(0, 255, 102, 0.4)';
                btn.style.boxShadow = '0 0 8px rgba(0, 255, 102, 0.3)';
            } else {
                btn.style.background = 'rgba(0, 210, 255, 0.15)';
                btn.style.color = '#00d2ff';
                btn.style.border = '1px solid rgba(0, 210, 255, 0.4)';
                btn.style.boxShadow = '0 0 8px rgba(0, 210, 255, 0.3)';
            }
            
            if (qual) {
                const isNewQual = activeQualificationScope !== qual;
                activeQualificationScope = qual;
                setActiveQualification(activeQualificationScope);
                
                // Render immediately from localCache / localStorage (0ms delay!)
                renderAdminSubjectConfigs();
                renderAdminQuestionsList();
                renderAdminMembersList();
                renderDatabaseCapacity();
                renderLeaderboard();
                
                if (isNewQual) {
                    const hasCache = getQuestions(activeQualificationScope).length > 0;
                    if (!hasCache) {
                        // If no local data, wait for backend sync
                        await syncFromBackend(activeQualificationScope);
                        renderAdminSubjectConfigs();
                        renderAdminQuestionsList();
                        renderAdminMembersList();
                        renderDatabaseCapacity();
                        renderLeaderboard();
                    } else {
                        // Async background update so the UI switch is instantaneous
                        syncFromBackend(activeQualificationScope).then(synced => {
                            if (synced) {
                                renderAdminSubjectConfigs();
                                renderAdminQuestionsList();
                                renderAdminMembersList();
                                renderDatabaseCapacity();
                                renderLeaderboard();
                            }
                        });
                    }
                }
            }
            
            switchAdminTab(tabName);
        };
    });

    // Trigger loads for config/data lists
    renderAdminSubjectConfigs();
    renderAdminQuestionsList();
    renderAdminMembersList();
    bindImportExportElements();

    // Render widgets
    renderDatabaseCapacity();
    renderLeaderboard();
}

function switchAdminTab(tabId) {
    const tabs = ['admin-config', 'admin-questions', 'admin-members', 'admin-import', 'admin-realtime'];
    tabs.forEach(id => {
        const el = document.getElementById(`tab-${id}`);
        if (el) {
            if (id === tabId) {
                el.classList.remove('d-none');
            } else {
                el.classList.add('d-none');
            }
        }
    });

    // Append log for admin navigation
    if (appendRealtimeActivityLog) {
        const tabNames = {
            'admin-realtime': 'ติดตามเรียลไทม์ (Live System Monitor)',
            'admin-config': 'ตั้งค่าแผนจัดสรรข้อสอบ',
            'admin-questions': 'บริหารคลังข้อสอบ',
            'admin-members': 'จัดการรายชื่อสมาชิก',
            'admin-import': 'นำเข้าข้อสอบจากระบบภายนอก'
        };
        const name = tabNames[tabId] || tabId;
        appendRealtimeActivityLog(`👤 <span style="color: #00d2ff;">แอดมิน</span> สลับหน้าเมนูหลักไปยัง: <strong>${name}</strong>`);
    }

    if (tabId === 'admin-import') {
        populateImportSubjects();
        populateImportFileSubjects();
    } else if (tabId === 'admin-realtime') {
        initRealtimeMonitor();
    }
}

// TAB 1: Render configuration allocations
function renderAdminSubjectConfigs() {
    const config = getConfig();
    const container = document.getElementById('admin-config-subjects-container');
    container.innerHTML = '';

    // Set container layout to flex column
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '14px';
    container.style.marginBottom = '20px';

    // Bind dragover to container for reordering
    if (!container.dataset.dragBound) {
        container.dataset.dragBound = 'true';
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingRow = container.querySelector('.dragging');
            if (!draggingRow) return;
            const siblings = [...container.querySelectorAll('.config-subject-row:not(.dragging)')];
            const nextSibling = siblings.find(sibling => {
                const box = sibling.getBoundingClientRect();
                const offset = e.clientY - box.top - box.height / 2;
                return offset < 0;
            });
            container.insertBefore(draggingRow, nextSibling || null);
        });
    }

    // Get all current subjects in store
    const subjects = getSubjects();

    const createSubjectRow = (subject = '', limit = 5) => {
        const total = getQuestions().filter(q => q.subject === subject).length;
        const row = document.createElement('div');
        row.className = 'config-subject-row';
        row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 16px; background: var(--bg-main); padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); flex-wrap: wrap; transition: opacity 0.2s ease, border-color 0.2s ease;';
        
        row.innerHTML = `
            <div class="drag-handle" style="cursor: grab; display: flex; align-items: center; justify-content: center; width: 24px; height: 36px; color: var(--text-sub); font-size: 18px; user-select: none; margin-right: 4px;" title="ลากเพื่อเปลี่ยนลำดับ">☰</div>
            <div style="display: flex; align-items: center; gap: 12px; flex: 2; min-width: 200px;">
                <label style="font-weight: 700; font-size: 13px; min-width: 50px; color: var(--primary-color);">ชื่อวิชา:</label>
                <input type="text" class="form-input subject-name-input" value="${subject}" placeholder="เช่น ภาษาไทย" style="flex: 1;" required data-original-name="${subject}">
            </div>
            <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 200px; justify-content: flex-end;">
                <label style="font-weight: 700; font-size: 13px;">จำนวนข้อสุ่ม:</label>
                <input type="number" class="form-input subject-quota-input" value="${limit}" min="0" style="width: 80px;" required>
                <span style="font-size: 12px; color: var(--text-sub); min-width: 100px;">(มีคลัง: ${total} ข้อ)</span>
            </div>
            <button type="button" class="btn-xs delete delete-subject-btn" style="padding: 8px 12px; width: auto; font-size: 12px; margin: 0; display: inline-flex; align-items: center; gap: 4px;">🗑️ ลบวิชา</button>
        `;

        const handle = row.querySelector('.drag-handle');
        
        // Only make row draggable when grabbing the handle, preventing conflicts with text input selection
        handle.onmousedown = () => {
            row.draggable = true;
        };
        handle.onmouseup = () => {
            row.draggable = false;
        };
        handle.ontouchstart = () => {
            row.draggable = true;
        };
        handle.ontouchend = () => {
            row.draggable = false;
        };

        row.addEventListener('dragstart', (e) => {
            row.classList.add('dragging');
            row.style.opacity = '0.5';
            row.style.borderColor = 'var(--primary-color)';
            e.dataTransfer.effectAllowed = 'move';
        });

        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            row.style.opacity = '';
            row.style.borderColor = '';
            row.draggable = false;
        });

        // Bind delete action
        row.querySelector('.delete-subject-btn').onclick = () => {
            const nameInput = row.querySelector('.subject-name-input');
            const currentName = nameInput.value.trim();
            const originalName = nameInput.getAttribute('data-original-name');
            const targetName = currentName || originalName || 'วิชาใหม่';
            const qCount = getQuestions().filter(q => q.subject === targetName).length;
            
            if (qCount > 0) {
                if (!confirm(`⚠️ วิชา "${targetName}" มีข้อสอบอยู่ในคลังทั้งหมด ${qCount} ข้อ!\nการลบวิชานี้จะลบโควตาจัดสรรและตัวกรองออก แต่คำถามในคลังจะยังคงถูกเก็บไว้โดยไม่มีการลบออกจากระบบ\n\nยืนยันการลบวิชานี้ใช่หรือไม่?`)) {
                    return;
                }
            }
            row.remove();
        };

        return row;
    };

    // Render existing subjects
    subjects.forEach(subject => {
        const limit = config[subject] !== undefined ? config[subject] : 5;
        container.appendChild(createSubjectRow(subject, limit));
    });

    // Handle adding new subject button
    let addBtn = document.getElementById('admin-add-subject-btn');
    if (!addBtn) {
        addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.id = 'admin-add-subject-btn';
        addBtn.className = 'secondary-btn';
        addBtn.style.cssText = 'width: auto; padding: 10px 16px; font-size: 13px; font-weight: 600; margin-bottom: 24px; display: inline-flex; align-items: center; gap: 6px;';
        addBtn.innerHTML = '➕ เพิ่มวิชาใหม่';
        container.parentNode.insertBefore(addBtn, container.nextSibling);
    }
    
    addBtn.onclick = () => {
        container.appendChild(createSubjectRow('', 5));
    };

    // Fill duration
    document.getElementById('config-duration').value = config.durationMinutes || 180;

    // Handle Form Submit
    document.getElementById('admin-config-form').onsubmit = (e) => {
        e.preventDefault();
        
        const rows = container.querySelectorAll('.config-subject-row');
        const newConfig = {
            durationMinutes: parseInt(document.getElementById('config-duration').value) || 180,
            subjectOrder: []
        };

        const questions = getQuestions();
        let questionsUpdated = false;

        // Validations for duplicates and empty names
        const seenNames = new Set();
        let valid = true;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const nameInput = row.querySelector('.subject-name-input');
            const newName = nameInput.value.trim();
            const quotaInput = row.querySelector('.subject-quota-input');
            const quota = parseInt(quotaInput.value) || 0;
            const oldName = nameInput.getAttribute('data-original-name');

            if (!newName) {
                showToast('กรุณากรอกชื่อวิชาให้ครบถ้วน', 'error');
                valid = false;
                break;
            }

            if (seenNames.has(newName)) {
                showToast(`วิชา "${newName}" ซ้ำซ้อนกันในระบบ กรุณาตั้งชื่ออื่น`, 'error');
                valid = false;
                break;
            }

            seenNames.add(newName);
            newConfig[newName] = quota;
            newConfig.subjectOrder.push(newName);

            // Handle renaming of existing questions in the store
            if (oldName && oldName !== newName) {
                questions.forEach(q => {
                    if (q.subject === oldName) {
                        q.subject = newName;
                        questionsUpdated = true;
                    }
                });
            }
        }

        if (!valid) return;

        // Save new config
        saveConfig(newConfig, activeQualificationScope);

        // Save updated questions if renamed
        if (questionsUpdated) {
            saveQuestions(questions, activeQualificationScope);
            showToast('ปรับปรุงรายชื่อวิชาในคลังข้อสอบเรียบร้อยแล้ว!');
        }

        showToast('บันทึกแผนจัดสรรข้อสอบและการสุ่มข้อสอบเรียบร้อยแล้ว!');
        goToDashboard();
    };
}

// TAB 2: Renders Questions CRUD Table as folders
function renderAdminQuestionsList() {
    const foldersContainer = document.getElementById('admin-questions-folders-container');
    const filterSelect = document.getElementById('question-subject-filter');
    const searchInput = document.getElementById('question-search-input');
    
    // Set to keep track of expanded folders: key is "subject::folderName"
    if (!window.expandedFoldersCache) {
        window.expandedFoldersCache = new Set();
    }
    const expandedFolders = window.expandedFoldersCache;

    const render = () => {
        const questions = getQuestions();
        const search = searchInput.value.toLowerCase();
        const subjFilter = filterSelect.value;

        // Filter search list
        const filtered = questions.filter(q => {
            const matchSearch = q.question.toLowerCase().includes(search) || 
                                q.options.A.toLowerCase().includes(search) ||
                                q.options.B.toLowerCase().includes(search) ||
                                q.options.C.toLowerCase().includes(search) ||
                                q.options.D.toLowerCase().includes(search);
            const matchSubj = !subjFilter || q.subject === subjFilter;
            return matchSearch && matchSubj;
        });

        foldersContainer.innerHTML = '';
        if (filtered.length === 0) {
            foldersContainer.innerHTML = `<div class="text-center" style="color: var(--text-sub); padding: 40px 0; font-weight: 500;">📭 ไม่พบข้อมูลข้อสอบที่ค้นหา</div>`;
            return;
        }

        // Group by subject and then by folder (sourceFile)
        const groups = {};
        filtered.forEach(q => {
            const subj = q.subject || 'วิชาทั่วไป';
            const folder = q.sourceFile || 'คำถามทั่วไป (เพิ่มด้วยตนเอง)';
            if (!groups[subj]) {
                groups[subj] = {};
            }
            if (!groups[subj][folder]) {
                groups[subj][folder] = [];
            }
            groups[subj][folder].push(q);
        });

        // Render each subject
        Object.keys(groups).sort().forEach(subjName => {
            const subjectSection = document.createElement('div');
            subjectSection.className = 'subject-section';
            subjectSection.style.marginBottom = '24px';

            const subjectHeader = document.createElement('h4');
            subjectHeader.className = 'subject-section-title';
            subjectHeader.style.cssText = 'font-size: 16px; font-weight: 700; margin-bottom: 12px; border-left: 4px solid var(--primary-color); padding-left: 8px; color: var(--text-main);';
            subjectHeader.textContent = subjName;
            subjectSection.appendChild(subjectHeader);

            const folderGroup = groups[subjName];
            Object.keys(folderGroup).sort().forEach(folderName => {
                const folderQuestions = folderGroup[folderName];
                const folderId = `${subjName}::${folderName}`;
                
                const folderCard = document.createElement('div');
                folderCard.className = 'folder-card';
                folderCard.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-bottom: 12px; overflow: hidden; transition: var(--transition);';

                const isExpanded = expandedFolders.has(folderId);

                // Header
                const folderHeader = document.createElement('div');
                folderHeader.className = 'folder-header';
                folderHeader.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--bg-main); cursor: pointer; user-select: none; flex-wrap: wrap; gap: 10px;';
                
                folderHeader.innerHTML = `
                    <div class="folder-title" style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13.5px; color: var(--text-main);">
                        <span>📁</span>
                        <span>${escapeHtml(folderName)}</span>
                        <span class="badge warning" style="margin-left: 6px; font-size: 10px;">${folderQuestions.length} ข้อ</span>
                    </div>
                    <div class="folder-actions" style="display: flex; align-items: center; gap: 8px;">
                        <button type="button" class="btn-xs delete delete-folder-btn" style="padding: 6px 12px; font-size: 11px; margin: 0;">🗑️ ลบโฟลเดอร์</button>
                        <span class="folder-toggle-arrow" style="font-weight: bold; font-size: 14px; margin-left: 4px; color: var(--text-sub);">${isExpanded ? '▲' : '▼'}</span>
                    </div>
                `;

                // Body table wrapper
                const folderBody = document.createElement('div');
                folderBody.className = `folder-body ${isExpanded ? '' : 'd-none'}`;
                folderBody.style.cssText = 'padding: 16px; border-top: 1px solid var(--border-color); background: var(--bg-card);';

                // Table
                const tableWrapper = document.createElement('div');
                tableWrapper.className = 'table-wrapper';
                tableWrapper.style.cssText = 'max-height: 400px; overflow-y: auto;';

                const table = document.createElement('table');
                table.style.cssText = 'width: 100%; font-size: 12.5px;';
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th style="width: 60%;">คำถาม</th>
                            <th style="width: 15%;">เฉลย</th>
                            <th style="width: 25%; text-align: center;">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;

                const tbody = table.querySelector('tbody');
                folderQuestions.forEach(q => {
                    const tr = document.createElement('tr');
                    
                    let letterThai = q.correct;
                    if (q.correct === 'A') letterThai = 'ก';
                    else if (q.correct === 'B') letterThai = 'ข';
                    else if (q.correct === 'C') letterThai = 'ค';
                    else if (q.correct === 'D') letterThai = 'ง';

                    tr.innerHTML = `
                        <td><div style="max-height: 50px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 450px;" title="${escapeHtml(q.question)}">${escapeHtml(q.question)}</div></td>
                        <td>ข้อที่ถูกต้อง: <strong>${letterThai}</strong></td>
                        <td style="text-align: center;">
                            <button class="btn-xs edit edit-question-btn" style="padding: 4px 8px; font-size: 11px;">แก้ไข</button>
                            <button class="btn-xs delete delete-question-btn" style="padding: 4px 8px; font-size: 11px;">ลบ</button>
                        </td>
                    `;

                    tr.querySelector('.edit-question-btn').onclick = (e) => {
                        e.stopPropagation();
                        openQuestionModal(q);
                    };

                    tr.querySelector('.delete-question-btn').onclick = (e) => {
                        e.stopPropagation();
                        if (confirm(`คุณต้องการลบข้อสอบ: "${q.question.substr(0, 40)}..." ใช่หรือไม่?`)) {
                            deleteQuestionItem(q.id, activeQualificationScope);
                            showToast('ลบข้อสอบออกจากคลังสำเร็จแล้ว');
                            renderAdminQuestionsList();
                            updateFilterSelect();
                        }
                    };

                    tbody.appendChild(tr);
                });

                tableWrapper.appendChild(table);
                folderBody.appendChild(tableWrapper);

                // Toggle click handler
                folderHeader.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-folder-btn')) return;
                    
                    const arrow = folderHeader.querySelector('.folder-toggle-arrow');
                    if (folderBody.classList.contains('d-none')) {
                        folderBody.classList.remove('d-none');
                        arrow.textContent = '▲';
                        expandedFolders.add(folderId);
                    } else {
                        folderBody.classList.add('d-none');
                        arrow.textContent = '▼';
                        expandedFolders.delete(folderId);
                    }
                });

                // Delete Folder click handler
                folderHeader.querySelector('.delete-folder-btn').onclick = (e) => {
                    e.stopPropagation();
                    const confirmMsg = `⚠️ ยืนยันการลบโฟลเดอร์ "${folderName}" ในวิชา "${subjName}" ใช่หรือไม่?\nการดำเนินการนี้จะลบข้อสอบทั้งหมดในโฟลเดอร์นี้จำนวน ${folderQuestions.length} ข้อออกจากระบบแบบถาวร!`;
                    if (confirm(confirmMsg)) {
                        deleteQuestionsFolder(subjName, folderName);
                    }
                };

                folderCard.appendChild(folderHeader);
                folderCard.appendChild(folderBody);
                subjectSection.appendChild(folderCard);
            });

            foldersContainer.appendChild(subjectSection);
        });
    };

    const updateFilterSelect = () => {
        const subjects = getSubjects();
        const currentSelected = filterSelect.value;
        filterSelect.innerHTML = '<option value="">ทั้งหมดทุกวิชา</option>';
        subjects.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            filterSelect.appendChild(opt);
        });
        filterSelect.value = currentSelected;
    };

    updateFilterSelect();
    render();

    searchInput.oninput = render;
    filterSelect.onchange = render;

    document.getElementById('admin-add-question-btn').onclick = () => openQuestionModal();

    // Update capacity widget
    renderDatabaseCapacity();
}

function deleteQuestionsFolder(subject, folderName) {
    const questions = getQuestions();
    const updated = questions.filter(q => {
        const qSubject = q.subject || 'วิชาทั่วไป';
        const qFolder = q.sourceFile || 'คำถามทั่วไป (เพิ่มด้วยตนเอง)';
        
        const isTarget = (qSubject.toLowerCase() === subject.toLowerCase()) && 
                         (folderName === 'คำถามทั่วไป (เพิ่มด้วยตนเอง)' ? !q.sourceFile : (qFolder === folderName));
        return !isTarget;
    });

    const deletedCount = questions.length - updated.length;
    saveQuestions(updated, activeQualificationScope);
    updateSubjectConfigs(activeQualificationScope);
    showToast(`ลบโฟลเดอร์ข้อสอบและข้อสอบทั้งหมด ${deletedCount} ข้อ สำเร็จแล้ว`);
    renderAdminQuestionsList();
}

// Question CRUD Modal functions
function openQuestionModal(questionData = null, isPreview = false, previewIndex = null) {
    const modal = document.getElementById('question-modal');
    const form = document.getElementById('question-modal-form');
    const title = document.getElementById('question-modal-title');
    
    form.reset();
    document.getElementById('modal-q-id').value = '';

    const subjSelect = document.getElementById('modal-q-subject');
    subjSelect.innerHTML = '';
    const subjects = getSubjects();

    if (subjects.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '⚠️ กรุณาตั้งค่าวิชาในแผงแผนจัดสรรก่อน';
        opt.disabled = true;
        opt.selected = true;
        subjSelect.appendChild(opt);
    } else {
        subjects.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            subjSelect.appendChild(opt);
        });
    }

    // If in preview and subject is not in standard list, append it temporarily
    if (questionData && questionData.subject && !subjects.includes(questionData.subject)) {
        const opt = document.createElement('option');
        opt.value = questionData.subject;
        opt.textContent = questionData.subject;
        subjSelect.appendChild(opt);
    }

    if (questionData) {
        title.textContent = isPreview ? '🔍 แก้ไขข้อสอบตัวอย่าง' : '🔧 แก้ไขข้อสอบคำถาม';
        document.getElementById('modal-q-id').value = questionData.id || '';
        subjSelect.value = questionData.subject;
        document.getElementById('modal-q-text').value = questionData.question;
        document.getElementById('modal-q-opt-a').value = questionData.options.A;
        document.getElementById('modal-q-opt-b').value = questionData.options.B;
        document.getElementById('modal-q-opt-c').value = questionData.options.C;
        document.getElementById('modal-q-opt-d').value = questionData.options.D;
        document.getElementById('modal-q-correct').value = questionData.correct;
        document.getElementById('modal-q-explanation').value = questionData.explanation || '';
    } else {
        title.textContent = 'เพิ่มข้อสอบเข้าระบบคลัง';
    }

    modal.style.display = 'flex';

    // Binds Modal Form Save Submit
    form.onsubmit = (e) => {
        e.preventDefault();
        
        const qId = document.getElementById('modal-q-id').value;
        const newQuestion = {
            subject: document.getElementById('modal-q-subject').value.trim(),
            question: document.getElementById('modal-q-text').value.trim(),
            options: {
                A: document.getElementById('modal-q-opt-a').value.trim(),
                B: document.getElementById('modal-q-opt-b').value.trim(),
                C: document.getElementById('modal-q-opt-c').value.trim(),
                D: document.getElementById('modal-q-opt-d').value.trim()
            },
            correct: document.getElementById('modal-q-correct').value,
            explanation: document.getElementById('modal-q-explanation').value.trim(),
            qualification: activeQualificationScope
        };

        if (isPreview) {
            newQuestion.sourceFile = questionData.sourceFile;
            tempFileQuestions[previewIndex] = newQuestion;
            renderFileImportPreview(tempFileQuestions);
            showToast('แก้ไขข้อมูลข้อสอบตัวอย่างสำเร็จ');
            modal.style.display = 'none';
        } else {
            if (qId) {
                newQuestion.id = qId;
                if (questionData && questionData.sourceFile) {
                    newQuestion.sourceFile = questionData.sourceFile;
                }
            }

            saveQuestionItem(newQuestion, activeQualificationScope);
            showToast(qId ? 'แก้ไขข้อมูลข้อสอบแล้ว' : 'บันทึกคำถามข้อใหม่สำเร็จ!');
            
            modal.style.display = 'none';
            renderAdminQuestionsList();
        }
    };

    // Close binds
    document.getElementById('question-modal-close').onclick = () => {
        modal.style.display = 'none';
    };
}

// TAB 3: Renders Members CRUD Table
function renderAdminMembersList() {
    const listBody = document.getElementById('admin-members-table-body');
    const users = getUsers();

    listBody.innerHTML = '';
    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${user.gmail}</strong></td>
            <td>${user.name}</td>
            <td><code>${user.password}</code></td>
            <td><span class="badge ${user.role === 'admin' ? 'warning' : ''}">${user.role === 'admin' ? 'ADMIN' : 'MEMBER'}</span></td>
            <td style="text-align: center;">
                <button class="btn-xs edit edit-member-btn" data-email="${user.gmail}">แก้ไข</button>
                <button class="btn-xs delete delete-member-btn" data-email="${user.gmail}">ลบ</button>
            </td>
        `;

        // Binds member action buttons
        tr.querySelector('.edit-member-btn').onclick = () => openMemberModal(user);
        
        // Prevent deleting own logged in account
        const deleteBtn = tr.querySelector('.delete-member-btn');
        const activeUser = getCurrentUser();
        if (activeUser.gmail.toLowerCase() === user.gmail.toLowerCase()) {
            deleteBtn.disabled = true;
            deleteBtn.style.opacity = '0.5';
            deleteBtn.title = 'คุณไม่สามารถลบบัญชีแอดมินที่กำลังใช้ล็อกอินได้';
        } else {
            deleteBtn.onclick = () => {
                if (confirm(`คุณต้องการลบผู้สอบ: ${user.name} (${user.gmail}) ใช่หรือไม่?`)) {
                    deleteMember(user.gmail, activeQualificationScope);
                    showToast('ลบบัญชีสมาชิกเรียบร้อยแล้ว');
                    renderAdminMembersList();
                }
            };
        }

        listBody.appendChild(tr);
    });

    // Add Member trigger
    document.getElementById('admin-add-member-btn').onclick = () => openMemberModal();

    // Update capacity widget
    renderDatabaseCapacity();
}

// Member CRUD Modal functions
function openMemberModal(userData = null) {
    const modal = document.getElementById('member-modal');
    const form = document.getElementById('member-modal-form');
    const title = document.getElementById('member-modal-title');
    const emailInput = document.getElementById('modal-m-email');

    form.reset();

    if (userData) {
        title.textContent = '🔧 แก้ไขข้อมูลสมาชิก';
        document.getElementById('modal-m-mode').value = 'edit';
        emailInput.value = userData.gmail;
        emailInput.disabled = true; // Gmail acts as primary key identifier
        document.getElementById('modal-m-name').value = userData.name;
        document.getElementById('modal-m-password').value = userData.password;
        document.getElementById('modal-m-role').value = userData.role;
    } else {
        title.textContent = '👥 เพิ่มสมาชิกใหม่เข้าระบบ';
        document.getElementById('modal-m-mode').value = 'add';
        emailInput.disabled = false;
    }

    modal.style.display = 'flex';

    // Binds Member Form Save Submit
    form.onsubmit = (e) => {
        e.preventDefault();
        
        const mode = document.getElementById('modal-m-mode').value;
        const gmail = emailInput.value.trim().toLowerCase();
        const name = document.getElementById('modal-m-name').value.trim();
        const password = document.getElementById('modal-m-password').value.trim();
        const role = document.getElementById('modal-m-role').value;

        try {
            if (mode === 'add') {
                addMember(gmail, password, name, role, activeQualificationScope);
                showToast('สร้างสมาชิกใหม่เข้าฐานข้อมูลแล้ว!');
            } else {
                updateMember(gmail, { name, password, role }, activeQualificationScope);
                showToast('อัปเดตข้อมูลสมาชิกสำเร็จ');
            }
            modal.style.display = 'none';
            renderAdminMembersList();
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    // Close binds
    document.getElementById('member-modal-close').onclick = () => {
        modal.style.display = 'none';
    };
}

// Helper functions for Import Tab subject dropdown
function populateImportSubjects() {
    const importSubjSelect = document.getElementById('import-subject-select');
    if (!importSubjSelect) return;
    const currentVal = importSubjSelect.value || 'all';
    
    importSubjSelect.innerHTML = '<option value="all">🌐 นำเข้าตามวิชาที่ระบุในคอลัมน์ของไฟล์ (ทุกวิชา)</option>';
    const subjects = getSubjects();
    subjects.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `📚 บังคับนำเข้าเข้าสู่วิชา: ${s}`;
        importSubjSelect.appendChild(opt);
    });

    if (subjects.includes(currentVal) || currentVal === 'all') {
        importSubjSelect.value = currentVal;
    } else {
        importSubjSelect.value = 'all';
    }
    
    updateImportOverwriteLabel();
}

function updateImportOverwriteLabel() {
    const importSubjSelect = document.getElementById('import-subject-select');
    const labelText = document.getElementById('import-overwrite-label-text');
    if (!importSubjSelect || !labelText) return;
    
    const val = importSubjSelect.value;
    if (val === 'all') {
        labelText.textContent = 'ล้างคลังข้อสอบทั้งหมดแล้วดึงจากกูเกิลชีทมาแทนที่ (เขียนทับทั้งหมด)';
    } else {
        labelText.textContent = `ล้างข้อสอบเฉพาะวิชา "${val}" แล้วดึงจากกูเกิลชีทมาแทนที่ (เขียนทับเฉพาะวิชานี้)`;
    }
}

// Helper functions for Word/Excel File Import Tab
function populateImportFileSubjects() {
    const fileSubjSelect = document.getElementById('import-file-subject-select');
    if (!fileSubjSelect) return;
    const currentVal = fileSubjSelect.value || 'all';
    
    fileSubjSelect.innerHTML = '<option value="all">🌐 นำเข้าตามวิชาที่ระบุในไฟล์ (ทุกวิชา)</option>';
    const subjects = getSubjects();
    subjects.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `📚 บังคับนำเข้าเข้าสู่วิชา: ${s}`;
        fileSubjSelect.appendChild(opt);
    });

    if (subjects.includes(currentVal) || currentVal === 'all') {
        fileSubjSelect.value = currentVal;
    } else {
        fileSubjSelect.value = 'all';
    }
    
    updateImportFileOverwriteLabel();
}

function updateImportFileOverwriteLabel() {
    const fileSubjSelect = document.getElementById('import-file-subject-select');
    const labelText = document.getElementById('import-file-overwrite-label-text');
    if (!fileSubjSelect || !labelText) return;
    
    const val = fileSubjSelect.value;
    if (val === 'all') {
        labelText.textContent = 'ล้างคลังข้อสอบทั้งหมดแล้วดึงข้อมูลจากไฟล์มาแทนที่ (เขียนทับทั้งหมด)';
    } else {
        labelText.textContent = `ล้างข้อสอบเฉพาะวิชา "${val}" แล้วดึงข้อมูลจากไฟล์มาแทนที่ (เขียนทับเฉพาะวิชานี้)`;
    }
}

function mapToABCD(val) {
    if (!val) return '';
    const clean = String(val).trim().toUpperCase();
    if (clean === 'ก' || clean === 'A' || clean === '1') return 'A';
    if (clean === 'ข' || clean === 'B' || clean === '2') return 'B';
    if (clean === 'ค' || clean === 'C' || clean === '3') return 'C';
    if (clean === 'ง' || clean === 'D' || clean === '4') return 'D';
    
    if (clean.startsWith('ก') || clean.startsWith('A')) return 'A';
    if (clean.startsWith('ข') || clean.startsWith('B')) return 'B';
    if (clean.startsWith('ค') || clean.startsWith('C')) return 'C';
    if (clean.startsWith('ง') || clean.startsWith('D')) return 'D';

    return '';
}

function parseExcelData(arrayBuffer, defaultSubject) {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (rows.length === 0) return [];
    
    const headerRow = rows[0].map(h => String(h || '').trim());
    
    let subjectIdx = -1;
    let questionIdx = -1;
    let optAIdx = -1;
    let optBIdx = -1;
    let optCIdx = -1;
    let optDIdx = -1;
    let correctIdx = -1;
    let explanationIdx = -1;
    
    for (let i = 0; i < headerRow.length; i++) {
        const val = headerRow[i].toLowerCase();
        if (val.includes('วิชา') || val.includes('subject')) subjectIdx = i;
        else if (val.includes('คำถาม') || val.includes('โจทย์') || val.includes('question')) questionIdx = i;
        else if (val === 'ก' || val === 'a' || val.includes('ตัวเลือก ก') || val.includes('option a')) optAIdx = i;
        else if (val === 'ข' || val === 'b' || val.includes('ตัวเลือก ข') || val.includes('option b')) optBIdx = i;
        else if (val === 'ค' || val === 'c' || val.includes('ตัวเลือก ค') || val.includes('option c')) optCIdx = i;
        else if (val === 'ง' || val === 'd' || val.includes('ตัวเลือก ง') || val.includes('option d')) optDIdx = i;
        else if (val.includes('เฉลย') || val.includes('answer') || val.includes('correct')) correctIdx = i;
        else if (val.includes('คำอธิบาย') || val.includes('explanation') || val.includes('เฉลยละเอียด')) explanationIdx = i;
    }
    
    const hasHeaders = questionIdx !== -1 && optAIdx !== -1 && optBIdx !== -1 && optCIdx !== -1 && optDIdx !== -1;
    const parsedQuestions = [];
    const startIndex = hasHeaders ? 1 : 0;
    
    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        let subject = defaultSubject;
        let questionText = '';
        let optA = '';
        let optB = '';
        let optC = '';
        let optD = '';
        let correctVal = '';
        let explanation = '';
        
        if (hasHeaders) {
            if (subjectIdx !== -1 && defaultSubject === 'all') subject = String(row[subjectIdx] || '').trim();
            questionText = String(row[questionIdx] || '').trim();
            optA = String(row[optAIdx] || '').trim();
            optB = String(row[optBIdx] || '').trim();
            optC = String(row[optCIdx] || '').trim();
            optD = String(row[optDIdx] || '').trim();
            if (correctIdx !== -1) correctVal = String(row[correctIdx] || '').trim();
            if (explanationIdx !== -1) explanation = String(row[explanationIdx] || '').trim();
        } else {
            if (defaultSubject === 'all') {
                subject = String(row[0] || '').trim();
                questionText = String(row[1] || '').trim();
                optA = String(row[2] || '').trim();
                optB = String(row[3] || '').trim();
                optC = String(row[4] || '').trim();
                optD = String(row[5] || '').trim();
                correctVal = String(row[6] || '').trim();
                explanation = String(row[7] || '').trim();
            } else {
                questionText = String(row[0] || '').trim();
                optA = String(row[1] || '').trim();
                optB = String(row[2] || '').trim();
                optC = String(row[3] || '').trim();
                optD = String(row[4] || '').trim();
                correctVal = String(row[5] || '').trim();
                explanation = String(row[6] || '').trim();
            }
        }
        
        const cleanCorrect = mapToABCD(correctVal);
        if (questionText) {
            parsedQuestions.push({
                subject: (subject === 'all' || !subject) ? 'วิชาทั่วไป' : subject,
                question: questionText,
                options: { A: optA, B: optB, C: optC, D: optD },
                correct: cleanCorrect,
                explanation: explanation
            });
        }
    }
    
    return parsedQuestions;
}

function parseWordText(text, defaultSubject) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const questions = [];
    let currentQuestion = null;
    let currentSubject = defaultSubject;

    const subjectRegex = /^(?:วิชา|รายวิชา|Subject)\s*[:：]?\s*(.+)$/;
    const questionRegex = /^(?:ข้อ\s*)?(\d+)\s*[\.\)\-\/\:\：]\s*(.+)$/;
    
    const optARegex = /^\s*(?:[กA]|1)\s*[\.\)\-\:\：]\s*(.+)$/i;
    const optBRegex = /^\s*(?:[ขB]|2)\s*[\.\)\-\:\：]\s*(.+)$/i;
    const optCRegex = /^\s*(?:[คC]|3)\s*[\.\)\-\:\：]\s*(.+)$/i;
    const optDRegex = /^\s*(?:[งD]|4)\s*[\.\)\-\:\：]\s*(.+)$/i;

    const answerRegex = /^(?:เฉลย|ตอบ|เฉลยข้อ|Answer|Key)\s*[:：]?\s*(.+)$/i;
    const explanationRegex = /^(?:คำอธิบาย|อธิบาย|Explanation|Reason)\s*[:：]?\s*(.+)$/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const subjMatch = line.match(subjectRegex);
        if (subjMatch) {
            currentSubject = subjMatch[1].trim();
            continue;
        }

        const qMatch = line.match(questionRegex);
        if (qMatch) {
            if (currentQuestion) {
                questions.push(currentQuestion);
            }
            currentQuestion = {
                subject: (currentSubject === 'all' || !currentSubject) ? 'วิชาทั่วไป' : currentSubject,
                question: qMatch[2].trim(),
                options: { A: '', B: '', C: '', D: '' },
                correct: '',
                explanation: ''
            };
            continue;
        }

        if (!currentQuestion) continue;

        const inlineMatch = parseInlineOptions(line);
        if (inlineMatch) {
            currentQuestion.options.A = inlineMatch.A || currentQuestion.options.A;
            currentQuestion.options.B = inlineMatch.B || currentQuestion.options.B;
            currentQuestion.options.C = inlineMatch.C || currentQuestion.options.C;
            currentQuestion.options.D = inlineMatch.D || currentQuestion.options.D;
            continue;
        }

        const matchA = line.match(optARegex);
        if (matchA) { currentQuestion.options.A = matchA[1].trim(); continue; }

        const matchB = line.match(optBRegex);
        if (matchB) { currentQuestion.options.B = matchB[1].trim(); continue; }

        const matchC = line.match(optCRegex);
        if (matchC) { currentQuestion.options.C = matchC[1].trim(); continue; }

        const matchD = line.match(optDRegex);
        if (matchD) { currentQuestion.options.D = matchD[1].trim(); continue; }

        const ansMatch = line.match(answerRegex);
        if (ansMatch) {
            currentQuestion.correct = mapToABCD(ansMatch[1]);
            continue;
        }

        const expMatch = line.match(explanationRegex);
        if (expMatch) {
            currentQuestion.explanation = expMatch[1].trim();
            continue;
        }

        if (currentQuestion.explanation) {
            currentQuestion.explanation += '\n' + line;
        } else if (currentQuestion.options.D) {
            currentQuestion.explanation = line;
        } else if (currentQuestion.options.C) {
            currentQuestion.options.C += ' ' + line;
        } else if (currentQuestion.options.B) {
            currentQuestion.options.B += ' ' + line;
        } else if (currentQuestion.options.A) {
            currentQuestion.options.A += ' ' + line;
        } else {
            currentQuestion.question += '\n' + line;
        }
    }

    if (currentQuestion) {
        questions.push(currentQuestion);
    }

    return questions;
}

function parseInlineOptions(line) {
    const pattern = /(?:^|\s)(?:([กขคงABCD])|([1-4]))\s*[\.\)\-\:\：]\s*/gi;
    const matches = [];
    let match;
    while ((match = pattern.exec(line)) !== null) {
        matches.push({
            index: match.index,
            label: match[1] || match[2],
            fullLength: match[0].length
        });
    }

    if (matches.length >= 2) {
        const result = {};
        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index + matches[i].fullLength;
            const end = (i + 1 < matches.length) ? matches[i + 1].index : line.length;
            const content = line.substring(start, end).trim();
            const key = mapToABCD(matches[i].label);
            if (key) {
                result[key] = content;
            }
        }
        return result;
    }
    return null;
}

let tempFileQuestions = [];
let tempImportFileName = '';

function renderFileImportPreview(questions) {
    tempFileQuestions = questions;
    const container = document.getElementById('import-file-preview-container');
    const tbody = document.getElementById('import-file-preview-body');
    const statsEl = document.getElementById('import-file-stats');
    
    if (!container || !tbody || !statsEl) return;
    
    tbody.innerHTML = '';
    let completeCount = 0;
    let incompleteCount = 0;
    
    questions.forEach((q, idx) => {
        const isComplete = q.question && q.options.A && q.options.B && q.options.C && q.options.D && q.correct;
        if (isComplete) completeCount++;
        else incompleteCount++;
        
        const tr = document.createElement('tr');
        if (!isComplete) {
            tr.style.background = 'rgba(201, 76, 76, 0.08)';
            tr.style.borderLeft = '4px solid var(--accent-color)';
        }
        
        tr.innerHTML = `
            <td><strong style="color: var(--primary-color);">${escapeHtml(q.subject)}</strong></td>
            <td>
                <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(q.question)}</div>
                ${q.explanation ? `<div style="font-size: 11px; color: var(--text-sub);">💡 ${escapeHtml(q.explanation)}</div>` : ''}
            </td>
            <td>
                <div class="${!q.options.A ? 'text-danger' : ''}">ก: ${escapeHtml(q.options.A || '(ขาดข้อมูล)')}</div>
                <div class="${!q.options.B ? 'text-danger' : ''}">ข: ${escapeHtml(q.options.B || '(ขาดข้อมูล)')}</div>
                <div class="${!q.options.C ? 'text-danger' : ''}">ค: ${escapeHtml(q.options.C || '(ขาดข้อมูล)')}</div>
                <div class="${!q.options.D ? 'text-danger' : ''}">ง: ${escapeHtml(q.options.D || '(ขาดข้อมูล)')}</div>
            </td>
            <td style="text-align: center;">
                <span class="badge" style="background: ${q.correct ? 'var(--primary-color)' : 'var(--accent-color)'}; color: white; padding: 4px 8px; font-weight: bold;">
                    ${q.correct ? 'ข้อ ' + (q.correct === 'A' ? 'ก' : q.correct === 'B' ? 'ข' : q.correct === 'C' ? 'ค' : q.correct === 'D' ? 'ง' : '') : '❌ ขาด'}
                </span>
            </td>
            <td style="text-align: center;">
                <button type="button" class="btn-xs edit edit-preview-btn" style="margin-bottom: 4px; padding: 4px 8px; font-size: 11px;">แก้ไข</button>
                <button type="button" class="btn-xs delete delete-preview-btn" style="padding: 4px 8px; font-size: 11px;">ลบ</button>
            </td>
        `;

        tr.querySelector('.edit-preview-btn').onclick = () => openQuestionModal(q, true, idx);
        tr.querySelector('.delete-preview-btn').onclick = () => {
            if (confirm(`คุณต้องการลบข้อสอบตัวอย่างข้อที่ ${idx + 1} ใช่หรือไม่?`)) {
                tempFileQuestions.splice(idx, 1);
                renderFileImportPreview(tempFileQuestions);
                showToast('ลบข้อสอบตัวอย่างแล้ว');
            }
        };

        tbody.appendChild(tr);
    });
    
    statsEl.innerHTML = `พบข้อสอบทั้งหมด <span style="font-size: 16px; color: var(--primary-color);">${questions.length}</span> ข้อ (ข้อมูลครบถ้วน <span style="color: #2e7d32;">${completeCount}</span> ข้อ, ข้อมูลไม่สมบูรณ์ <span style="color: var(--accent-color);">${incompleteCount}</span> ข้อ)`;
    container.classList.remove('d-none');
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// TAB 4: Google Sheets & JSON Import/Export Actions
function bindImportExportElements() {
    const importSubjSelect = document.getElementById('import-subject-select');
    if (importSubjSelect) {
        importSubjSelect.onchange = updateImportOverwriteLabel;
    }

    // 1. Google Sheets sync click
    const importBtn = document.getElementById('import-sheets-btn');
    importBtn.onclick = async () => {
        const url = document.getElementById('import-sheets-url').value;
        if (!url) {
            showToast('กรุณากรอกลิงก์ Google Sheets CSV หรือ ลิงก์แชร์ตารางให้เรียบร้อย', 'error');
            return;
        }

        const mode = document.querySelector('input[name="import-mode"]:checked').value;
        const subjectFilter = importSubjSelect ? importSubjSelect.value : 'all';
        
        importBtn.disabled = true;
        importBtn.textContent = '🔄 กำลังดึงข้อมูลและประมวลผล...';

        try {
            const count = await syncFromGoogleSheets(url, mode, subjectFilter, activeQualificationScope);
            if (subjectFilter === 'all') {
                showToast(`นำเข้าข้อสอบจาก Google Sheets สำเร็จ! รวมนำเข้าได้ ${count} ข้อ`);
            } else {
                showToast(`นำเข้าข้อสอบเข้าวิชา "${subjectFilter}" สำเร็จ! รวมนำเข้าได้ ${count} ข้อ`);
            }
            document.getElementById('import-sheets-url').value = '';
            
            // Refresh systems
            renderAdminQuestionsList();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            importBtn.disabled = false;
            importBtn.textContent = '⚡ ซิงค์ข้อมูลกับ Google Sheets';
        }
    };

    // 2. Export JSON File download
    document.getElementById('export-questions-btn').onclick = () => {
        const questions = getQuestions();
        const dataStr = JSON.stringify(questions, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = 'army_exam_questions_backup.json';
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        showToast('ดาวน์โหลดไฟล์ข้อมูลสำรองข้อสอบ (.json) เรียบร้อย');
    };

    // 3. Import JSON file upload
    const jsonFileInput = document.getElementById('import-questions-file');
    const jsonFileTrigger = document.getElementById('import-questions-file-trigger');

    jsonFileTrigger.onclick = () => {
        jsonFileInput.click();
    };

    jsonFileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const parsed = JSON.parse(evt.target.result);
                if (!Array.isArray(parsed)) {
                    throw new Error('โครงสร้างไฟล์ไม่ถูกต้อง: ต้องอยู่ในรูป Array ข้อมูล');
                }

                parsed.forEach(newQ => {
                    if (!newQ.sourceFile) {
                        newQ.sourceFile = file.name;
                    }
                    newQ.qualification = activeQualificationScope;
                });

                // Verify fields in first element
                if (parsed.length > 0) {
                    const sample = parsed[0];
                    const subjectFilter = importSubjSelect ? importSubjSelect.value : 'all';
                    if (subjectFilter === 'all' && (!sample.subject || !sample.question || !sample.options || !sample.correct)) {
                        throw new Error('โครงสร้างหัวข้อใน JSON คลาดเคลื่อน ยืนยันว่าต้องมีฟิลด์: subject, question, options (มี A, B, C, D) และ correct');
                    } else if (subjectFilter !== 'all' && (!sample.question || !sample.options || !sample.correct)) {
                        throw new Error('โครงสร้างหัวข้อใน JSON คลาดเคลื่อน ยืนยันว่าต้องมีฟิลด์: question, options (มี A, B, C, D) และ correct');
                    }
                }

                const subjectFilter = importSubjSelect ? importSubjSelect.value : 'all';
                const mode = document.querySelector('input[name="import-mode"]:checked').value;

                let confirmMsg = `ยืนยันการนำเข้าข้อสอบจำนวน ${parsed.length} ข้อเข้าระบบ?`;
                if (subjectFilter !== 'all') {
                    if (mode === 'overwrite') {
                        confirmMsg = `⚠️ ยืนยันการนำเข้าข้อสอบจำนวน ${parsed.length} ข้อเข้าสู่วิชา "${subjectFilter}"?\nการกระทำนี้จะล้างข้อสอบวิชา "${subjectFilter}" เดิมออกทั้งหมดและทดแทนด้วยไฟล์ใหม่!`;
                    } else {
                        confirmMsg = `ยืนยันการนำเข้าข้อสอบจำนวน ${parsed.length} ข้อเพิ่มเติมเข้าสู่วิชา "${subjectFilter}"?`;
                    }
                } else {
                    if (mode === 'overwrite') {
                        confirmMsg = `⚠️ ยืนยันการนำเข้าข้อสอบจำนวน ${parsed.length} ข้อเข้าระบบ?\nการกระทำนี้จะล้างคลังข้อสอบทั้งหมดในระบบ!`;
                    }
                }

                if (confirm(confirmMsg)) {
                    const current = getQuestions();
                    let finalQuestions = [];

                    // Apply subject overrides if necessary
                    if (subjectFilter !== 'all') {
                        parsed.forEach(newQ => {
                            newQ.subject = subjectFilter;
                        });
                    }

                    if (subjectFilter === 'all') {
                        if (mode === 'overwrite') {
                            finalQuestions = parsed;
                        } else {
                            finalQuestions = [...current];
                            parsed.forEach(newQ => {
                                const exists = current.some(q => q.question.toLowerCase() === newQ.question.toLowerCase() && q.subject.toLowerCase() === newQ.subject.toLowerCase());
                                if (!exists) {
                                    if (!newQ.id) newQ.id = 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                                    finalQuestions.push(newQ);
                                }
                            });
                        }
                    } else {
                        // Specific subject mode
                        if (mode === 'overwrite') {
                            const otherQuestions = current.filter(q => q.subject.toLowerCase() !== subjectFilter.toLowerCase());
                            finalQuestions = [...otherQuestions];
                            parsed.forEach(newQ => {
                                if (!newQ.id) newQ.id = 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                                finalQuestions.push(newQ);
                            });
                        } else {
                            finalQuestions = [...current];
                            parsed.forEach(newQ => {
                                const exists = current.some(q => q.question.toLowerCase() === newQ.question.toLowerCase() && q.subject.toLowerCase() === subjectFilter.toLowerCase());
                                if (!exists) {
                                    if (!newQ.id) newQ.id = 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                                    finalQuestions.push(newQ);
                                }
                            });
                        }
                    }

                    saveQuestions(finalQuestions, activeQualificationScope);
                    updateSubjectConfigs(activeQualificationScope);
                    
                    const addedCount = finalQuestions.length - current.length;
                    if (mode === 'overwrite') {
                        showToast(`ล้างประวัติเดิมและนำเข้าสำเร็จ! ขณะนี้มีข้อสอบทั้งหมดในระบบ ${finalQuestions.length} ข้อ`);
                    } else {
                        showToast(`นำเข้าข้อสอบเพิ่มเติมสำเร็จ! เพิ่มข้อใหม่ได้ ${addedCount} ข้อ`);
                    }

                    // Reset file input
                    jsonFileInput.value = '';
                    renderAdminQuestionsList();
                }
            } catch (err) {
                showToast(`นำเข้าล้มเหลว: ${err.message}`, 'error');
            }
        };
        reader.readAsText(file);
    };

    // --- WORD/EXCEL LOCAL FILE IMPORT BINDINGS ---
    const fileInput = document.getElementById('import-doc-excel-file');
    const fileTrigger = document.getElementById('import-doc-excel-trigger');
    const fileNameSpan = document.getElementById('import-selected-filename');
    const fileSubjectSelect = document.getElementById('import-file-subject-select');
    const fileModeRadios = document.getElementsByName('import-file-mode');
    
    if (fileSubjectSelect) {
        fileSubjectSelect.onchange = updateImportFileOverwriteLabel;
    }
    
    if (fileTrigger && fileInput) {
        fileTrigger.onclick = () => {
            fileInput.click();
        };
        
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) {
                fileNameSpan.textContent = 'ไม่ได้เลือกไฟล์ใดๆ';
                document.getElementById('import-file-preview-container').classList.add('d-none');
                return;
            }
            
            fileNameSpan.textContent = file.name;
            const ext = file.name.split('.').pop().toLowerCase();
            
            const reader = new FileReader();
            
            if (ext === 'xlsx' || ext === 'xls') {
                reader.onload = (evt) => {
                    try {
                        const data = new Uint8Array(evt.target.result);
                        const defaultSubject = fileSubjectSelect ? fileSubjectSelect.value : 'all';
                        const questions = parseExcelData(data, defaultSubject);
                        if (questions.length === 0) {
                            showToast('ไม่พบข้อมูลคำถามในไฟล์ Excel นี้', 'error');
                            return;
                        }
                        // Tag with source file
                        questions.forEach(q => {
                            q.sourceFile = file.name;
                        });
                        tempImportFileName = file.name;
                        renderFileImportPreview(questions);
                        showToast(`วิเคราะห์ไฟล์ Excel สำเร็จ! พบข้อสอบ ${questions.length} ข้อ กรุณาตรวจด้านล่าง`);
                    } catch (err) {
                        console.error(err);
                        showToast('เกิดข้อผิดพลาดในการอ่านไฟล์ Excel: ' + err.message, 'error');
                    }
                };
                reader.readAsArrayBuffer(file);
            } else if (ext === 'docx') {
                reader.onload = (evt) => {
                    const arrayBuffer = evt.target.result;
                    mammoth.extractRawText({ arrayBuffer: arrayBuffer })
                        .then(result => {
                            const text = result.value;
                            const defaultSubject = fileSubjectSelect ? fileSubjectSelect.value : 'all';
                            const questions = parseWordText(text, defaultSubject);
                            if (questions.length === 0) {
                                showToast('ไม่พบข้อมูลคำถามในไฟล์ Word นี้ กรุณาตรวจสอบรูปแบบเอกสาร', 'error');
                                return;
                            }
                            // Tag with source file
                            questions.forEach(q => {
                                q.sourceFile = file.name;
                            });
                            tempImportFileName = file.name;
                            renderFileImportPreview(questions);
                            showToast(`วิเคราะห์ไฟล์ Word สำเร็จ! พบข้อสอบ ${questions.length} ข้อ กรุณาตรวจด้านล่าง`);
                        })
                        .catch(err => {
                            console.error(err);
                            showToast('เกิดข้อผิดพลาดในการอ่านไฟล์ Word: ' + err.message, 'error');
                        });
                };
                reader.readAsArrayBuffer(file);
            } else if (ext === 'pdf') {
                reader.onload = (evt) => {
                    const typedarray = new Uint8Array(evt.target.result);
                    const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
                    
                    pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
                        let maxPages = pdf.numPages;
                        let countPromises = [];
                        for (let j = 1; j <= maxPages; j++) {
                            countPromises.push(
                                pdf.getPage(j).then(function(page) {
                                    return page.getTextContent().then(function(textContent) {
                                        let lastY;
                                        let pageText = '';
                                        for (let item of textContent.items) {
                                            const currentY = item.transform[5];
                                            if (lastY !== undefined && Math.abs(currentY - lastY) > 5) {
                                                pageText += '\n';
                                            } else if (pageText !== '' && !pageText.endsWith('\n') && !item.str.startsWith(' ') && !pageText.endsWith(' ')) {
                                                pageText += ' ';
                                            }
                                            pageText += item.str;
                                            lastY = currentY;
                                        }
                                        return pageText;
                                    });
                                })
                            );
                        }
                        return Promise.all(countPromises);
                    }).then(function(pageTexts) {
                        const text = pageTexts.join('\n');
                        const defaultSubject = fileSubjectSelect ? fileSubjectSelect.value : 'all';
                        const questions = parseWordText(text, defaultSubject);
                        if (questions.length === 0) {
                            showToast('ไม่พบข้อมูลคำถามในไฟล์ PDF นี้ กรุณาตรวจสอบรูปแบบเอกสาร', 'error');
                            return;
                        }
                        // Tag with source file
                        questions.forEach(q => {
                            q.sourceFile = file.name;
                        });
                        tempImportFileName = file.name;
                        renderFileImportPreview(questions);
                        showToast(`วิเคราะห์ไฟล์ PDF สำเร็จ! พบข้อสอบ ${questions.length} ข้อ กรุณาตรวจด้านล่าง`);
                    }).catch(function(err) {
                        console.error(err);
                        showToast('เกิดข้อผิดพลาดในการอ่านไฟล์ PDF: ' + err.message, 'error');
                    });
                };
                reader.readAsArrayBuffer(file);
            } else {
                showToast('รูปแบบไฟล์ไม่รองรับ รองรับเฉพาะ .docx, .xlsx, .xls, .pdf เท่านั้น', 'error');
                fileInput.value = '';
                fileNameSpan.textContent = 'ไม่ได้เลือกไฟล์ใดๆ';
            }
        };
    }
    
    // Cancel file import
    const cancelImportBtn = document.getElementById('cancel-file-import-btn');
    if (cancelImportBtn) {
        cancelImportBtn.onclick = () => {
            fileInput.value = '';
            fileNameSpan.textContent = 'ไม่ได้เลือกไฟล์ใดๆ';
            document.getElementById('import-file-preview-container').classList.add('d-none');
            tempFileQuestions = [];
            showToast('ยกเลิกการนำเข้าไฟล์');
        };
    }
    
    // Confirm file import
    const confirmImportBtn = document.getElementById('confirm-file-import-btn');
    if (confirmImportBtn) {
        confirmImportBtn.onclick = () => {
            if (tempFileQuestions.length === 0) return;
            
            const fileModeRadio = document.querySelector('input[name="import-file-mode"]:checked');
            const subjectFilter = fileSubjectSelect ? fileSubjectSelect.value : 'all';
            const mode = fileModeRadio ? fileModeRadio.value : 'append';
            
            let confirmMsg = `ยืนยันการนำเข้าข้อสอบจากไฟล์จำนวน ${tempFileQuestions.length} ข้อเข้าระบบ?`;
            if (subjectFilter !== 'all') {
                if (mode === 'overwrite') {
                    confirmMsg = `⚠️ ยืนยันการนำเข้าข้อสอบจากไฟล์จำนวน ${tempFileQuestions.length} ข้อเข้าสู่วิชา "${subjectFilter}"?\nการกระทำนี้จะล้างข้อสอบวิชา "${subjectFilter}" เดิมออกทั้งหมดและแทนที่ด้วยข้อสอบจากไฟล์!`;
                } else {
                    confirmMsg = `ยืนยันการนำเข้าข้อสอบจากไฟล์จำนวน ${tempFileQuestions.length} ข้อเพิ่มเติมเข้าสู่วิชา "${subjectFilter}"?`;
                }
            } else {
                if (mode === 'overwrite') {
                    confirmMsg = `⚠️ ยืนยันการนำเข้าข้อสอบจากไฟล์จำนวน ${tempFileQuestions.length} ข้อเข้าระบบ?\nการกระทำนี้จะล้างคลังข้อสอบทั้งหมดในระบบ!`;
                }
            }
            
            if (confirm(confirmMsg)) {
                const current = getQuestions();
                let finalQuestions = [];
                
                // Override subjects if specific subject selected
                if (subjectFilter !== 'all') {
                    tempFileQuestions.forEach(q => {
                        q.subject = subjectFilter;
                    });
                }
                
                if (subjectFilter === 'all') {
                    if (mode === 'overwrite') {
                        finalQuestions = tempFileQuestions;
                    } else {
                        // Append and avoid duplicate questions (same subject + question text)
                        finalQuestions = [...current];
                        tempFileQuestions.forEach(newQ => {
                            const duplicate = current.some(q => 
                                q.subject.toLowerCase() === newQ.subject.toLowerCase() && 
                                q.question.toLowerCase().trim() === newQ.question.toLowerCase().trim()
                            );
                            if (!duplicate) {
                                finalQuestions.push(newQ);
                            }
                        });
                    }
                } else {
                    // Specific subject filter
                    if (mode === 'overwrite') {
                        // Keep other subjects, clear current subject and replace
                        finalQuestions = current.filter(q => q.subject.toLowerCase() !== subjectFilter.toLowerCase());
                        finalQuestions.push(...tempFileQuestions);
                    } else {
                        // Append to specific subject
                        finalQuestions = [...current];
                        tempFileQuestions.forEach(newQ => {
                            const duplicate = current.some(q => 
                                q.subject.toLowerCase() === subjectFilter.toLowerCase() && 
                                q.question.toLowerCase().trim() === newQ.question.toLowerCase().trim()
                            );
                            if (!duplicate) {
                                finalQuestions.push(newQ);
                            }
                        });
                    }
                }
                
                // Add unique IDs to new questions if missing and assign qualification
                finalQuestions.forEach((q, idx) => {
                    if (!q.id) {
                        q.id = 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                    }
                    q.qualification = activeQualificationScope;
                });
                
                // Save questions
                saveQuestions(finalQuestions, activeQualificationScope);
                updateSubjectConfigs(activeQualificationScope);
                
                if (subjectFilter === 'all') {
                    showToast(`นำเข้าข้อสอบจากไฟล์สำเร็จ! รวมนำเข้าได้ ${tempFileQuestions.length} ข้อ`);
                } else {
                    showToast(`นำเข้าข้อสอบไฟล์สู่วิชา "${subjectFilter}" สำเร็จ! รวมนำเข้าได้ ${tempFileQuestions.length} ข้อ`);
                }
                
                // Clean up and refresh UI
                fileInput.value = '';
                fileNameSpan.textContent = 'ไม่ได้เลือกไฟล์ใดๆ';
                document.getElementById('import-file-preview-container').classList.add('d-none');
                tempFileQuestions = [];
                
                renderAdminQuestionsList();
            }
        };
    }
}

// Expose internal functions for validation testing
window.renderFileImportPreview = renderFileImportPreview;
window.openQuestionModal = openQuestionModal;
window.renderAdminQuestionsList = renderAdminQuestionsList;
Object.defineProperty(window, 'tempFileQuestions', {
    get: () => tempFileQuestions,
    set: (val) => { tempFileQuestions = val; }
});

// ==========================================
// ADMIN DASHBOARD WIDGETS
// ==========================================
function renderDatabaseCapacity() {
    // Calculate total size based on actual DB size bytes from Supabase PostgreSQL
    const totalBytes = getDbSizeBytes();
    const maxBytes = 500 * 1024 * 1024; // 500.0 MB Limit for Supabase Free Tier
    const percentage = Math.min(100, (totalBytes / maxBytes) * 100);

    // Format size text
    let formattedSize = '';
    if (totalBytes < 1024) {
        formattedSize = `${totalBytes} B`;
    } else if (totalBytes < 1024 * 1024) {
        formattedSize = `${(totalBytes / 1024).toFixed(2)} KB`;
    } else {
        formattedSize = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    // Render bar
    const bar = document.getElementById('db-capacity-bar');
    const text = document.getElementById('db-capacity-text');
    if (bar && text) {
        bar.style.width = `${percentage.toFixed(2)}%`;
        text.textContent = `${formattedSize} / 500.00 MB (${percentage.toFixed(2)}%)`;

        // Bar colors: glowing neon blue sky gradient with neon box shadow
        bar.style.background = 'linear-gradient(90deg, #00d2ff, #0072ff)';
        bar.style.boxShadow = '0 0 10px rgba(0, 210, 255, 0.85), 0 0 18px rgba(0, 114, 255, 0.45)';
    }
}

function renderLeaderboard() {
    const titleEl = document.getElementById('leaderboard-title');
    if (titleEl) {
        titleEl.textContent = `🏆 3 อันดับแรกทำคะแนนสูงสุด (${activeQualificationScope})`;
    }

    const listContainer = document.getElementById('leaderboard-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const attempts = getAttempts();
    
    // Group attempts by userGmail to get highest percentage attempt per user
    const userBest = {};
    attempts.forEach(att => {
        if (!att.userGmail) return;
        const email = att.userGmail.toLowerCase().trim();
        const pct = att.percentage || 0;
        if (!userBest[email] || pct > userBest[email].percentage) {
            userBest[email] = {
                gmail: email,
                name: att.userName || att.userGmail,
                percentage: pct,
                totalScore: att.totalScore,
                totalQuestions: att.totalQuestions
            };
        }
    });

    const sorted = Object.values(userBest).sort((a, b) => b.percentage - a.percentage);
    const top3 = sorted.slice(0, 3);

    if (top3.length === 0) {
        listContainer.innerHTML = `
            <div style="font-size: 11px; color: var(--text-sub); text-align: center; padding: 12px 0; font-weight: 500;">
                📭 ยังไม่มีประวัติการสอบเข้าในระบบ
            </div>
        `;
        return;
    }

    top3.forEach((user, idx) => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: var(--radius-sm); font-size: 12px; transition: var(--transition); border: 1px solid var(--border-color);';
        
        let rankBadge = '';
        let rankStyle = '';
        let itemBg = 'var(--bg-main)';
        let borderStyle = '1px solid var(--border-color)';
        
        if (idx === 0) {
            rankBadge = '👑';
            rankStyle = 'color: #ffd700; font-weight: bold; font-size: 14px;';
            itemBg = 'rgba(255, 215, 0, 0.08)';
            borderStyle = '1.5px solid #ffd700';
        } else if (idx === 1) {
            rankBadge = '🥈';
            rankStyle = 'color: #c0c0c0; font-weight: bold; font-size: 14px;';
            itemBg = 'rgba(192, 192, 192, 0.08)';
            borderStyle = '1.5px solid #c0c0c0';
        } else if (idx === 2) {
            rankBadge = '🥉';
            rankStyle = 'color: #cd7f32; font-weight: bold; font-size: 14px;';
            itemBg = 'rgba(205, 127, 50, 0.08)';
            borderStyle = '1.5px solid #cd7f32';
        }

        item.style.background = itemBg;
        item.style.border = borderStyle;

        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 72%;">
                <span style="${rankStyle}">${rankBadge}</span>
                <div style="display: flex; flex-direction: column; overflow: hidden;">
                    <span style="font-weight: 700; color: var(--text-main); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(user.name)}">${escapeHtml(user.name)}</span>
                    <span style="font-size: 10px; color: var(--text-sub); overflow: hidden; text-overflow: ellipsis;">${escapeHtml(user.gmail)}</span>
                </div>
            </div>
            <div style="text-align: right; flex-shrink: 0;">
                <span style="font-weight: 800; font-size: 15px; color: ${idx === 0 ? '#ffd700' : idx === 1 ? '#00e5ff' : '#ff9100'}; text-shadow: 0 0 8px ${idx === 0 ? 'rgba(255, 215, 0, 0.7)' : idx === 1 ? 'rgba(0, 229, 255, 0.7)' : 'rgba(255, 145, 0, 0.7)'};">${user.percentage}%</span>
                <div style="font-size: 9px; color: var(--text-sub); font-weight: 600;">${user.totalScore}/${user.totalQuestions} ข้อ</div>
            </div>
        `;
        listContainer.appendChild(item);
    });
}

// ==========================================
// REAL-TIME SYSTEM MONITOR & HEARTBEATS
// ==========================================
function getCurrentStatusText() {
    const user = getCurrentUser();
    if (!user) return "ไม่ได้เข้าสู่ระบบ";
    
    if (user.role === 'admin') {
        const activeTab = document.querySelector('.admin-menu-item.active');
        const tabText = activeTab ? activeTab.textContent.replace(/^[^\w\s\u0e00-\u0e7f]+/, '').trim() : '';
        return `กำลังจัดการระบบ: ${tabText}`;
    }
    
    if (window.currentActiveView === 'dashboard-view') {
        return "กำลังดูหน้าหลักผู้สอบ";
    }
    
    if (window.currentActiveView === 'exam-view') {
        const session = getActiveSession();
        if (session) {
            const qNum = (session.currentQuestionIndex || 0) + 1;
            const total = session.questions ? session.questions.length : 15;
            return `กำลังทำข้อสอบจำลอง ข้อที่ ${qNum}/${total}`;
        }
        return "กำลังเริ่มทำข้อสอบจำลอง";
    }
    
    if (window.currentActiveView === 'results-view') {
        return "กำลังดูผลคะแนนประเมิน";
    }
    
    return "กำลังใช้งานระบบ";
}

async function sendHeartbeat() {
    const user = getCurrentUser();
    if (!user) return;
    
    const sessionId = sessionStorage.getItem('army_exam_session_id') || '';
    const payload = {
        gmail: user.gmail,
        name: user.name,
        role: user.role,
        status: getCurrentStatusText(),
        sessionId: sessionId
    };
    
    try {
        const res = await fetch('/api/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'error' && data.message === 'session_conflict') {
                alert('บัญชีนี้เข้าสู่ระบบจากเครื่องอื่นแล้ว ระบบจะนำคุณออกจากระบบโดยอัตโนมัติ');
                logoutUser();
                window.location.reload();
            }
        }
    } catch (err) {
        console.error("Heartbeat sync error:", err);
    }
}

// Global cache for previous statuses to detect real state changes and log them
let previousUserStatuses = {};

function initRealtimeMonitor() {
    const tableBody = document.getElementById('realtime-users-table-body');
    const feed = document.getElementById('realtime-activity-feed');
    const onlineCountEl = document.getElementById('realtime-online-count');
    const examCountEl = document.getElementById('realtime-exam-count');
    const sidebarBadge = document.getElementById('sidebar-active-badge');
    
    if (!tableBody || !feed) return;

    // Clear existing interval if running
    if (realtimeIntervalId) {
        clearInterval(realtimeIntervalId);
    }

    const logEvent = (message) => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const div = document.createElement('div');
        div.style.padding = '4px 0';
        div.style.borderBottom = '1px solid var(--border-color)';
        div.style.lineHeight = '1.5';
        div.innerHTML = `<span style="color: #8892b0;">[${timeStr}]</span> ${message}`;
        feed.appendChild(div);
        
        while (feed.children.length > 50) {
            feed.removeChild(feed.firstChild);
        }
        
        feed.scrollTop = feed.scrollHeight;
    };

    appendRealtimeActivityLog = logEvent;

    if (feed.children.length === 0) {
        logEvent(`<span style="color: #58a6ff; font-weight: 700;">🚀 เริ่มต้นการติดตามความปลอดภัยและสถานะระบบสด...</span>`);
        logEvent(`<span style="color: #00ff66;">🟢 เชื่อมต่อกับ API Gateway สำเร็จ (Real-Time Mode)</span>`);
    }

    const updateStatusData = async () => {
        try {
            const res = await fetch('/api/realtime_status');
            if (!res.ok) throw new Error('API status not ok');
            const data = await res.json();
            
            // 1. Update online and exam counts
            if (onlineCountEl) onlineCountEl.textContent = data.online_count;
            if (examCountEl) examCountEl.textContent = data.exam_count;
            if (sidebarBadge) sidebarBadge.textContent = data.online_count;
            
            // 2. Render table rows
            tableBody.innerHTML = '';
            
            if (data.users.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-sub); padding: 20px;">ไม่มีผู้ใช้งานออนไลน์ขณะนี้</td></tr>`;
            } else {
                data.users.forEach(u => {
                    const tr = document.createElement('tr');
                    
                    let statusColor = 'var(--text-main)';
                    if (u.status.includes('ข้อที่') || u.status.includes('เริ่ม')) {
                        statusColor = '#ff0055; font-weight: 700; text-shadow: 0 0 4px rgba(255, 0, 85, 0.2);';
                    } else if (u.status.includes('จัดการระบบ') || u.status.includes('Active')) {
                        statusColor = '#00d2ff; font-weight: 700;';
                    } else if (u.status.includes('ผลคะแนน') || u.status.includes('AI')) {
                        statusColor = '#00ff66;';
                    }

                    tr.innerHTML = `
                        <td><strong>${escapeHtml(u.name)}</strong></td>
                        <td>${escapeHtml(u.gmail)}</td>
                        <td><span class="badge" style="background: ${u.role === 'Admin' ? 'var(--primary-color)' : 'var(--border-color)'}; color: ${u.role === 'Admin' ? 'white' : 'var(--text-main)'}; font-size: 11px; padding: 2px 8px;">${u.role}</span></td>
                        <td><span style="color: ${statusColor}">${escapeHtml(u.status)}</span></td>
                        <td style="color: var(--text-sub); font-size: 12px;">${escapeHtml(u.loginTime)}</td>
                    `;
                    tableBody.appendChild(tr);

                    // 3. Detect changes to log them in live console feed
                    const oldStatus = previousUserStatuses[u.gmail];
                    if (oldStatus !== u.status) {
                        previousUserStatuses[u.gmail] = u.status;
                        
                        // Ignore initial logs if we don't have previous history
                        if (oldStatus !== undefined) {
                            let logMsg = '';
                            if (u.status.includes('ข้อที่')) {
                                logMsg = `✏️ <strong style="color: #ffb74d;">${escapeHtml(u.name)}</strong> ขยับการทำข้อสอบเป็น: ${escapeHtml(u.status)}`;
                            } else if (u.status.includes('ผลคะแนน')) {
                                logMsg = `📊 <strong style="color: #00ff66;">${escapeHtml(u.name)}</strong> ตรวจดูคะแนนแบบประเมินและ AI feed`;
                            } else if (u.status.includes('จัดการระบบ')) {
                                logMsg = `🛡️ <strong style="color: #00d2ff;">${escapeHtml(u.name)}</strong> เข้าดู ${escapeHtml(u.status.replace('กำลังจัดการระบบ: ', ''))}`;
                            } else {
                                logMsg = `👤 <strong style="color: var(--text-sub);">${escapeHtml(u.name)}</strong> เปลี่ยนสถานะเป็น: ${escapeHtml(u.status)}`;
                            }
                            logEvent(logMsg);
                        }
                    }
                });
            }

            // Clean up left users from previousUserStatuses
            const currentGmails = data.users.map(u => u.gmail);
            Object.keys(previousUserStatuses).forEach(gmail => {
                if (!currentGmails.includes(gmail)) {
                    // Log user left
                    const offlineName = gmail.split('@')[0]; // fallback
                    logEvent(`❌ <strong style="color: #ef4444;">${offlineName}</strong> ออกจากระบบหรือหมดเวลาเชื่อมต่อ (Disconnected)`);
                    delete previousUserStatuses[gmail];
                }
            });
            
        } catch (err) {
            console.error("Fetch realtime status error:", err);
        }
    };

    // Immediate update
    updateStatusData();

    // Query server every 3 seconds for live changes
    realtimeIntervalId = setInterval(updateStatusData, 3000);
}
