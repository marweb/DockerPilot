import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';

interface ContainerExecProps {
  containerId: string;
}

interface ExecMessage {
  type: 'output' | 'error' | 'status';
  data: string;
  timestamp: number;
}

export default function ContainerExec({ containerId }: ContainerExecProps) {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { token } = useAuthStore();

  const [messages, setMessages] = useState<ExecMessage[]>([]);
  const [command, setCommand] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Connect to WebSocket
  useEffect(() => {
    const query = new URLSearchParams({
      cmd: '/bin/sh',
      ...(token ? { token } : {}),
    });
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/containers/${containerId}/exec?${query.toString()}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      addMessage('status', t('containers.exec.connected'));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'output') {
        addMessage('output', data.data);
      } else if (data.type === 'error') {
        addMessage('error', data.error || data.data || t('containers.exec.error'));
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      addMessage('status', t('containers.exec.disconnected'));
    };

    ws.onerror = () => {
      setIsConnected(false);
      addMessage('error', t('containers.exec.error'));
    };

    return () => {
      ws.close();
    };
  }, [containerId, token, t]);

  const addMessage = useCallback((type: ExecMessage['type'], data: string) => {
    setMessages((prev) => [...prev, { type, data, timestamp: Date.now() }]);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendCommand = () => {
    if (!command.trim() || !isConnected) return;

    const trimmedCommand = command.trim();

    // Add to history
    setCommandHistory((prev) => {
      const newHistory = [trimmedCommand, ...prev].slice(0, 50);
      return newHistory;
    });
    setHistoryIndex(-1);

    // Show command in terminal
    addMessage('status', `$ ${trimmedCommand}`);

    // Send to WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'exec',
          data: `${trimmedCommand}\n`,
        })
      );
    }

    setCommand('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommand(commandHistory[newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand('');
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clearTerminal();
    }
  };

  const clearTerminal = () => {
    setMessages([]);
  };

  const getMessageClass = (type: ExecMessage['type']) => {
    switch (type) {
      case 'output':
        return 'text-gray-300';
      case 'error':
        return 'text-red-400';
      case 'status':
        return 'text-yellow-400';
      default:
        return 'text-gray-300';
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('containers.exec.title')}
            </h3>
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
            />
          </div>
          <button
            onClick={clearTerminal}
            className="btn btn-secondary btn-sm"
            title={t('containers.exec.clear')}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            {t('containers.exec.clear')}
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('containers.exec.description')}
        </p>
      </div>

      <div className="card-body p-0">
        {/* Terminal */}
        <div className="bg-gray-900 rounded-b-lg">
          <div
            ref={terminalRef}
            className="p-4 font-mono text-sm overflow-auto"
            style={{ maxHeight: '500px', minHeight: '400px' }}
            onClick={() => inputRef.current?.focus()}
          >
            {messages.length === 0 ? (
              <p className="text-gray-500 italic">{t('containers.exec.welcome')}</p>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`${getMessageClass(msg.type)} whitespace-pre-wrap break-all py-0.5`}
                >
                  {msg.data}
                </div>
              ))
            )}
          </div>

          {/* Command Input */}
          <div className="flex items-center gap-2 p-3 bg-gray-800 border-t border-gray-700">
            <span className="text-green-400 font-mono text-sm select-none">$</span>
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('containers.exec.placeholder')}
              disabled={!isConnected}
              className="flex-1 bg-transparent text-gray-100 font-mono text-sm focus:outline-none placeholder-gray-600"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={sendCommand}
              disabled={!command.trim() || !isConnected}
              className="btn btn-primary btn-sm"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>
            {isConnected ? t('containers.exec.ready') : t('containers.exec.disconnected')}
          </span>
          <span className="hidden sm:inline">{t('containers.exec.shortcuts')}</span>
        </div>
      </div>
    </div>
  );
}
