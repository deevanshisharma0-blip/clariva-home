"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Bot, User, Loader2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_URL } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AgentChatProps {
  bizId: number;
  agentId: string;
  agentName: string;
  agentIcon: string;
  onClose: () => void;
}

const STARTER_PROMPTS: Record<string, string[]> = {
  ceo: [
    "What's our business health today?",
    "What should I focus on this week?",
    "What are the biggest risks right now?",
  ],
  marketing: [
    "Create a Meta ad campaign for this weekend",
    "What's the best audience for our masks?",
    "Give me 5 ad hooks for LUMÈRA Prestige",
  ],
  product_research: [
    "Find 3 new trending LED skincare products",
    "How is our Spectrum mask performing?",
    "What products should we add next quarter?",
  ],
  finance: [
    "What's our profit margin this month?",
    "When will we break even?",
    "How much should I reinvest in ads?",
  ],
  content: [
    "Write a product description for Prestige",
    "Create 5 email subject lines for a sale",
    "Write a TikTok caption for our Aura mask",
  ],
  customer_support: [
    "How do I handle a refund request?",
    "Write a response to a late delivery complaint",
    "What are our most common customer questions?",
  ],
  analytics: [
    "What are our top-performing products?",
    "Which channel has the best ROAS?",
    "Show me our conversion funnel issues",
  ],
  compliance: [
    "Are our product claims compliant?",
    "What should I know about Canadian consumer law?",
    "Review our current ad copy for compliance issues",
  ],
};

const DEFAULT_STARTERS = [
  "What can you help me with?",
  "Give me your top recommendation today",
  "What's the most important thing I should know?",
];

export default function AgentChat({ bizId, agentId, agentName, agentIcon, onClose }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [intro, setIntro] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    // Greet the user
    setIntro(`Hi! I'm ${agentName}. How can I help you today?`);
  }, [agentName]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/agents/${bizId}/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          history: messages.slice(-10), // last 10 turns
        }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages([...newMessages, {
        role: "assistant",
        content: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [bizId, agentId, messages, loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const starters = STARTER_PROMPTS[agentId] ?? DEFAULT_STARTERS;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />

      {/* Chat Panel */}
      <div className="relative w-full sm:w-[420px] h-[90vh] sm:h-[600px] sm:mr-6 sm:mb-6 bg-surface border border-border rounded-2xl flex flex-col shadow-2xl pointer-events-auto animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border bg-card shrink-0">
          <div className="w-9 h-9 rounded-full bg-primary-dim flex items-center justify-center text-lg">
            {agentIcon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-text-primary truncate">{agentName}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse inline-block" />
              Online · AI powered
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-text-primary hover:bg-surface transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Intro bubble */}
          {intro && messages.length === 0 && (
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-primary-dim flex items-center justify-center text-sm shrink-0 mt-0.5">
                {agentIcon}
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[85%]">
                <p className="text-sm text-text-primary leading-relaxed">{intro}</p>
              </div>
            </div>
          )}

          {/* Starter prompts (only when no messages yet) */}
          {messages.length === 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-[11px] text-muted uppercase tracking-wider font-medium">Quick start</p>
              {starters.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="w-full text-left text-xs px-3.5 py-2.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary-dim transition-all text-text-secondary hover:text-text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Conversation */}
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex items-start gap-2.5", msg.role === "user" && "flex-row-reverse")}>
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                msg.role === "assistant" ? "bg-primary-dim text-sm" : "bg-surface border border-border"
              )}>
                {msg.role === "assistant" ? agentIcon : <User size={13} className="text-muted" />}
              </div>
              <div className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5",
                msg.role === "assistant"
                  ? "bg-card border border-border rounded-tl-sm"
                  : "bg-primary text-white rounded-tr-sm"
              )}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-primary-dim flex items-center justify-center text-sm shrink-0 mt-0.5">
                {agentIcon}
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border bg-card shrink-0">
          <div className="flex items-end gap-2 bg-surface rounded-xl border border-border focus-within:border-primary/50 transition-colors p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${agentName.split('—')[0].trim()}…`}
              rows={1}
              className="flex-1 bg-transparent resize-none text-sm text-text-primary placeholder:text-muted outline-none py-1 px-1 max-h-32 leading-relaxed"
              style={{ height: "auto" }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          <p className="text-[10px] text-muted text-center mt-1.5">Press Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}
