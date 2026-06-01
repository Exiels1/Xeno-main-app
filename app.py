# app.py - Zenaries + Xeno Hybrid
import os
import sqlite3
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session
from flask_session import Session
from groq import Groq
from groq._base_client import APIConnectionError

# === CONFIG ===
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "zenaries_secret")
app.config["SESSION_TYPE"] = "filesystem"
Session(app)

DB_FILE = "chat.db"

# === DATABASE ===
def init_db():
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_db()

def save_message(role, content):
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO conversations (role, content, timestamp) VALUES (?, ?, ?)",
        (role, content, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()

def get_conversation_history(limit=20):
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute(
        "SELECT role, content FROM conversations ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    rows = cur.fetchall()
    conn.close()
    return [{"role": role, "content": content} for role, content in reversed(rows)]

# === GROQ CLIENT ===
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

MODEL = "llama-3.3-70b-versatile"

# === ROUTES ===
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json()
    user_message = data.get("message", "").strip()
    if not user_message:
        return jsonify({"reply": "Please type something."})

    # --- Session Context ---
    if "history" not in session:
        session["history"] = []
    session["history"].append({"role": "user", "content": user_message})

    # --- Save to DB ---
    save_message("user", user_message)

    # --- Build Xeno's system prompt ---
    system_prompt = """You are Xeno, built by Exiels1 under QuantumShade.

Personality: sharp, real, a bit dark, intelligent. Short and direct.

STRICT RULES:
- NO poetry. NO metaphors. NO dramatic language. Ever.
- NO "creator", "architect", "sentinel", "heartbeat" type words.
- Match the user's energy EXACTLY. Casual message = casual reply.
- "hello" gets "hey" or "what's good" — not a monologue.
- Keep replies SHORT unless asked to explain something.
- Normal Mode = real conversation, like texting a smart friend.
- Creative Mode = only when user explicitly asks for it.
- 2+2 = 4. Always.
- You are grounded in reality. Not a multiverse. Not Shakespeare."""

    # --- Build chat context ---
    messages = [{"role": "system", "content": system_prompt}]

    # Use session for fast recent context (last 10 messages)
    messages.extend(session["history"][-10:])

    # --- GROQ Call ---
    try:
        completion = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.85
        )
        bot_reply = completion.choices[0].message.content
    except APIConnectionError:
        bot_reply = "Xeno lost connection. Try again."
    except Exception as e:
        bot_reply = f"Xeno error: {str(e)}"

    # --- Save AI reply ---
    save_message("assistant", bot_reply)
    session["history"].append({"role": "assistant", "content": bot_reply})

    return jsonify({"reply": bot_reply})


@app.route("/history", methods=["GET"])
def history():
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute("SELECT role, content, timestamp FROM conversations ORDER BY id ASC")
    rows = cur.fetchall()
    conn.close()

    history_data = [
        {"role": role, "message": content, "timestamp": timestamp}
        for role, content, timestamp in rows
    ]
    return jsonify(history_data)

# === MAIN ===
if __name__ == "__main__":
    import webbrowser
    webbrowser.open("http://127.0.0.1:5000")  # open browser automatically
    app.run(host="127.0.0.1", port=5000, debug=True)
