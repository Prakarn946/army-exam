import os
import sys
import time
import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import Json
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

PORT = 8000
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres.oulflwyclplzzoypqkvj:0621563858pP@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"
)

# Initialize ThreadedConnectionPool
try:
    db_pool = ThreadedConnectionPool(1, 20, dsn=DATABASE_URL)
except Exception as e:
    print(f"Error initializing connection pool: {e}")
    sys.exit(1)

def get_db_connection():
    return db_pool.getconn()

def release_db_connection(conn):
    db_pool.putconn(conn)

app = FastAPI(title="Army Exam API Server")

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom Middleware to prevent caching for APIs and static assets
@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith('/api/') or path.endswith('.js') or path.endswith('.css') or 'v=' in str(request.query_params):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

active_sessions = {}

@app.get("/api/db")
def get_db():
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # Load config
        cur.execute("SELECT data FROM config WHERE id = 1;")
        row = cur.fetchone()
        config = row[0] if row else {}
        
        # Load users
        cur.execute("SELECT gmail, password, name, role, profile_image FROM users;")
        users = []
        for r in cur.fetchall():
            users.append({
                "gmail": r[0],
                "password": r[1],
                "name": r[2],
                "role": r[3],
                "profileImage": r[4]
            })
            
        # Load questions
        cur.execute("SELECT id, subject, question, options, correct, explanation FROM questions;")
        questions = []
        for r in cur.fetchall():
            questions.append({
                "id": r[0],
                "subject": r[1],
                "question": r[2],
                "options": r[3],
                "correct": r[4],
                "explanation": r[5]
            })
            
        # Load attempts
        cur.execute("SELECT id, user_gmail, user_name, timestamp, total_questions, total_score, percentage, subject_stats, question_results FROM attempts ORDER BY timestamp DESC;")
        attempts = []
        for r in cur.fetchall():
            attempts.append({
                "id": r[0],
                "userGmail": r[1],
                "userName": r[2],
                "timestamp": r[3],
                "totalQuestions": r[4],
                "totalScore": r[5],
                "percentage": int(r[6]) if r[6] is not None else 0,
                "subjectStats": r[7],
                "questionResults": r[8]
            })
            
        # Load database size
        try:
            cur.execute("SELECT pg_database_size(current_database());")
            db_size_bytes = cur.fetchone()[0]
        except Exception:
            db_size_bytes = 0

        return {
            "questions": questions,
            "users": users,
            "config": config,
            "attempts": attempts,
            "db_size_bytes": db_size_bytes
        }
    except Exception as e:
        print(f"Error loading database: {e}")
        return {"questions": [], "users": [], "config": {}, "attempts": [], "db_size_bytes": 0}
    finally:
        release_db_connection(conn)

@app.get("/api/realtime_status")
def get_realtime_status():
    now = time.time()
    # Clean expired sessions (inactive for more than 20 seconds)
    expired = [gmail for gmail, s in active_sessions.items() if now - s["last_seen"] > 20]
    for gmail in expired:
        del active_sessions[gmail]
    
    users_list = [
        {
            "gmail": gmail,
            "name": s["name"],
            "role": "Admin" if s["role"] == "admin" else "Candidate",
            "status": s["status"],
            "loginTime": time.strftime("%H:%M:%S", time.localtime(s["last_seen"]))
        } for gmail, s in active_sessions.items()
    ]
    
    online_count = len(users_list)
    exam_count = len([u for u in users_list if "ทำข้อสอบ" in u["status"]])
    
    return {
        "online_count": online_count,
        "exam_count": exam_count,
        "users": users_list
    }

@app.post("/api/heartbeat")
async def heartbeat(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
        
    gmail = payload.get("gmail", "").lower().strip()
    name = payload.get("name", "")
    role = payload.get("role", "")
    status = payload.get("status", "")
    session_id = payload.get("sessionId", "")
    
    if gmail:
        now = time.time()
        # Enforce single session check: if there is an active session with a different sessionId, reject
        if gmail in active_sessions and now - active_sessions[gmail]["last_seen"] <= 20:
            if active_sessions[gmail].get("sessionId") and active_sessions[gmail]["sessionId"] != session_id:
                return {"status": "error", "message": "session_conflict"}
                
        active_sessions[gmail] = {
            "name": name,
            "role": role,
            "status": status,
            "sessionId": session_id if session_id else active_sessions.get(gmail, {}).get("sessionId"),
            "last_seen": now
        }
    return {"status": "success"}

@app.post("/api/save_questions")
async def save_questions(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
        
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM questions;")
        for q in payload:
            cur.execute("""
            INSERT INTO questions (id, subject, question, options, correct, explanation)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                subject = EXCLUDED.subject,
                question = EXCLUDED.question,
                options = EXCLUDED.options,
                correct = EXCLUDED.correct,
                explanation = EXCLUDED.explanation;
            """, (q["id"], q["subject"], q["question"], Json(q["options"]), q["correct"], q.get("explanation", "")))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        print(f"Error saving questions: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        release_db_connection(conn)

@app.post("/api/save_config")
async def save_config(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
        
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
        INSERT INTO config (id, data)
        VALUES (1, %s)
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;
        """, (Json(payload),))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        print(f"Error saving config: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        release_db_connection(conn)

@app.post("/api/save_users")
async def save_users(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
        
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM users;")
        for u in payload:
            cur.execute("""
            INSERT INTO users (gmail, password, name, role, profile_image)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (gmail) DO UPDATE SET
                password = EXCLUDED.password,
                name = EXCLUDED.name,
                role = EXCLUDED.role,
                profile_image = EXCLUDED.profile_image;
            """, (u["gmail"].lower().strip(), u["password"], u["name"], u["role"], u.get("profileImage")))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        print(f"Error saving users: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        release_db_connection(conn)

@app.post("/api/register")
async def register(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
        
    gmail = payload.get("gmail", "").lower().strip()
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # Check duplicate
        cur.execute("SELECT 1 FROM users WHERE LOWER(gmail) = %s;", (gmail,))
        if cur.fetchone():
            return JSONResponse(status_code=400, content={"error": "Gmail นี้ถูกใช้งานในระบบแล้ว"})
            
        cur.execute("""
        INSERT INTO users (gmail, password, name, role, profile_image)
        VALUES (%s, %s, %s, %s, %s);
        """, (gmail, payload.get("password"), payload.get("name"), payload.get("role"), payload.get("profileImage")))
        conn.commit()
        return {"status": "success", "user": payload}
    except Exception as e:
        conn.rollback()
        print(f"Error registering user: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        release_db_connection(conn)

@app.post("/api/update_profile_image")
async def update_profile_image(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
        
    gmail = payload.get("gmail", "").lower().strip()
    profile_image = payload.get("profileImage", "")
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("UPDATE users SET profile_image = %s WHERE LOWER(gmail) = %s;", (profile_image, gmail))
        if cur.rowcount == 0:
            return JSONResponse(status_code=400, content={"error": "ไม่พบผู้ใช้ในระบบ"})
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        print(f"Error updating profile image: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        release_db_connection(conn)

@app.post("/api/add_attempt")
async def add_attempt(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
        
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
        INSERT INTO attempts (id, user_gmail, user_name, timestamp, total_questions, total_score, percentage, subject_stats, question_results)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING;
        """, (
            payload["id"], 
            payload["userGmail"].lower().strip(), 
            payload["userName"], 
            payload["timestamp"], 
            payload["totalQuestions"], 
            payload["totalScore"], 
            payload["percentage"], 
            Json(payload["subjectStats"]), 
            Json(payload["questionResults"])
        ))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        print(f"Error adding attempt: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        release_db_connection(conn)

@app.post("/api/save_attempts")
async def save_attempts(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
        
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM attempts;")
        for att in payload:
            cur.execute("""
            INSERT INTO attempts (id, user_gmail, user_name, timestamp, total_questions, total_score, percentage, subject_stats, question_results)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
            """, (
                att["id"], 
                att["userGmail"].lower().strip(), 
                att["userName"], 
                att["timestamp"], 
                att["totalQuestions"], 
                att["totalScore"], 
                att["percentage"], 
                Json(att["subjectStats"]), 
                Json(att["questionResults"])
            ))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        print(f"Error saving attempts: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        release_db_connection(conn)

@app.post("/api/login")
async def login(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
        
    gmail = payload.get("gmail", "").lower().strip()
    password = payload.get("password", "")
    session_id = payload.get("sessionId", "")
    
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT gmail, password, name, role, profile_image FROM users WHERE LOWER(gmail) = %s;", (gmail,))
        row = cur.fetchone()
        if not row or row[1] != password:
            return JSONResponse(status_code=400, content={"error": "Gmail หรือรหัสผ่านไม่ถูกต้อง"})
            
        # Enforce 1 session per email: check if user is already online elsewhere
        now = time.time()
        if gmail in active_sessions and now - active_sessions[gmail]["last_seen"] <= 20:
            if active_sessions[gmail].get("sessionId") and active_sessions[gmail]["sessionId"] != session_id:
                return JSONResponse(status_code=400, content={
                    "error": "บัญชีนี้กำลังเข้าสู่ระบบค้างไว้ในเครื่องอื่นอยู่ กรุณารอจนกว่าเครื่องเดิมจะออกจากระบบ หรือปิดเว็ปอย่างน้อย 20 วินาที"
                })
                
        # Register/update session
        active_sessions[gmail] = {
            "name": row[2],
            "role": row[3],
            "status": "กำลังเข้าใช้งาน",
            "sessionId": session_id,
            "last_seen": now
        }
        
        return {
            "status": "success",
            "user": {
                "gmail": row[0],
                "name": row[2],
                "role": row[3],
                "profileImage": row[4]
            }
        }
    except Exception as e:
        print(f"Error during login verification: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        release_db_connection(conn)

@app.post("/api/logout")
async def logout(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
        
    gmail = payload.get("gmail", "").lower().strip()
    if gmail in active_sessions:
        del active_sessions[gmail]
    return {"status": "success"}

# Mount static files at root "/"
# StaticFiles is mounted last so that it does not intercept API routes
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == '__main__':
    import uvicorn
    # Make sure we run in the server.py directory
    doc_root = os.path.dirname(os.path.abspath(__file__))
    if doc_root:
        os.chdir(doc_root)
        
    print(f"Starting ASGI API + Static File Server on port {PORT}...")
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=True)
