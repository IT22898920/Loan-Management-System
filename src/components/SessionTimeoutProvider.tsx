'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SESSION_CONFIG, LOGIN_START_KEY } from '@/lib/session-config';
import { logoutAction } from '@/app/actions/auth';

type Role = keyof typeof SESSION_CONFIG;

interface Props {
  role: Role;
  children: React.ReactNode;
}

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const;
const CHECK_INTERVAL_MS = 5000;

const BROADCAST_CHANNEL_NAME = 'diriyalanka_session';
const BROADCAST_THROTTLE_MS = 5000;

export default function SessionTimeoutProvider({ role, children }: Props) {
  const config = SESSION_CONFIG[role];
  const lastActivityRef = useRef<number>(0);
  const loginStartRef = useRef<number>(0);
  const loggingOutRef = useRef(false);
  const warningOpenRef = useRef(false);

  const [warningOpen, setWarningOpen] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Keep ref in sync with state so the interval callback can read without re-running
  warningOpenRef.current = warningOpen;

  const handleLogout = useCallback(async (message: string) => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    try {
      localStorage.removeItem(LOGIN_START_KEY);
    } catch {}
    // Notify other tabs first (BroadcastChannel may already be closed if this
    // came in from another tab — the runtime check guards that)
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const ch = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        ch.postMessage({ type: 'logout' });
        ch.close();
      }
    } catch {}
    toast.info(message);
    await logoutAction();
  }, []);

  const stayLoggedIn = useCallback(() => {
    lastActivityRef.current = Date.now();
    setWarningOpen(false);
  }, []);

  useEffect(() => {
    const now = Date.now();
    lastActivityRef.current = now;

    try {
      const stored = localStorage.getItem(LOGIN_START_KEY);
      if (stored) {
        loginStartRef.current = parseInt(stored, 10);
      } else {
        loginStartRef.current = now;
        localStorage.setItem(LOGIN_START_KEY, now.toString());
      }
    } catch {
      loginStartRef.current = now;
    }

    // Multi-tab sync — activity in any tab keeps every tab alive; logout in any
    // tab logs every tab out
    const channel =
      typeof window !== 'undefined' && 'BroadcastChannel' in window
        ? new BroadcastChannel(BROADCAST_CHANNEL_NAME)
        : null;

    let lastBroadcast = 0;
    const broadcastActivity = (t: number) => {
      if (!channel) return;
      if (t - lastBroadcast < BROADCAST_THROTTLE_MS) return;
      lastBroadcast = t;
      try { channel.postMessage({ type: 'activity', t }); } catch {}
    };

    if (channel) {
      channel.onmessage = (e) => {
        const msg = e?.data;
        if (msg?.type === 'activity' && typeof msg.t === 'number') {
          lastActivityRef.current = Math.max(lastActivityRef.current, msg.t);
          if (warningOpenRef.current) setWarningOpen(false);
        } else if (msg?.type === 'logout') {
          handleLogout('Logged out in another tab.');
        }
      };
    }

    const handleActivity = () => {
      const t = Date.now();
      lastActivityRef.current = t;
      broadcastActivity(t);
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      document.addEventListener(evt, handleActivity, { passive: true }),
    );

    const interval = setInterval(() => {
      const current = Date.now();
      const idleTime = current - lastActivityRef.current;
      const sessionAge = current - loginStartRef.current;

      if (sessionAge >= config.absoluteTimeoutMs) {
        handleLogout('Your session expired (12 hours). Please log in again.');
        return;
      }

      if (idleTime >= config.idleTimeoutMs) {
        handleLogout('Logged out due to inactivity.');
        return;
      }

      const remaining = config.idleTimeoutMs - idleTime;
      if (remaining <= config.warningMs) {
        setWarningOpen(true);
        setCountdown(Math.max(1, Math.ceil(remaining / 1000)));
      } else if (remaining > config.warningMs && warningOpenRef.current) {
        setWarningOpen(false);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => document.removeEventListener(evt, handleActivity));
      clearInterval(interval);
      if (channel) {
        try { channel.close(); } catch {}
      }
    };
    // Intentionally do NOT depend on warningOpen — the ref keeps the latest
    // value without restarting the timer (previously caused the warning to
    // reset the idle clock on every toggle).
  }, [config, handleLogout]);

  return (
    <>
      {children}
      {warningOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Session Timeout Warning</h3>
                <p className="text-xs text-muted-foreground mt-0.5">You will be logged out due to inactivity.</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-900">
                Auto-logout in <strong className="text-base">{countdown}</strong> second{countdown !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={stayLoggedIn} className="flex-1 rounded-xl">
                Stay Logged In
              </Button>
              <Button
                onClick={() => handleLogout('Logged out.')}
                variant="outline"
                className="rounded-xl"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
