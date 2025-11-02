# init_db.py
import sqlite3

conn = sqlite3.connect("chat.db")
c = conn.cursor()

# Drop old tables if any
c.execute("DROP TABLE IF EXISTS messages")
c.execute("DROP TABLE IF EXISTS conversations")

# New table for conversation history
c.execute("""
CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
""")

conn.commit()
conn.close()

print("✅ Database reset complete. conversations table is ready.")
