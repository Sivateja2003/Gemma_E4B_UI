import React, { useState, useEffect, useRef } from 'react';
import { Plus, Settings, Send, User, Paperclip, Trash2, X, FileText, Image, Compass, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './index.css';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

function App() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  // ---------- state ----------
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

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // ---------- persistence ----------
  useEffect(() => {
    localStorage.setItem('gemma_chat_history', 
    JSON.stringify(messages));
    localStorage.setItem('gemma_session_id', sesssionId);
  }, [messages, sesssionId]);

  // ---------- auto-scroll ----------
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => { scrollToBottom(); }, [messages, isLoading]);

  // ---------- dismiss file error after 3s ----------
  useEffect(() => {
    if (!fileError) return;
    const t = setTimeout(() => setFileError(''), 3000);
    return () => clearTimeout(t);
  }, [fileError]);

  // ---------- textarea auto-resize ----------
  const handleInput = (e) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  // ---------- file selection ----------
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
    e.target.value = ''; // allow re-selecting same file
  };

  const removeFile = () => setSelectedFile(null);

  // ---------- send ----------
  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = input.trim();

    // Message is mandatory for both text-only and file uploads
    if (!trimmed || isLoading) return;

    // If there's a file but no message, show error
    if (selectedFile && !trimmed) {
      setFileError('Please type a message along with your file.');
      return;
    }

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Build user message payload
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

    try {
      let data;

      if (selectedFile) {
        // ---------- /chat-file (multipart) ----------
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
        // ---------- /chat (JSON) ----------
        const response = await fetch(`${API_BASE_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed,session_id: sesssionId}),
        });
        if (!response.ok) throw new Error('Failed to connect to Gemma E4B');
        data = await response.json();
      }

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

  // ---------- helpers ----------
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
          <button className="new-chat-btn" onClick={() => { setMessages([]); setSelectedFile(null); setSessionId('sess-' + Date.now()); }}>            <Plus size={18} /> New Chat
          </button>
        </div>

        <div className="chat-history">
          <div className="history-item active">Current Conversation</div>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {messages.length > 0 && (
              <button
                className="history-item delete-history"
                onClick={clearChat}
                style={{ border: 'none', background: 'none', color: '#ff7675', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}
              >
                <Trash2 size={14} /> Clear History
              </button>
            )}
            <a
              href="https://tokenlens.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="history-item tokenlens-link"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Compass size={14} />
                <span>TokenLens</span>
              </div>
              <ExternalLink size={12} style={{ opacity: 0.5 }} />
            </a>
          </div>
        </div>

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

      {/* ========== Main Chat ========== */}
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
                          display: 'block'
                        }}
                      />
                    )}
                    <ReactMarkdown components={{
                      img: ({src, alt}) => (
                        <img
                          src={src}
                          alt={alt}
                          /* was: maxWidth: '100%', height: 'auto' */
                          style={{
                            maxWidth: '240px',
                            maxHeight: '160px',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            margin: '0.5rem 0',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                            display: 'block'
                          }}
                        />
                      )
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
            {/* File Error Toast */}
            {fileError && (
              <div className="file-error">
                <span>{fileError}</span>
                <button type="button" onClick={() => setFileError('')}><X size={14} /></button>
              </div>
            )}

            {/* File Preview Chip */}
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
                {/* Hidden file input */}
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
    </div>
  );
}

export default App;
