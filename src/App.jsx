import React, { useState, useEffect, useRef } from 'react';
import { Plus, Settings, Send, User, Paperclip, Trash2, X, FileText, Image, LayoutDashboard } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import MetricsView from './MetricsView';
import './index.css';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
const INPUT_COST_PER_TOKEN = 0.10 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 0.40 / 1_000_000;

function App() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('gemma_chat_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [sesssionId, setSessionId] = useState(() => {
    const saved = localStorage.getItem('gemma_session_id');
    if (saved) return saved;
    const newId = 'sess-' + Date.now();
    localStorage.setItem('gemma_session_id', newId);
    return newId;
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [view, setView] = useState('chat');
  const [metricsData, setMetricsData] = useState(() => {
    const saved = localStorage.getItem('gemma_metrics');
    return saved ? JSON.parse(saved) : [];
  });

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('gemma_chat_history', JSON.stringify(messages));
    localStorage.setItem('gemma_session_id', sesssionId);
  }, [messages, sesssionId]);

  useEffect(() => {
    localStorage.setItem('gemma_metrics', JSON.stringify(metricsData));
  }, [metricsData]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => { scrollToBottom(); }, [messages, isLoading]);

  useEffect(() => {
    if (!fileError) return;
    const t = setTimeout(() => setFileError(''), 3000);
    return () => clearTimeout(t);
  }, [fileError]);

  const handleInput = (e) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError('Only PDF and image files are allowed.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError('File must be smaller than 5 MB.');
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
    setFileError('');
    e.target.value = '';
  };

  const removeFile = () => setSelectedFile(null);

  const estimateTokens = (text) => Math.ceil((text || '').length / 4);

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    if (selectedFile && !trimmed) {
      setFileError('Please type a message along with your file.');
      return;
    }

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const newMessage = { role: 'user', content: trimmed };
    if (selectedFile) {
      if (isImageFile(selectedFile)) {
        try {
          const dataURL = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read image file'));
            reader.readAsDataURL(selectedFile);
          });
          newMessage.image = dataURL;
          newMessage.fileName = selectedFile.name;
        } catch (error) {
          console.error('Error reading image:', error);
          newMessage.content = `📎 ${selectedFile.name} (preview failed)\n\n${trimmed}`;
          newMessage.fileName = selectedFile.name;
        }
      } else {
        newMessage.content = `📎 ${selectedFile.name}\n\n${trimmed}`;
        newMessage.fileName = selectedFile.name;
      }
    }

    setMessages(prev => [...prev, newMessage]);
    setIsLoading(true);
    const startTime = Date.now();

    try {
      let data;

      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('mssg', trimmed);
        formData.append('session_id', sesssionId);

        const response = await fetch(`${API_BASE_URL}/chat-file`, {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) throw new Error('Failed to process file');
        data = await response.json();
      } else {
        const response = await fetch(`${API_BASE_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed, session_id: sesssionId }),
        });
        if (!response.ok) throw new Error('Failed to connect to Gemma E4B');
        data = await response.json();
      }

      const latencyMs = Date.now() - startTime;
      const pTok = data.usage?.prompt_tokens ?? data.prompt_tokens ?? data.input_tokens ?? estimateTokens(trimmed);
      const cTok = data.usage?.completion_tokens ?? data.completion_tokens ?? data.output_tokens ?? estimateTokens(data.response);
      setMetricsData(prev => [...prev, {
        id: `m-${Date.now()}`,
        timestamp: Date.now(),
        prompt_tokens: pTok,
        completion_tokens: cTok,
        total_tokens: pTok + cTok,
        latency_ms: latencyMs,
        cost_usd: pTok * INPUT_COST_PER_TOKEN + cTok * OUTPUT_COST_PER_TOKEN,
      }]);

      setMessages(prev => [...prev, { role: 'bot', content: data.response }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'system', content: 'Oops! ' + error.message }]);
    } finally {
      setIsLoading(false);
      setSelectedFile(null);
    }
  };

  const clearChat = () => {
    if (window.confirm('Are you sure you want to clear this conversation?')) {
      setMessages([]);
      setSessionId('sess-' + Date.now());
    }
  };

  const isImageFile = (file) => file?.type?.startsWith('image/');

  return (
    <div className="app-container">
      {/* ========== Sidebar ========== */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">G</div>
            <span>Gemma E4B</span>
          </div>
          <button
            className="new-chat-btn"
            onClick={() => {
              setMessages([]);
              setSelectedFile(null);
              setSessionId('sess-' + Date.now());
              setView('chat');
            }}
          >
            <Plus size={18} /> New Chat
          </button>
        </div>

        <div className="chat-history">
          <div
            className={`history-item ${view === 'chat' ? 'active' : ''}`}
            onClick={() => setView('chat')}
          >
            Current Conversation
          </div>
          {messages.length > 0 && (
            <button
              className="history-item delete-history"
              onClick={clearChat}
              style={{ marginTop: 'auto', border: 'none', background: 'none', color: '#ff7675', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Trash2 size={14} /> Clear History
            </button>
          )}
        </div>

        {/* ===== Dashboard nav — above footer ===== */}
        <button
          className={`dashboard-nav-btn ${view === 'metrics' ? 'active' : ''}`}
          onClick={() => setView('metrics')}
        >
          <LayoutDashboard size={15} />
          <span>Dashboard</span>
          {metricsData.length > 0 && (
            <span className="dashboard-nav-badge">{metricsData.length}</span>
          )}
        </button>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="avatar">U</div>
            <span>Guest User</span>
          </div>
          <div className="settings-icons">
            <Settings size={18} />
          </div>
        </div>
      </aside>

      {/* ========== Main Content ========== */}
      {view === 'metrics' ? (
        <MetricsView
          metrics={metricsData}
          onClearMetrics={() => setMetricsData([])}
        />
      ) : (
        <main className="main-chat">
          <header className="chat-header">
            <div className="header-title">
              <div className="header-title-icon">G</div>
              <h1>GEMMA E4B</h1>
            </div>
          </header>

          <div className="messages-container">
            {messages.length === 0 ? (
              <div className="message system-message">
                <div className="message-content">
                  <div className="bot-avatar">G</div>
                  <div className="text">
                    <h2>Hello! I'm Gemma E4B.</h2>
                    <p>Ask me anything or attach a PDF / image to get started.</p>
                    <div className="suggestions">
                      {['Compare these two ideas...', 'Write a story about a robot', 'Help me debug this React code'].map(s => (
                        <button key={s} className="suggestion-chip" onClick={() => setInput(s)}>{s}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`message ${m.role}-message`}>
                  <div className="message-content">
                    <div className={m.role === 'user' ? 'user-avatar' : 'bot-avatar'}>
                      {m.role === 'user' ? <User size={20} /> : 'G'}
                    </div>
                    <div className="text">
                      {m.image && (
                        <img
                          src={m.image}
                          alt={m.fileName || 'uploaded image'}
                          style={{
                            maxWidth: '100%',
                            height: 'auto',
                            borderRadius: '8px',
                            margin: '1rem 0',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                            display: 'block',
                          }}
                        />
                      )}
                      <ReactMarkdown components={{
                        img: ({ src, alt }) => (
                          <img
                            src={src}
                            alt={alt}
                            style={{
                              maxWidth: '240px',
                              maxHeight: '160px',
                              objectFit: 'cover',
                              borderRadius: '8px',
                              margin: '0.5rem 0',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                              display: 'block',
                            }}
                          />
                        ),
                      }}>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="message bot-message">
                <div className="message-content">
                  <div className="bot-avatar">G</div>
                  <div className="typing">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ========== Input Area ========== */}
          <footer className="input-area">
            <form onSubmit={handleSend} className="chat-input-container">
              {fileError && (
                <div className="file-error">
                  <span>{fileError}</span>
                  <button type="button" onClick={() => setFileError('')}><X size={14} /></button>
                </div>
              )}

              {selectedFile && (
                <div className="file-preview">
                  {isImageFile(selectedFile) ? <Image size={16} /> : <FileText size={16} />}
                  <span className="file-name">{selectedFile.name}</span>
                  <span className="file-size">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                  <button type="button" className="file-remove" onClick={removeFile}><X size={14} /></button>
                </div>
              )}

              <div className="input-wrapper">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInput}
                  placeholder="Message Gemma E4B..."
                  rows="1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                />
                <div className="input-actions">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className={`tool-btn ${selectedFile ? 'tool-btn-active' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach PDF or image (max 5 MB)"
                  >
                    <Paperclip size={18} />
                  </button>
                  <button type="submit" className="send-btn" disabled={!input.trim() || isLoading}>
                    <Send size={16} />
                  </button>
                </div>
              </div>
              <p className="disclaimer">Gemma E4B can make mistakes. Check important info.</p>
            </form>
          </footer>
        </main>
      )}
    </div>
  );
}

export default App;
