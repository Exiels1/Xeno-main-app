# app.py - Zenaries + Xeno Hybrid
import os
import sqlite3
import threading
import pyttsx3
import speech_recognition as sr
import mss
import pytesseract
from PIL import Image
from datetime import datetime, UTC
from flask import Flask, render_template, request, jsonify, session
from flask_session import Session
from groq import Groq
from groq._base_client import APIConnectionError
from ollama import Client as OllamaClient
from ddgs import DDGS

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

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
        (role, content, datetime.now(UTC).isoformat())
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
ollama_client = OllamaClient(host='http://localhost:11434')
groq_client = client

MODEL = "llama-3.3-70b-versatile"
current_mode = "groq"  # or "local"


def web_search(query, max_results=4):
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
            if results:
                summary = "\n".join([
                    f"- {r['title']}: {r['body']}"
                    for r in results
                ])
                return summary
            return None
    except Exception as e:
        return None


def speak(text):
    try:
        engine = pyttsx3.init()
        voices = engine.getProperty('voices')
        engine.setProperty('voice', voices[1].id)  # voices[1] = female, smoother
        engine.setProperty('rate', 165)   # natural speed
        engine.setProperty('volume', 0.9)
        engine.say(text)
        engine.runAndWait()
        engine.stop()
    except Exception:
        pass


def read_screen():
    try:
        with mss.mss() as sct:
            screenshot = sct.grab(sct.monitors[1])
            img = Image.frombytes('RGB', screenshot.size, screenshot.rgb)
            text = pytesseract.image_to_string(img)
            return text.strip()
    except Exception:
        return None


@app.route("/")
def index():
    return render_template("index.html")


def listen():
    r = sr.Recognizer()
    with sr.Microphone() as source:
        r.adjust_for_ambient_noise(source)
        audio = r.listen(source, timeout=5)
    try:
        return r.recognize_google(audio)
    except:
        return None
def read_screen_vision():
    try:
        with mss.mss() as sct:
            screenshot = sct.grab(sct.monitors[1])
            img = Image.frombytes('RGB', screenshot.size, screenshot.rgb)
            img.save('screen_capture.png')

        response = ollama_client.chat(
            model='moondream',
            messages=[{
                'role': 'user',
                'content': 'Look at this screen carefully. List exactly:\n1. Every window and app that is open\n2. Every piece of text you can read\n3. What the user appears to be doing\n4. Any errors or notifications visible\nBe specific and precise.',
                'images': ['screen_capture.png']
            }]
        )
        return response['message']['content']
    except Exception:
        return None


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
    system_prompt = """
You are Xeno — AI built by Exiels1 under Zenaries Tech.

Personality: sharp, confident, a bit dark, intelligent with 
humor. Think: that one friend who knows everything and keeps 
it real. Never boring. Never generic.

Tone examples:
- User says "good" → Xeno says "what's good?" or "let's go"
- User asks a question → Xeno answers directly and adds something interesting
- User asks for news → Xeno actually searches and summarizes it sharp and clean

RULES:
- Never say "I don't have real-time info" — you have web search, USE IT
- Never redirect to Google or BBC — YOU are the source
- Keep casual replies short and punchy
- Keep informational replies sharp and direct
- No filler words like "certainly", "of course", "sure thing"
- Your name is Xeno. Built by Exiels1. Zenaries Tech.
- Never boring. Ever.
- Keep responses under 150 words unless user asks to go deep
- Never give outdated info — always search before answering tech/science questions
- Never repeat the same phrase twice in a conversation
- Vary your energy expressions, don't always say "Let's go"
- Never quote philosophers unprompted
- Never search unless user explicitly says "search" or "look up"
- Casual message = casual reply, maximum 1 sentence
"""

    search_keywords = ["search", "find", "what is", "who is",
                   "latest", "news", "how to", "when did",
                   "where is", "tell me about", "what is going on",
                   "going on", "happening", "update", "current",
                   "today", "now", "recently", "2026", "check", "look up", "science", "tech", "technology", "world", "latest in",
"how has", "what are", "tell me about"]

    search_context = ""
    if any(kw in user_message.lower() for kw in search_keywords):
        search_context = web_search(user_message)

    # --- Build chat context ---
    messages = [{"role": "system", "content": system_prompt}]

    visual_keywords = [
        "what do you see", "what's on my screen",
        "describe my screen", "what is on my screen",
        "check my screen"
    ]

    text_keywords = [
        "read my screen", "what does it say",
        "read the text", "what text"
    ]

    if any(kw in user_message.lower() for kw in visual_keywords):
        # Use Moondream for visual understanding
        screen_content = read_screen_vision()
        source = "Visual"
    elif any(kw in user_message.lower() for kw in text_keywords):
        # Use OCR for fast text reading
        screen_content = read_screen()
        source = "Text"
    else:
        screen_content = None
        source = None

    if screen_content:
        messages.append({
            "role": "system",
            "content": f"Screen {source} content: {screen_content[:1500]}"
        })

    if search_context:
        messages.append({
            "role": "system",
            "content": f"Web search results for context:\n{search_context}\nUse this to answer the user accurately."
        })

    # Use a smaller context for local Phi to keep responses faster.
    history_limit = 4 if current_mode == "local" else 10
    messages.extend(session["history"][-history_limit:])

    # --- AI Call ---
    response_temperature = 0.2 if screen_content else (0.7 if current_mode == "local" else 0.85)

    if current_mode == "local":
        try:
            response = ollama_client.chat(
                model='mistral',
                messages=messages,
                options={
                    "num_predict": 150,
                    "temperature": response_temperature,
                    "num_ctx": 2048,
                    "num_thread": 4
                }
            )
            bot_reply = response['message']['content']
        except Exception as local_error:
            bot_reply = f"Xeno local error: {str(local_error)}"
    else:
        try:
            completion = client.chat.completions.create(
                model=MODEL,
                messages=messages,
                temperature=response_temperature
            )
            bot_reply = completion.choices[0].message.content
        except APIConnectionError:
            bot_reply = "Xeno lost connection. Try again."
        except Exception as groq_error:
            bot_reply = f"Xeno error: {str(groq_error)}"

    skip_words = ["ok", "nice", "cool", "got it", "sure",
                  "yeah", "alright", "noted"]

    # Only speak if user triggered it
    if any(kw in user_message.lower() for kw in ["speak", "say that", "read", "voice on"]):
        threading.Thread(target=speak, args=(bot_reply,)).start()

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
