// Zenaries Frontend — Xeno features: memory-driven UI, creative mode flag, sentiment glow, typing dots, knowledge graph

// ---- Preferences (local) ----
const PREFS_KEY = "xeno_prefs";
const prefs = loadPrefs();

function loadPrefs(){
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || { name:"", style:"concise", theme:"quantum", creative:false }; }
  catch { return { name:"", style:"concise", theme:"quantum", creative:false }; }
}
function savePrefs(){
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  applyTheme();
  updateModeBadge();
}

// Apply theme
function applyTheme(){
  document.body.setAttribute("data-theme", prefs.theme || "quantum");
}

// Update mode badge
function updateModeBadge(){
  const badge = document.getElementById("modeBadge");
  badge.textContent = prefs.creative ? "Creative" : "Normal";
}

// ---- Elements ----
const chatArea = document.getElementById("chatArea");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const btnSpeak = document.getElementById("btnSpeak");
const btnMic = document.getElementById("btnMic");
const toggleCreative = document.getElementById("toggleCreative");
const btnProfile = document.getElementById("btnProfile");
const profileDrawer = document.getElementById("profileDrawer");
const btnCloseProfile = document.getElementById("btnCloseProfile");
const prefName = document.getElementById("prefName");
const prefStyle = document.getElementById("prefStyle");
const prefTheme = document.getElementById("prefTheme");
const btnSavePrefs = document.getElementById("btnSavePrefs");
const btnGroqMode = document.getElementById("btnGroqMode");
const btnLocalMode = document.getElementById("btnLocalMode");

const btnRefreshGraph = document.getElementById("btnRefreshGraph");
const graphPanel = document.getElementById("graphPanel");
let currentAiMode = "groq";

// Init UI with prefs
applyTheme();
updateModeBadge();
toggleCreative.checked = !!prefs.creative;
prefName.value = prefs.name || "";
prefStyle.value = prefs.style || "concise";
prefTheme.value = prefs.theme || "quantum";
updateAiModeButtons();

// ---- Sentiment heuristic (lightweight) ----
function inferSentiment(text){
  const t = text.toLowerCase();
  const pos = ["great","awesome","nice","love","cool","thanks","perfect","good","yes"];
  const neg = ["bad","hate","angry","annoyed","wtf","no","broken","sad","error","issue","problem"];
  const score = pos.reduce((s,w)=>s+(t.includes(w)?1:0),0) - neg.reduce((s,w)=>s+(t.includes(w)?1:0),0);
  if (score > 0) return "happy";
  if (score < 0) return "sad";
  return "neutral";
}

// ---- Typing indicator ----
let typingEl = null;
function showTyping(){
  if (typingEl) return;
  typingEl = document.createElement("div");
  typingEl.className = "typing";
  typingEl.innerHTML = `<div class="dots"><span></span><span></span><span></span></div>`;
  chatArea.appendChild(typingEl);
  chatArea.scrollTop = chatArea.scrollHeight;
}
function hideTyping(){
  if (!typingEl) return;
  typingEl.remove();
  typingEl = null;
}

// ---- Text-to-Speech ----
function speak(text) {
  if ('speechSynthesis' in window) {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 1.15;   // Slightly faster
    utter.pitch = 1.4;   // Higher pitch for a teen-like voice
    // Optionally, pick a youthful voice if available
    const voices = window.speechSynthesis.getVoices();
    const teenVoice = voices.find(v => v.name.includes("Google US English") || v.name.includes("Microsoft Aria Online"));
    if (teenVoice) utter.voice = teenVoice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }
}

// ---- Append message ----
function appendMessage(role, text, mood=null){
  const el = document.createElement("div");
  el.className = `msg ${role} ${mood?mood:""}`;

  const meta = document.createElement("div");
  meta.className = "meta";
  const who = role === "user" ? (prefs.name || "You") : "Xeno";
  meta.textContent = `${who} • ${new Date().toLocaleTimeString()}`;

  const content = document.createElement("div");
  content.className = "content";
  content.textContent = text;

  el.appendChild(meta);
  el.appendChild(content);

  // Add speak button for assistant messages
  if (role === "assistant") {
    const speakBtn = document.createElement("button");
    speakBtn.textContent = "🔊";
    speakBtn.className = "ghost";
    speakBtn.style.marginLeft = "8px";
    speakBtn.title = "Speak";
    speakBtn.onclick = () => speak(text);
    el.appendChild(speakBtn);
  }

  chatArea.appendChild(el);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// ---- Load history ----
async function loadHistory(){
  try{
    const res = await fetch("/history");
    const data = await res.json(); // [{role, message, timestamp}, ...]
    chatArea.innerHTML = "";
    data.forEach(row=>{
      const mood = inferSentiment(row.message);
      appendMessage(row.role === "assistant" ? "assistant" : "user", row.message, mood);
    });
  }catch(e){
    appendMessage("assistant","(Couldn’t load history right now.)");
  }
}

// ---- AI Mode ----
function updateAiModeButtons(){
  btnGroqMode.classList.toggle("active", currentAiMode === "groq");
  btnLocalMode.classList.toggle("active", currentAiMode === "local");
}

async function switchAiMode(mode){
  currentAiMode = mode;
  updateAiModeButtons();

  try{
    const resp = await fetch("/switch-mode", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ mode })
    });
    const data = await resp.json();
    currentAiMode = data.mode || mode;
    updateAiModeButtons();
  }catch(err){
    appendMessage("assistant", "Couldn't switch AI mode right now.");
  }
}

btnGroqMode.addEventListener("click", ()=> switchAiMode("groq"));
btnLocalMode.addEventListener("click", ()=> switchAiMode("local"));

// ---- Voice Input ----
btnMic.addEventListener("click", async ()=>{
  btnMic.disabled = true;
  btnMic.classList.add("listening");

  try{
    const resp = await fetch("/listen", {
      method:"POST",
      headers:{ "Content-Type":"application/json" }
    });
    const data = await resp.json();
    if (data.text){
      messageInput.value = data.text;
      messageInput.focus();
    }
  }catch(err){
    appendMessage("assistant", "Couldn't hear anything.");
  }finally{
    btnMic.disabled = false;
    btnMic.classList.remove("listening");
  }
});

btnSpeak.addEventListener("click", ()=>{
  const lastAssistant = Array.from(chatArea.querySelectorAll(".msg.assistant .content")).pop();
  if (lastAssistant && lastAssistant.textContent.trim()) {
    speak(lastAssistant.textContent.trim());
  } else {
    appendMessage("assistant", "Nothing to speak yet.");
  }
});

// ---- Send message ----
chatForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const raw = messageInput.value.trim();
  if (!raw) return;

  const userMsg = raw;
  const sentiment = inferSentiment(userMsg);
  appendMessage("user", userMsg, sentiment);
  messageInput.value = "";

  showTyping();

  try{
    const payload = { message: userMsg };

    const resp = await fetch("/chat", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    const j = await resp.json();

    hideTyping();
    const aiText = j.reply || "(No reply)";
    const aiMood = inferSentiment(aiText);
    appendMessage("assistant", aiText, aiMood);

    // Update knowledge graph with detected topics
    updateGraphFromText(userMsg + " " + aiText);

  }catch(err){
    hideTyping();
    appendMessage("assistant", "⚠️ Error contacting server.");
  }
});

// ---- Profile Drawer ----
btnProfile.addEventListener("click", ()=> profileDrawer.classList.add("open"));
btnCloseProfile.addEventListener("click", ()=> profileDrawer.classList.remove("open"));
btnSavePrefs.addEventListener("click", ()=>{
  prefs.name = prefName.value.trim();
  prefs.style = prefStyle.value;
  prefs.theme = prefTheme.value;
  savePrefs();
  profileDrawer.classList.remove("open");
});

// Creative Mode toggle
toggleCreative.addEventListener("change", ()=>{
  prefs.creative = toggleCreative.checked;
  savePrefs();
});

// ---- Graph Panel ----
btnRefreshGraph.addEventListener("click", ()=> rebuildGraphFromHistory());

// ---- Knowledge Graph (Cytoscape) ----
let cy = null;
function ensureGraph(){
  if (cy) return cy;
  cy = cytoscape({
    container: document.getElementById("graph"),
    style: [
      { selector: "node",
        style:{
          "background-color": "data(color)",
          "label": "data(label)",
          "color": "#cfe8ff",
          "font-size": 10,
          "text-outline-color":"#09111a",
          "text-outline-width":1
        }
      },
      { selector: "edge",
        style:{
          "width": 2,
          "line-color": "data(color)",
          "opacity": .8,
          "curve-style":"unbundled-bezier"
        }
      },
      { selector: ":selected", style:{ "border-width":2, "border-color":"#fff" } }
    ],
    layout: { name:"cose", animate:true, padding: 20 }
  });
  return cy;
}

const topicPalette = {
  "ai":"#00e6ff", "neuroscience":"#9b7cff", "astrophysics":"#ff3b88",
  "math":"#3cf0a5","code":"#ffd166","ethics":"#ff5c7a","data":"#7be0ff"
};

function extractTopics(text){
  const T = text.toLowerCase();
  const topics = [];
  const keys = Object.keys(topicPalette);
  keys.forEach(k => { if (T.includes(k)) topics.push(k); });
  // Some synonyms
  if (/(ml|machine learning|deep learning)/.test(T)) topics.push("ai");
  if (/(brain|cortex|neuron|neural)/.test(T)) topics.push("neuroscience");
  if (/(space|galaxy|cosmos|universe|black hole)/.test(T)) topics.push("astrophysics");
  if (/(algorithm|python|javascript|flask|api)/.test(T)) topics.push("code");
  if (/(data|dataset|database|sql)/.test(T)) topics.push("data");
  if (/(proof|theorem|calculus|algebra)/.test(T)) topics.push("math");
  if (/(ethic|bias|safety|alignment)/.test(T)) topics.push("ethics");
  return [...new Set(topics)];
}

function updateGraphFromText(text){
  const topics = extractTopics(text);
  if (!topics.length) return;

  const g = ensureGraph();
  // root node (session)
  if (!g.getElementById("session").length){
    g.add({ group:"nodes", data:{ id:"session", label:"Session", color:"#7a8faa" }});
  }

  topics.forEach(t=>{
    const id = `t:${t}`;
    if (!g.getElementById(id).length){
      g.add({ group:"nodes", data:{ id, label:t.toUpperCase(), color: topicPalette[t] || "#59f"}});
      g.add({ group:"edges", data:{ id:`e:session:${t}`, source:"session", target:id, color: topicPalette[t] || "#59f" }});
    }else{
      // slight visual nudge on revisit
      g.getElementById(id).animate({ style:{ "background-color": topicPalette[t] }}, { duration: 300 });
    }
  });

  g.layout({ name:"cose", animate:true }).run();
}

async function rebuildGraphFromHistory(){
  const g = ensureGraph();
  g.elements().remove();
  updateGraphFromText("session");
  try{
    const res = await fetch("/history");
    const rows = await res.json();
    rows.forEach(r => updateGraphFromText(r.message || ""));
  }catch{}
}

// ---- Boot ----
loadHistory();
rebuildGraphFromHistory();
