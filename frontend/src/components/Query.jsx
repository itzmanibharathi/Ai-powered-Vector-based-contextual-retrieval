import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import "./query.css";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { v4 as uuidv4 } from "uuid";

const COLORS = [
  "#0B1635",
  "#1F77B4",
  "#FF7F0E",
  "#2CA02C",
  "#D62728",
  "#9467BD",
  "#8C564B",
  "#E377C2",
];

const Query = () => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sessionId] = useState(uuidv4());

  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isAtTop, setIsAtTop] = useState(false);

  const chatRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);

  // ────────────────────── SPEECH RECOGNITION ──────────────────────
  useEffect(() => {
    if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SpeechRecognition();

      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      rec.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setQuery(transcript);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      rec.onerror = (event) => {
        console.error("Speech error:", event.error);
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  // ────────────────────── AUTO-SEND ONLY AFTER STOP BUTTON ──────────────────────
  useEffect(() => {
    if (!isRecording && query.trim() && recognitionRef.current?.wasStopped) {
      const timer = setTimeout(() => {
        handleSearch();
        recognitionRef.current.wasStopped = false;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isRecording, query]);

  // ────────────────────── VOICE CONTROL ──────────────────────
  const startRecording = () => {
    if (!recognitionRef.current) return;
    setQuery("");
    recognitionRef.current.wasStopped = false;
    recognitionRef.current.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
    recognitionRef.current.wasStopped = true;
    setIsRecording(false);
  };

  // ────────────────────── TEXT-TO-SPEECH CLEANUP ──────────────────────
  const cleanForSpeech = (text) => {
    let cleaned = text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/`(.*?)`/g, "$1")
      .replace(/[-*•#]/g, " ")
      .replace(/\//g, " or ")
      .replace(/\s+/g, " ")
      .trim();

    const optionPattern = /([A-E])\)\s*([^\/*]+)(?=\s*[A-E]\)|$)/gi;
    const starPattern = /\*\s*([^*]+)\s*\*/g;

    if (optionPattern.test(text) || starPattern.test(text)) {
      cleaned = cleaned.replace(optionPattern, "Option $1: $2");
      cleaned = cleaned.replace(starPattern, "Option: $1");
      cleaned = "Here are your options. " + cleaned;
    }

    return cleaned;
  };

  const speak = useCallback((text) => {
    if (!("speechSynthesis" in window)) return;

    const cleanText = cleanForSpeech(text);
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => setIsSpeaking(false);
    utteranceRef.current = utter;
    window.speechSynthesis.speak(utter);
  }, []);

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    utteranceRef.current = null;
  };

  // ────────────────────── DELETE MESSAGE (Prompt + Response) ──────────────────────
  const deleteMessage = (index) => {
    setMessages((prev) => {
      const newMessages = [...prev];
      // Remove the message and the next one if it's the assistant response
      newMessages.splice(index, 1);
      if (newMessages[index]?.role === "assistant") {
        newMessages.splice(index, 1);
      } else if (index > 0 && newMessages[index - 1]?.role === "assistant") {
        newMessages.splice(index - 1, 1);
      }
      return newMessages;
    });
  };

  // ────────────────────── SCROLL HELPERS ──────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtBottom(true);
    setIsAtTop(false);
  }, []);

  const scrollToTop = useCallback(() => {
    chatRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setIsAtTop(true);
    setIsAtBottom(false);
  }, []);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, []);

  useEffect(() => {
    if (isAtBottom) scrollToBottom();
  }, [messages, isAtBottom, scrollToBottom]);

  useEffect(() => adjustTextareaHeight(), [query, adjustTextareaHeight]);

  const handleScroll = useCallback(() => {
    if (!chatRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatRef.current;
    setIsAtBottom(scrollTop + clientHeight >= scrollHeight - 5);
    setIsAtTop(scrollTop <= 5);
  }, []);

  useEffect(() => {
    const el = chatRef.current;
    if (el) {
      el.addEventListener("scroll", handleScroll);
      return () => el.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  // ────────────────────── SEND MESSAGE ──────────────────────
  const handleSearch = async () => {
    if (!query.trim()) return;

    const userMsg = { role: "user", content: query };
    setMessages((prev) => [...prev, userMsg]);
    const q = query;
    setQuery("");
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("http://localhost:8000/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, history, session_id: sessionId }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const ans = data.answer;

      const assistantMsg = {
        role: "assistant",
        content: typeof ans === "string" ? ans : JSON.stringify(ans, null, 2),
        raw: ans,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: Could not fetch response." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setQuery("");
    scrollToBottom();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  // ────────────────────── RENDER HELPERS ──────────────────────
  const detectFormat = (data) => {
    try {
      const parsed = typeof data === "string" && data.startsWith("[") ? JSON.parse(data) : data;
      if (Array.isArray(parsed) && parsed[0]?.chart_type && parsed[0]?.chart_style && parsed[0]?.data) {
        return "chart";
      }
    } catch {}
    if (typeof data === "string" && data.includes("|")) return "table";
    return "text";
  };

  const parseAndRender = useCallback((rawContent) => {
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent, null, 2);
    const format = detectFormat(rawContent);
    let tableData = null;
    let notes = "";
    let chartData = [];

    if (format === "chart") {
      try {
        chartData = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
        if (
          !Array.isArray(chartData) ||
          !chartData.every(
            (c) => c.chart_type && c.chart_style && Array.isArray(c.data) && c.data.every((d) => d.label != null && d.value != null)
          )
        ) {
          throw new Error("Invalid chart format");
        }
      } catch {
        return <div className="text-box error">Error: Invalid chart data</div>;
      }
    } else if (format === "table") {
      const lines = content.split("\n");
      const tableLines = lines.filter((l) => l.trim().startsWith("|"));
      const noteLines = lines.filter((l) => !l.trim().startsWith("|"));
      notes = noteLines.join("\n");
      tableData = tableLines
        .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
        .filter((row) => row.some((cell) => cell));
    }

    return (
      <div className="message-content-wrapper">
        {notes && <div className="note-text">{notes}</div>}

        {tableData && tableData.length > 0 && (
          <div className="table-container">
            <table className="styled-table">
              <thead>
                <tr>
                  {tableData[0].map((header, i) => (
                    <th key={i}>{header || `Col ${i + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.slice(1).map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell || "-"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {chartData.length > 0 && (
          <div className="chart-grid">
            {chartData.map((chart, i) => (
              <div key={i} className="chart-card">
                <h4>{chart.chart_type} ({chart.chart_style})</h4>
                <ResponsiveContainer width="100%" height={400}>
                  {chart.chart_style === "bar" ? (
                    <BarChart data={chart.data} layout={chart.chart_type.includes("Horizontal") ? "vertical" : "horizontal"}>
                      <CartesianGrid strokeDasharray="3 3" />
                      {chart.chart_type.includes("Horizontal") ? (
                        <>
                          <XAxis type="number" />
                          <YAxis dataKey="label" type="category" />
                        </>
                      ) : (
                        <>
                          <XAxis dataKey="label" />
                          <YAxis />
                        </>
                      )}
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="value" fill="#0B1635" />
                    </BarChart>
                  ) : chart.chart_style === "line" ? (
                    <LineChart data={chart.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type={chart.chart_type.includes("smooth") ? "monotone" : "linear"}
                        dataKey="value"
                        stroke="#0B1635"
                        dot={chart.chart_type.includes("dotted")}
                      />
                    </LineChart>
                  ) : chart.chart_style === "pie" ? (
                    <PieChart>
                      <Pie
                        data={chart.data}
                        dataKey="value"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={120}
                        label
                      >
                        {chart.data.map((_, idx) => (
                          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  ) : (
                    <div className="text-box error">Unsupported style: {chart.chart_style}</div>
                  )}
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        )}

        {format === "text" && <div className="text-box">{content}</div>}
      </div>
    );
  }, []);

  // ────────────────────── JSX ──────────────────────
  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="chat-header">
        <h1>
          AI Document Chat <span className="subtitle">Ask questions about your documents</span>
        </h1>
        <div className="scroll-buttons">
          <button className="new-chat-btn" onClick={handleNewChat}>
            New Chat
          </button>
          {isAtBottom && !isAtTop && (
            <button className="scroll-btn scroll-to-top" onClick={scrollToTop}>
              Scroll to Top
            </button>
          )}
          {!isAtBottom && (
            <button className="scroll-btn scroll-to-bottom" onClick={scrollToBottom}>
              New Messages
            </button>
          )}
        </div>
      </header>

      {/* CHAT HISTORY */}
      <div ref={chatRef} className="chat-history">
        {messages.length === 0 && !loading && (
          <div className="welcome-message">
            <h3>Welcome to AI Document Chat!</h3>
            <p>Upload a document and start asking questions. Your conversation history is preserved.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-bubble">
              <div className="message-header">
                <strong>{msg.role === "user" ? "You" : "Assistant"}:</strong>
                {/* DELETE BUTTON */}
                <button
                  className="delete-btn"
                  onClick={() => deleteMessage(i)}
                  title="Delete this message and response"
                >
                  <img
                    src="https://cdn-icons-png.flaticon.com/128/1214/1214428.png"
                    alt="Delete"
                    className="delete-icon"
                  />
                </button>
              </div>

              {msg.role === "user" ? (
                <div className="user-content">{msg.content}</div>
              ) : (
                <div className="assistant-content">
                  {parseAndRender(msg.raw || msg.content)}

                  <button className="speak-btn" onClick={() => speak(msg.content)} title="Read aloud">
                    <img src="https://cdn-icons-png.flaticon.com/128/786/786353.png" alt="Speak" className="speak-icon" />
                  </button>

                  {isSpeaking && (
                    <button className="stop-speak-btn" onClick={stopSpeaking} title="Stop reading">
                      <img src="https://cdn-icons-png.flaticon.com/128/1828/1828746.png" alt="Stop" className="stop-icon" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message assistant">
            <div className="message-bubble">
              <strong>Assistant:</strong>
              <div className="loader-card">
                <div className="spinner"></div>
                <p>Analyzing your query...</p>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA */}
      <div className="input-area">
        <div className="input-content">
          {isRecording ? (
            <div className="waveform-container">
              <div className="waveform">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
              <p>Speak now…</p>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className="form-control"
              placeholder="Type or press mic to speak..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
              onKeyDown={handleKeyDown}
            />
          )}

          <button
            className={`mic-btn ${isRecording ? "recording" : ""}`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={loading}
            title={isRecording ? "Stop & Send" : "Speak"}
          >
            <img
              src={
                isRecording
                  ? "https://cdn-icons-png.flaticon.com/128/1828/1828746.png"
                  : "https://cdn-icons-png.flaticon.com/128/709/709602.png"
              }
              alt={isRecording ? "Stop" : "Mic"}
              className="mic-icon"
            />
          </button>

          <button
            className="btn-primary"
            onClick={handleSearch}
            disabled={loading || !query.trim() || isRecording}
          >
            <img src="https://cdn-icons-png.flaticon.com/128/9293/9293734.png" alt="Send" className="send-icon" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Query;