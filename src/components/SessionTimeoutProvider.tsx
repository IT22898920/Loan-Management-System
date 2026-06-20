'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ShieldCheck, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SESSION_CONFIG, LOGIN_START_KEY } from '@/lib/session-config';
import { logoutAction } from '@/app/actions/auth';

type Role = keyof typeof SESSION_CONFIG;

interface Props {
  role: Role;
  children: React.ReactNode;
}

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const;
// Tick every 1 second so the countdown shows 60 → 59 → 58 → … → 1 smoothly.
const CHECK_INTERVAL_MS = 1000;

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

    // Multi-tab sync — activity in another tab keeps every tab alive; logout in
    // any tab logs every tab out.
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
        // Activity in another tab → user is clearly using the app, so cancel
        // the warning here too. This is intentionally different from local
        // mouse/key events while the warning is open (which are ignored).
        if (msg?.type === 'activity' && typeof msg.t === 'number') {
          lastActivityRef.current = Math.max(lastActivityRef.current, msg.t);
          if (warningOpenRef.current) setWarningOpen(false);
        } else if (msg?.type === 'logout') {
          handleLogout('Logged out in another tab.');
        }
      };
    }

    const handleActivity = () => {
      // CRITICAL: when the warning modal is visible, do NOT treat ambient
      // mouse/key/touch events as "user is here" — only the explicit
      // "Stay Logged In" button can reset the idle clock. Otherwise a stray
      // mousemove while the user is away keeps the warning visible forever
      // and the auto-logout never fires.
      if (warningOpenRef.current) return;

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

      // 1. Absolute session lifetime cap (e.g. 12 hours).
      if (sessionAge >= config.absoluteTimeoutMs) {
        handleLogout('Your session expired (12 hours). Please log in again.');
        return;
      }

      // 2. Idle hard timeout — fires even if the warning modal is showing,
      //    because handleActivity() above ignores events while the warning
      //    is up so the user can no longer accidentally extend it forever.
      if (idleTime >= config.idleTimeoutMs) {
        handleLogout('Logged out due to inactivity.');
        return;
      }

      // 3. Warning window — last `warningMs` (60 s) before the idle timeout.
      const remaining = config.idleTimeoutMs - idleTime;
      if (remaining <= config.warningMs) {
        setWarningOpen(true);
        setCountdown(Math.max(0, Math.ceil(remaining / 1000)));
      } else if (warningOpenRef.current) {
        // Activity in another tab pushed the timer forward — close the modal.
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

  // 0..1 progress of the warning countdown (used to drive the ring/bar)
  const warningTotalS = Math.max(1, Math.round(config.warningMs / 1000));
  const progress = Math.min(1, Math.max(0, countdown / warningTotalS));
  // SVG ring geometry
  const RADIUS = 36;
  const CIRC = 2 * Math.PI * RADIUS;

  return (
    <>
      {children}
      {warningOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200 border border-amber-100">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-lg shadow-amber-200">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900">Are you still there?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You'll be signed out automatically due to inactivity.
                </p>
              </div>
            </div>

            {/* Big animated countdown ring */}
            <div className="flex flex-col items-center my-5">
              <div className="relative w-28 h-28">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r={RADIUS}
                    stroke="rgb(254 215 170)" /* amber-200 */
                    strokeWidth="6"
                    fill="none"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={RADIUS}
                    stroke="rgb(245 158 11)" /* amber-500 */
                    strokeWidth="6"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={CIRC * (1 - progress)}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black tabular-nums text-amber-700 leading-none">
                    {countdown}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-600 mt-1">
                    second{countdown !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={stayLoggedIn}
                className="flex-1 rounded-xl h-11 font-semibold bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-lg shadow-emerald-200"
              >
                <ShieldCheck className="h-4 w-4 mr-2" />
                Stay Logged In
              </Button>
              <Button
                onClick={() => handleLogout('Logged out.')}
                variant="outline"
                className="rounded-xl h-11"
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                Logout
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground text-center mt-4">
              Moving your mouse here won't extend the session — only the button does.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
