// Zenaries Xeno - Enhanced JavaScript Interface
const chatArea = document.getElementById("chatArea");
const messageInput = document.getElementById("messageInput");
const chatForm = document.getElementById("chatForm");
const profileDrawer = document.getElementById("profileDrawer");
const btnProfile = document.getElementById("btnProfile");
const btnCloseProfile = document.getElementById("btnCloseProfile");
const drawerOverlay = profileDrawer;

// Initialize Marked for Markdown parsing
marked.setOptions({
    highlight: function(code, lang) {
        return code;
    },
    breaks: true,
    gfm: true,
    pedantic: false
});

// === MESSAGE HANDLING ===
function appendMessage(role, text, mood = null) {
    const el = document.createElement("div");
    el.className = `msg ${role} ${mood || ''}`;

    const meta = document.createElement("div");
    meta.className = "meta";
    const who = role === "user" ? "You" : "Xeno";
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.textContent = `${who} • ${time}`;

    const content = document.createElement("div");
    content.className = "content";
    
    // Parse Markdown for Assistant messages only
    if (role === "assistant") {
        content.innerHTML = marked.parse(text);
        // Escape HTML to prevent injection
        content.innerHTML = content.innerHTML.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        content.innerHTML = marked.parse(text);
    } else {
        content.textContent = text;
    }

    el.appendChild(meta);
    el.appendChild(content);
    chatArea.appendChild(el);
    
    // Auto scroll to bottom
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
}

// === TYPING INDICATOR ===
let typingIndicator = null;

function showTyping() {
    typingIndicator = document.createElement("div");
    typingIndicator.className = "msg assistant";
    typingIndicator.innerHTML = `
        <div class="meta">Xeno is thinking...</div>
        <div class="content"><span class="typing-dots">●●●</span></div>
    `;
    chatArea.appendChild(typingIndicator);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function hideTyping() {
    if (typingIndicator) {
        typingIndicator.remove();
        typingIndicator = null;
    }
}

// === SETTINGS DRAWER ===
function openProfileDrawer() {
    profileDrawer.style.display = "flex";
    document.body.style.overflow = "hidden";
}

function closeProfileDrawer() {
    profileDrawer.style.display = "none";
    document.body.style.overflow = "auto";
}

btnProfile.addEventListener("click", openProfileDrawer);
btnCloseProfile.addEventListener("click", closeProfileDrawer);

// Close drawer on overlay click
drawerOverlay.addEventListener("click", (e) => {
    if (e.target === drawerOverlay) {
        closeProfileDrawer();
    }
});

// Close drawer on Escape key
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && profileDrawer.style.display === "flex") {
        closeProfileDrawer();
    }
});

// === CHAT SUBMISSION ===
chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const msg = messageInput.value.trim();
    if (!msg) return;

    // Add user message
    appendMessage("user", msg);
    messageInput.value = "";
    messageInput.focus();
    
    // Show typing indicator
    showTyping();

    try {
        const res = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        hideTyping();
        
        if (data.reply) {
            appendMessage("assistant", data.reply);
        } else {
            appendMessage("assistant", "No response received. Please try again.");
        }
        
        // Refresh lucide icons
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        hideTyping();
        console.error("Chat Error:", err);
        appendMessage("assistant", `⚠️ Error: Failed to connect to Xeno Core. ${err.message}`);
    }
});

// === ENGINE SELECTOR ===
const btnGroqMode = document.getElementById("btnGroqMode");
const btnLocalMode = document.getElementById("btnLocalMode");
const modeBadge = document.getElementById("modeBadge");

if (btnGroqMode) {
    btnGroqMode.addEventListener("click", () => {
        btnGroqMode.classList.add("active");
        btnLocalMode.classList.remove("active");
        modeBadge.textContent = "GROQ MODE";
    });
}

if (btnLocalMode) {
    btnLocalMode.addEventListener("click", () => {
        btnLocalMode.classList.add("active");
        btnGroqMode.classList.remove("active");
        modeBadge.textContent = "LOCAL MODE";
    });
}

// === CREATIVE MODE TOGGLE ===
const toggleCreative = document.getElementById("toggleCreative");
const modeBadgeIndicator = document.getElementById("modeBadge");

if (toggleCreative) {
    toggleCreative.addEventListener("change", () => {
        if (toggleCreative.checked) {
            modeBadgeIndicator.textContent = "CREATIVE MODE";
        } else {
            modeBadgeIndicator.textContent = "NORMAL";
        }
    });
}

// === THEME SELECTOR ===
const themeChips = document.querySelectorAll(".theme-chip");
themeChips.forEach(chip => {
    chip.addEventListener("click", (e) => {
        e.preventDefault();
        const theme = chip.dataset.t;
        document.body.dataset.theme = theme;
        localStorage.setItem("theme", theme);
        
        // Update active state
        themeChips.forEach(c => c.style.borderColor = "");
        chip.style.borderColor = "var(--accent-cyan)";
    });
});

// === PREFERENCES SAVING ===
const btnSavePrefs = document.getElementById("btnSavePrefs");
if (btnSavePrefs) {
    btnSavePrefs.addEventListener("click", () => {
        const name = document.getElementById("prefName").value;
        const style = document.getElementById("prefStyle").value;
        
        // Save to localStorage
        localStorage.setItem("userName", name);
        localStorage.setItem("responseStyle", style);
        
        closeProfileDrawer();
    });
}

// === VOICE INPUT ===
const btnMic = document.getElementById("btnMic");
if (btnMic) {
    btnMic.addEventListener("click", async () => {
        btnMic.style.opacity = "0.5";
        // Voice input implementation would go here
        setTimeout(() => { btnMic.style.opacity = "1"; }, 200);
    });
}

// === VOICE OUTPUT ===
const btnSpeak = document.getElementById("btnSpeak");
if (btnSpeak) {
    btnSpeak.addEventListener("click", () => {
        // Get last assistant message
        const messages = document.querySelectorAll(".msg.assistant");
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            const text = lastMsg.querySelector(".content").textContent;
            
            if ("speechSynthesis" in window) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = 0.95;
                speechSynthesis.speak(utterance);
            }
        }
    });
}

// === INITIALIZATION ===
window.addEventListener("load", () => {
    // Initialize Lucide icons
    if (window.lucide) lucide.createIcons();
    
    // Restore theme
    const savedTheme = localStorage.getItem("theme") || "quantum";
    document.body.dataset.theme = savedTheme;
    
    // Restore user preferences
    const savedName = localStorage.getItem("userName");
    const savedStyle = localStorage.getItem("responseStyle");
    
    if (savedName) document.getElementById("prefName").value = savedName;
    if (savedStyle) document.getElementById("prefStyle").value = savedStyle;
    
    // Focus on input
    messageInput.focus();
});

// === KEYBOARD SHORTCUTS ===
document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + K to focus input
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        messageInput.focus();
    }
});