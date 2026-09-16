import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import { Lock, Loader2, Check, AlertCircle } from 'lucide-react';

type Stage = 'verify' | 'checking' | 'form' | 'invalid';

/**
 * Password reset screen, served at /reset-password.
 *
 * Supports two link styles:
 *  1. Scanner-safe (recommended): email links to
 *     /reset-password?token_hash=...&type=recovery
 *     The token is only used when the person clicks "Continue", so email
 *     security scanners that pre-open links can't burn it.
 *  2. Default Supabase link: Supabase verifies the token, then redirects here
 *     with a session already set (PASSWORD_RECOVERY event).
 */
export default function UpdatePassword({ onComplete }: { onComplete: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get('token_hash');
  const tokenType = params.get('type');

  const [stage, setStage] = useState<Stage>(tokenHash ? 'verify' : 'checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Default-link style: wait for Supabase to restore the recovery session.
  useEffect(() => {
    if (tokenHash) return;
    let cancelled = false;
    const check = async () => {
      // Give supabase-js a moment to parse the URL hash on first load.
      for (let i = 0; i < 10 && !cancelled; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (!cancelled) setStage('form');
          return;
        }
        await new Promise(r => setTimeout(r, 300));
      }
      if (!cancelled) setStage('invalid');
    };
    check();
    return () => { cancelled = true; };
  }, [tokenHash]);

  const handleVerify = async () => {
    if (!tokenHash) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: (tokenType as 'recovery') || 'recovery',
    });
    setLoading(false);
    // Remove the token from the address bar either way.
    window.history.replaceState({}, '', '/reset-password');
    if (error) {
      setStage('invalid');
    } else {
      setStage('form');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(finish, 2500);
    } catch (err: any) {
      const msg: string = err?.message || '';
      if (/different from the old password/i.test(msg)) {
        setError('Your new password must be different from your old one.');
      } else if (/session/i.test(msg)) {
        setError('Your reset link has expired. Please request a new one.');
      } else {
        setError(msg || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const finish = () => {
    window.history.replaceState({}, '', '/');
    onComplete();
  };

  const backToLogin = async () => {
    await supabase.auth.signOut();
    finish();
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card max-w-md w-full p-8 space-y-6 neon-glow"
      >
        <div className="text-center space-y-2">
          <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/30">
            <Lock className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-black tracking-tighter uppercase text-white">New Password</h1>
          <p className="text-white/40 text-sm">
            {stage === 'invalid' ? 'This reset link can’t be used.' : 'Secure your account with a new password.'}
          </p>
        </div>

        {stage === 'checking' && (
          <div className="flex justify-center py-6">
            <Loader2 className="animate-spin text-white/60" />
          </div>
        )}

        {stage === 'verify' && (
          <div className="space-y-4">
            <p className="text-white/60 text-sm text-center">Tap continue to choose your new password.</p>
            <button
              onClick={handleVerify}
              disabled={loading}
              className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-white/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : 'Continue'}
            </button>
          </div>
        )}

        {stage === 'invalid' && (
          <div className="space-y-4">
            <div className="bg-highlight/10 border border-highlight/20 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="text-highlight shrink-0" size={18} />
              <p className="text-highlight text-xs font-bold">
                The link has expired or was already used. Reset links only work once and for a limited time.
                Go back and use “Forgot Password?” to get a new one.
              </p>
            </div>
            <button
              onClick={backToLogin}
              className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-white/90 transition-all"
            >
              Back to Login
            </button>
          </div>
        )}

        {stage === 'form' && success && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/10 p-6 rounded-2xl border border-white/20 text-center space-y-4"
          >
            <div className="bg-white text-black w-12 h-12 rounded-full flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(255,255,255,0.3)]">
              <Check size={24} />
            </div>
            <div className="space-y-1">
              <p className="text-white font-bold uppercase tracking-wider">Password updated</p>
              <p className="text-white/60 text-xs">You’re logged in with your new password.</p>
            </div>
            <p className="text-white/30 text-[10px] animate-pulse">Taking you to the app...</p>
          </motion.div>
        )}

        {stage === 'form' && !success && (
          <form onSubmit={handleUpdate} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] text-white/40 uppercase font-black tracking-widest ml-1">New Password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-white outline-none transition-all text-white placeholder:text-white/10"
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-white/40 uppercase font-black tracking-widest ml-1">Confirm Password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-white outline-none transition-all text-white placeholder:text-white/10"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-highlight/10 border border-highlight/20 p-3 rounded-xl flex items-center gap-3"
              >
                <AlertCircle className="text-highlight shrink-0" size={18} />
                <p className="text-highlight text-xs font-bold">{error}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-white/90 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.2)] disabled:opacity-50 active:scale-95"
            >
              {loading ? <Loader2 className="animate-spin" /> : <>Update Password</>}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
