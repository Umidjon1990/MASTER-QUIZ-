import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, X } from "lucide-react";
import type { Socket } from "socket.io-client";

interface ChatMessage {
  id: string;
  name: string;
  message: string;
  role: "host" | "student";
  timestamp: number;
}

interface LessonChatProps {
  socket: Socket | null;
  isHost?: boolean;
}

export default function LessonChat({ socket, isHost = false }: LessonChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpenRef = useRef(false);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      setUnreadCount(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

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
    socket.emit("lesson:chat-send", { message: input.trim() });
    setInput("");
  }, [socket, input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed bottom-0 right-0 z-40 flex flex-col items-end" style={{ maxWidth: "min(400px, calc(100vw - 16px))" }}>
      {isOpen && (
        <div
          className="w-[360px] max-w-[calc(100vw-16px)] bg-background border border-border rounded-t-lg shadow-lg flex flex-col"
          style={{ height: "min(360px, 50vh)" }}
          data-testid="lesson-chat-panel"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30 rounded-t-lg">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Dars chati</span>
              <Badge variant="outline" className="text-xs">{messages.length}</Badge>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setIsOpen(false)} data-testid="button-close-chat">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0" data-testid="chat-messages-container">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
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
                  <span className={`text-xs font-medium ${msg.role === "host" ? "text-primary" : "text-muted-foreground"}`}>
                    {msg.name}
                  </span>
                  <span className="text-xs text-muted-foreground/60">{formatTime(msg.timestamp)}</span>
                </div>
                <div
                  className={`px-3 py-1.5 rounded-lg text-sm max-w-[85%] break-words ${
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

          <div className="flex items-center gap-1.5 p-2 border-t">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Xabar yozing..."
              className="flex-1 text-sm"
              maxLength={500}
              data-testid="input-chat-message"
            />
            <Button size="icon" onClick={sendMessage} disabled={!input.trim()} data-testid="button-send-chat">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="m-3 rounded-full shadow-lg gap-2"
          data-testid="button-open-chat"
        >
          <MessageCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Chat</span>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-0.5 text-xs min-w-[20px] justify-center">
              {unreadCount}
            </Badge>
          )}
        </Button>
      )}
    </div>
  );
}
