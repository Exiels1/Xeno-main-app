import threading
import webview
from app import app

def start_flask():
    app.run(port=5000, use_reloader=False)

if __name__ == '__main__':
    t = threading.Thread(target=start_flask)
    t.daemon = True
    t.start()
    webview.create_window(
        'Xeno',
        'http://localhost:5000',
        width=1000,
        height=700,
        resizable=True
    )
    webview.start()
