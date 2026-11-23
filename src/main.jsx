
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  Bot, Plus, Send, Sun, Moon, Menu, X, Sparkles,
  MessageSquare, Trash2, Globe2, LogOut
} from "lucide-react";
import "../styles.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// Keep your existing backend address.
const API_URL = "https://manish-ai.onrender.com";

const WELCOME =
  "Hi! I'm AETHERON AI. 👋 Ask me anything, and let's figure it out together!";

const starterPrompts = [
  { icon: "✦", title: "Explain a concept", text: "Explain a difficult science concept in simple words." },
  { icon: "⌘", title: "Help me code", text: "Teach me the basics of Python with a small example." },
  { icon: "∑", title: "Solve a problem", text: "Help me solve a maths problem step by step." },
  { icon: "文", title: "Speak Tamil", text: "வணக்கம்! உங்களைப் பற்றி அறிமுகப்படுத்துங்கள்." }
];

function newChat() {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [{ role: "assistant", content: WELCOME }]
  };
}

// Render Markdown and mathematical equations.
function FormattedMessage({ content }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {content || ""}
    </ReactMarkdown>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [chats, setChats] = useState([newChat()]);
  const [activeId, setActiveId] = useState(null);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  const activeChat = chats.find(c => c.id === activeId) || chats[0];

  // Keep the old storage key so existing conversations remain available.
  const storageKey = user ? `manish-chats-${user.id}` : null;

  // Check the existing Supabase login session.
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthNotice(error.message);
      setSession(data?.session || null);
      setUser(data?.session?.user || null);
      setAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user || null);
      }
    );

    return () => data.subscription.unsubscribe();
  }, []);

  // Keep each account's chat history separate.
  useEffect(() => {
    if (!user || !storageKey) {
      setChatsLoaded(false);
      return;
    }

    setChatsLoaded(false);

    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      const loaded = Array.isArray(saved) && saved.length
        ? saved
        : [newChat()];

      setChats(loaded);
      setActiveId(loaded[0].id);
    } catch {
      const chat = newChat();
      setChats([chat]);
      setActiveId(chat.id);
    }

    setChatsLoaded(true);
  }, [user?.id]);

  useEffect(() => {
    if (user && storageKey && chatsLoaded) {
      localStorage.setItem(storageKey, JSON.stringify(chats));
    }
  }, [chats, user?.id, chatsLoaded]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages, loading]);

  async function handleAuth(event) {
    event.preventDefault();

    if (!supabase) {
      setAuthNotice("Supabase settings are missing. Check your GitHub Actions variables.");
      return;
    }

    setAuthBusy(true);
    setAuthNotice("");

    try {
      if (authMode === "signup") {
        if (!authName.trim()) {
          throw new Error("Please enter your name.");
        }

        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: {
            data: { full_name: authName.trim() }
          }
        });

        if (error) throw error;

        if (data.session) {
          setSession(data.session);
          setUser(data.user);
        } else {
          setAuthNotice("Account created! Please check your email and confirm your address, then log in.");
          setAuthMode("login");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword
        });

        if (error) throw error;

        setSession(data.session);
        setUser(data.user);
        setAuthNotice("");
      }
    } catch (error) {
      setAuthNotice(error.message || "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();

    if (error) {
      setNotice(error.message);
      return;
    }

    setUser(null);
    setSession(null);
    setChats([newChat()]);
    setActiveId(null);
    setInput("");
    setNotice("");
    setAuthNotice("You have signed out.");
  }

  function updateChat(id, updater) {
    setChats(prev => prev.map(c => c.id === id ? updater(c) : c));
  }

  function startNewChat() {
    const chat = newChat();
    setChats(prev => [chat, ...prev]);
    setActiveId(chat.id);
    setInput("");
    setSidebarOpen(false);
    setNotice("");
  }

  function removeChat(id, event) {
    event.stopPropagation();

    const remaining = chats.filter(c => c.id !== id);
    const next = remaining.length ? remaining : [newChat()];

    setChats(next);

    if (activeId === id) {
      setActiveId(next[0].id);
    }
  }

  async function sendMessage(value = input) {
    const content = value.trim();

    if (!content || loading || !activeChat || !session?.access_token) {
      return;
    }

    setInput("");
    setNotice("");

    const id = activeChat.id;
    const nextMessages = [
      ...activeChat.messages,
      { role: "user", content }
    ];

    updateChat(id, c => ({
      ...c,
      title: c.messages.length <= 1 ? content.slice(0, 32) : c.title,
      messages: nextMessages
    }));

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          messages: nextMessages
            .filter(m =>
              m.role === "user" ||
              (m.role === "assistant" && m.content !== WELCOME)
            )
            .slice(-30)
        })
      });

      const data = await response.json();

      if (response.status === 401) {
        throw new Error("Your login session may have expired. Please log in again.");
      }

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      updateChat(id, c => ({
        ...c,
        messages: [
          ...c.messages,
          { role: "assistant", content: data.reply }
        ]
      }));
    } catch (error) {
      setNotice(error.message || "Could not connect to AETHERON AI.");
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  const displayName =
    user?.user_metadata?.full_name ||
    user?.email ||
    "AETHERON AI user";

  if (authLoading) {
    return (
      <div className="app dark" style={centerStyle}>
        <Bot size={38} />
        <p>Loading AETHERON AI...</p>
      </div>
    );
  }

  // Login and signup screen.
  if (!user) {
    return (
      <div className="app dark" style={authPageStyle}>
        <div style={authCardStyle}>
          <div style={authLogoStyle}>
            <Bot size={30} />
          </div>

          <h1 style={{ marginBottom: 6 }}>
            AETHERON <span style={{ color: "#a78bfa" }}>AI</span>
          </h1>

          <p style={{ color: "#a1a1aa", marginTop: 0 }}>
            Intelligence Beyond Limits
          </p>

          <h2 style={{ marginTop: 28 }}>
            {authMode === "signup" ? "Create your account" : "Welcome back"}
          </h2>

          <p style={{ color: "#a1a1aa", fontSize: 14 }}>
            {authMode === "signup"
              ? "Sign up to start using AETHERON AI."
              : "Log in to continue your conversations."}
          </p>

          <form onSubmit={handleAuth}>
            {authMode === "signup" && (
              <input
                style={authInputStyle}
                type="text"
                placeholder="Your name"
                value={authName}
                onChange={e => setAuthName(e.target.value)}
                required
              />
            )}

            <input
              style={authInputStyle}
              type="email"
              placeholder="Email address"
              value={authEmail}
              onChange={e => setAuthEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <input
              style={authInputStyle}
              type="password"
              placeholder="Password (at least 6 characters)"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              autoComplete={authMode === "signup" ? "new-password" : "current-password"}
              minLength={6}
              required
            />

            <button
              type="submit"
              disabled={authBusy}
              style={authButtonStyle}
            >
              {authBusy
                ? "Please wait..."
                : authMode === "signup"
                  ? "Create account"
                  : "Log in"}
            </button>
          </form>

          {authNotice && (
            <p style={authNoticeStyle}>{authNotice}</p>
          )}

          <p style={{ color: "#a1a1aa", fontSize: 14, marginTop: 22 }}>
            {authMode === "signup"
              ? "Already have an account? "
              : "Don't have an account? "}

            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === "signup" ? "login" : "signup");
                setAuthNotice("");
              }}
              style={switchButtonStyle}
            >
              {authMode === "signup" ? "Log in" : "Sign up"}
            </button>
          </p>

          <p style={{ color: "#71717a", fontSize: 12, marginTop: 24 }}>
            Your account is protected by Supabase authentication.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${dark ? "dark" : "light"}`}>
      {sidebarOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-icon"><Bot size={21} /></div>
          <div>
            <div className="brand-name">AETHERON <span>AI</span></div>
            <div className="brand-caption">Intelligence Beyond Limits</div>
          </div>
          <button
            className="icon-btn mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <button className="new-chat" onClick={startNewChat}>
          <Plus size={17} /> New chat <span>⌘ K</span>
        </button>

        <div className="side-label">RECENT CHATS</div>

        <div className="chat-list">
          {chats.map(chat => (
            <button
              key={chat.id}
              className={`history-item ${chat.id === activeId ? "selected" : ""}`}
              onClick={() => {
                setActiveId(chat.id);
                setSidebarOpen(false);
              }}
            >
              <MessageSquare size={16} />
              <span>{chat.title}</span>
              <span
                className="delete-chat"
                role="button"
                tabIndex={0}
                aria-label="Delete chat"
                onClick={e => removeChat(chat.id, e)}
                onKeyDown={e => {
                  if (e.key === "Enter") removeChat(chat.id, e);
                }}
              >
                <Trash2 size={14} />
              </span>
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="profile-avatar">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="profile-info">
            <strong>{displayName}</strong>
            <span>Signed in</span>
          </div>
          <button
            className="icon-btn"
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="top-left">
            <button
              className="icon-btn menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>

            <div className="mobile-brand">
              <div className="brand-icon"><Bot size={18} /></div>
              <strong>AETHERON <span>AI</span></strong>
            </div>

            <div className="model-chip">
              <span className="status-dot" />
              AETHERON Assistant
              <span className="chip-chevron">▾</span>
            </div>
          </div>

          <div className="top-actions">
            <div className="language-chip">
              <Globe2 size={14} /> English / தமிழ்
            </div>

            <button
              className="icon-btn theme-btn"
              onClick={() => setDark(v => !v)}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <section className={`conversation ${activeChat?.messages.length <= 1 ? "welcome-view" : ""}`}>
          {activeChat?.messages.length <= 1 ? (
            <div className="welcome">
              <div className="hero-icon">
                <Bot size={34} />
                <span className="hero-spark">✦</span>
              </div>

              <div className="eyebrow">
                <span /> YOUR EVERYDAY AI COMPANION
              </div>

              <h1>
                Hey there! What’s on<br className="desktop-break" />
                your <span>mind today?</span>
              </h1>

              <p className="welcome-sub">{WELCOME}</p>

              <div className="starter-grid">
                {starterPrompts.map(item => (
                  <button
                    key={item.title}
                    className="starter-card"
                    onClick={() => sendMessage(item.text)}
                  >
                    <span className="starter-icon">{item.icon}</span>
                    <span className="starter-title">{item.title}</span>
                    <span className="starter-text">{item.text}</span>
                    <span className="starter-arrow">↗</span>
                  </button>
                ))}
              </div>

              <div className="welcome-foot">
                <Sparkles size={14} /> Curious minds welcome. Big questions too.
              </div>
            </div>
          ) : (
            <div className="messages">
              {activeChat?.messages.map((message, index) => (
                <div key={index} className={`message-row ${message.role}`}>
                  {message.role === "assistant" && (
                    <div className="message-avatar"><Bot size={17} /></div>
                  )}

                  <div className="message-content">
                    <div className="message-author">
                      {message.role === "assistant" ? "AETHERON AI" : "You"}
                    </div>
                    <div className="message-bubble">
                      <FormattedMessage content={message.content} />
                    </div>
                  </div>

                  {message.role === "user" && (
                    <div className="user-avatar">Y</div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="message-row assistant">
                  <div className="message-avatar"><Bot size={17} /></div>
                  <div className="message-content">
                    <div className="message-author">AETHERON AI</div>
                    <div className="typing">
                      <i /><i /><i /><span>Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <div className="composer-wrap">
          {notice && <div className="error-notice">{notice}</div>}

          <form
            className="composer"
            onSubmit={e => {
              e.preventDefault();
              sendMessage();
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Message AETHERON..."
              rows={1}
              aria-label="Message AETHERON AI"
            />

            <div className="composer-bottom">
              <span>
                <kbd>↵</kbd> send <span className="composer-sep">·</span>
                <kbd>⇧ ↵</kbd> new line
              </span>

              <button
                className="send-btn"
                type="submit"
                disabled={!input.trim() || loading}
                aria-label="Send message"
              >
                <Send size={17} />
              </button>
            </div>
          </form>

          <div className="disclaimer">
            AETHERON AI can make mistakes. Double-check important information.
          </div>
        </div>
      </main>
    </div>
  );
}

const centerStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  gap: 12
};

const authPageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "#09090f",
  color: "#fff"
};

const authCardStyle = {
  width: "100%",
  maxWidth: 410,
  padding: 30,
  borderRadius: 20,
  background: "#171722",
  border: "1px solid #303044",
  textAlign: "center",
  boxSizing: "border-box"
};

const authLogoStyle = {
  width: 58,
  height: 58,
  margin: "0 auto 16px",
  borderRadius: 18,
  background: "#7555d9",
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};

const authInputStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: "14px 15px",
  marginTop: 13,
  borderRadius: 10,
  border: "1px solid #414155",
  background: "#10101a",
  color: "#fff",
  fontSize: 15,
  outline: "none"
};

const authButtonStyle = {
  width: "100%",
  padding: 14,
  marginTop: 18,
  border: "none",
  borderRadius: 10,
  background: "#8060e8",
  color: "#fff",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer"
};

const authNoticeStyle = {
  padding: 12,
  borderRadius: 9,
  background: "#29243b",
  color: "#ddd0ff",
  fontSize: 13,
  lineHeight: 1.5
};

const switchButtonStyle = {
  border: "none",
  background: "transparent",
  color: "#b49aff",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 14
};

createRoot(document.getElementById("root")).render(<App />);
