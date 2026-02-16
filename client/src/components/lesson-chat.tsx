import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, X, Reply, User, Maximize2, Minimize2 } from "lucide-react";
import type { Socket } from "socket.io-client";

interface ChatMessage {
  id: string;
  name: string;
  message: string;
  role: "host" | "student";
  timestamp: number;
  replyTo?: { id: string; name: string; message: string } | null;
}

interface LessonChatProps {
  socket: Socket | null;
  isHost?: boolean;
  studentName?: string;
}

export default function LessonChat({ socket, isHost = false, studentName }: LessonChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [chatName, setChatName] = useState(studentName || "");
  const [nameSet, setNameSet] = useState(isHost || !!studentName);
  const [chatSize, setChatSize] = useState<"small" | "large">("small");
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isOpenRef = useRef(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardOffset(Math.max(0, offset));
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  useEffect(() => {
    if (studentName) {
      setChatName(studentName);
      setNameSet(true);
    }
  }, [studentName]);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      setUnreadCount(0);
      setTimeout(() => {
        if (nameSet) inputRef.current?.focus();
        else nameInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, nameSet]);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
      if (!isOpenRef.current) {
        setUnreadCount(prev => prev + 1);
      }
    };

    socket.on("lesson:chat-message", handleMessage);
    return () => {
      socket.off("lesson:chat-message", handleMessage);
    };
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(() => {
    if (!socket || !input.trim()) return;
    const payload: any = { message: input.trim() };
    if (!isHost && chatName.trim()) {
      payload.name = chatName.trim();
    }
    if (replyingTo) {
      payload.replyTo = {
        id: replyingTo.id,
        name: replyingTo.name,
        message: replyingTo.message.slice(0, 80),
      };
    }
    socket.emit("lesson:chat-send", payload);
    setInput("");
    setReplyingTo(null);
  }, [socket, input, replyingTo, isHost, chatName]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleNameSubmit = () => {
    if (chatName.trim().length >= 2) {
      setNameSet(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed right-0 z-[60] flex flex-col items-end" style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${keyboardOffset}px)`, maxWidth: chatSize === "large" ? "min(480px, calc(100vw - 16px))" : "min(340px, calc(100vw - 16px))" }}>
      {isOpen && (
        <div
          className={`${chatSize === "large" ? "w-[440px]" : "w-[300px]"} max-w-[calc(100vw-16px)] bg-background border border-border rounded-t-lg shadow-lg flex flex-col`}
          style={{ height: chatSize === "large" ? "min(480px, 70vh)" : "min(300px, 45vh)" }}
          data-testid="lesson-chat-panel"
        >
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b bg-muted/30 rounded-t-lg">
            <div className="flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold">Dars chati</span>
              <Badge variant="outline" className="text-[10px] px-1">{messages.length}</Badge>
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setChatSize(s => s === "small" ? "large" : "small")}
                data-testid="button-resize-chat"
              >
                {chatSize === "small" ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setIsOpen(false)} data-testid="button-close-chat">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {!nameSet && !isHost ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4" data-testid="chat-name-prompt">
              <User className="w-8 h-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground text-center">Chatda qatnashish uchun ismingizni kiriting</p>
              <Input
                ref={nameInputRef}
                value={chatName}
                onChange={(e) => setChatName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleNameSubmit(); }}
                placeholder="Ismingiz..."
                className="text-sm"
                maxLength={30}
                data-testid="input-chat-name"
              />
              <Button size="sm" onClick={handleNameSubmit} disabled={chatName.trim().length < 2} data-testid="button-set-chat-name">
                Davom etish
              </Button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-2.5 py-1.5 space-y-1.5 min-h-0" data-testid="chat-messages-container">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                    Hali xabar yo'q
                  </div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === "host" ? "items-end" : "items-start"}`}
                    data-testid={`chat-message-${msg.id}`}
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className={`text-[11px] font-medium ${msg.role === "host" ? "text-primary" : "text-muted-foreground"}`}>
                        {msg.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">{formatTime(msg.timestamp)}</span>
                      {isHost && msg.role === "student" && (
                        <button
                          onClick={() => { setReplyingTo(msg); inputRef.current?.focus(); }}
                          className="text-[10px] text-muted-foreground ml-0.5 hover-elevate rounded p-0.5"
                          data-testid={`button-reply-${msg.id}`}
                        >
                          <Reply className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {msg.replyTo && (
                      <div className="text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 mb-0.5 max-w-[85%] truncate border-l-2 border-primary/40">
                        {msg.replyTo.name}: {msg.replyTo.message}
                      </div>
                    )}
                    <div
                      className={`px-2 py-1 rounded-lg text-xs max-w-[85%] break-words ${
                        msg.role === "host"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {msg.message}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {replyingTo && (
                <div className="flex items-center gap-1 px-2.5 py-1 border-t bg-muted/20 text-[10px] text-muted-foreground">
                  <Reply className="w-3 h-3 text-primary shrink-0" />
                  <span className="truncate flex-1">{replyingTo.name}: {replyingTo.message.slice(0, 50)}</span>
                  <button onClick={() => setReplyingTo(null)} className="shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1 p-1.5 border-t">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={(e) => {
                    setTimeout(() => {
                      e.target.scrollIntoView({ behavior: "smooth", block: "center" });
                    }, 300);
                  }}
                  placeholder="Xabar yozing..."
                  className="flex-1 text-xs"
                  maxLength={500}
                  data-testid="input-chat-message"
                />
                <Button size="icon" onClick={sendMessage} disabled={!input.trim()} data-testid="button-send-chat">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {!isOpen && (
        <Button
          size="sm"
          onClick={() => setIsOpen(true)}
          className="m-2 rounded-full shadow-lg gap-1.5"
          data-testid="button-open-chat"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-xs">Chat</span>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-0.5 text-[10px] min-w-[18px] justify-center px-1">
              {unreadCount}
            </Badge>
          )}
        </Button>
      )}
    </div>
  );
}
