import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Shield, 
  Check, 
  X, 
  Copy, 
  Loader2, 
  Ticket, 
  AlertCircle, 
  Edit3, 
  Search,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { cn } from '../lib/utils';

interface PlayersManagementProps {
  onRefreshParent?: () => void;
}

export default function PlayersManagement({ onRefreshParent }: PlayersManagementProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [togglingAdminId, setTogglingAdminId] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Token management state
  const [updatingTokenId, setUpdatingTokenId] = useState<string | null>(null);
  const [tokenEditModal, setTokenEditModal] = useState<{ id: string; name: string; tokens: number } | null>(null);
  const [userTabFilter, setUserTabFilter] = useState<'all' | 'pending' | 'no_tokens' | 'one_token' | 'paid' | 'active'>('all');
  const [sqlMigrationNeeded, setSqlMigrationNeeded] = useState(false);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      setStatusMessage(prev => prev?.text === text ? null : prev);
    }, 10000);
  };

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

      if (error) {
        showStatus('error', 'Error loading players: ' + error.message);
      } else if (data) {
        setProfiles(data.map((p: any) => ({
          ...p,
          is_approved: p.is_approved ?? true,
          game_tokens: p.game_tokens ?? 2
        })));
      }
    } catch (err: any) {
      console.error('fetchProfiles error:', err);
      showStatus('error', 'Network/database error during fetch: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const updateTokens = async (profileId: string, newTokens: number) => {
    const clampedTokens = Math.max(0, newTokens);
    setUpdatingTokenId(profileId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ game_tokens: clampedTokens })
        .eq('id', profileId);

      if (error) {
        if (error.code === '42703' || error.message?.includes('game_tokens') || error.code === 'PGRST204') {
          setSqlMigrationNeeded(true);
          showStatus('error', 'The game_tokens column is missing in Supabase! Please run the Phase 7 SQL migration.');
        } else {
          showStatus('error', `Could not update tokens: ${error.message}`);
        }
      } else {
        showStatus('success', `Tokens updated successfully (${clampedTokens} games available).`);
        setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, game_tokens: clampedTokens } : p));
        setTokenEditModal(null);
        if (onRefreshParent) onRefreshParent();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error updating tokens: ' + (err.message || err));
    } finally {
      setUpdatingTokenId(null);
    }
  };

  const addCashTokens = async (profile: Profile, count = 10) => {
    const current = profile.game_tokens ?? 0;
    await updateTokens(profile.id, current + count);
  };

  const approveUser = async (profileId: string, initialTokens = 2) => {
    setApprovingId(profileId);
    try {
      let updatePayload: any = { is_approved: true };
      if (initialTokens > 0) {
        updatePayload.game_tokens = initialTokens;
      }
      
      let { error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', profileId);

      // Fallback if game_tokens column doesn't exist
      if (error && (error.code === '42703' || error.message?.includes('game_tokens') || error.code === 'PGRST204')) {
        console.log('game_tokens column not found on approve, updating only is_approved...');
        const res2 = await supabase
          .from('profiles')
          .update({ is_approved: true })
          .eq('id', profileId);
        error = res2.error;
        if (!error && initialTokens > 0) {
          setSqlMigrationNeeded(true);
        }
      }

      if (error) {
        showStatus('error', 'Could not approve player: ' + error.message);
      } else {
        showStatus('success', `Player approved successfully${initialTokens > 0 ? ` with ${initialTokens} prepaid games!` : '!'}`);
        fetchProfiles();
        if (onRefreshParent) onRefreshParent();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error approving player: ' + (err.message || err));
    } finally {
      setApprovingId(null);
    }
  };

  const toggleAdmin = async (profileId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: !currentStatus })
        .eq('id', profileId);

      if (error) {
        showStatus('error', 'Could not update admin privileges: ' + error.message);
      } else {
        showStatus('success', 'Admin privileges updated successfully.');
        setTogglingAdminId(null);
        fetchProfiles();
        if (onRefreshParent) onRefreshParent();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error: ' + (err.message || err));
    }
  };

  const revokeAccess = async (profileId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_approved: false })
        .eq('id', profileId);

      if (error) {
        showStatus('error', 'Could not revoke player access: ' + error.message);
      } else {
        showStatus('success', 'Player access has been revoked.');
        setDeletingProfileId(null);
        fetchProfiles();
        if (onRefreshParent) onRefreshParent();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error: ' + (err.message || err));
    }
  };

  // Counts for stat cards and pills
  const totalCount = profiles.length;
  const activeCount = profiles.filter(p => p.is_approved).length;
  const noTokensCount = profiles.filter(p => p.is_approved && (p.game_tokens ?? 0) <= 0).length;
  const oneTokenCount = profiles.filter(p => p.is_approved && (p.game_tokens ?? 0) === 1).length;
  const pendingCount = profiles.filter(p => !p.is_approved).length;
  const paidCount = profiles.filter(p => p.is_approved && (p.game_tokens ?? 0) >= 2).length;

  const filteredProfiles = profiles.filter(p => {
    const search = searchTerm.toLowerCase().trim();
    const matchesSearch = !search || 
      p.full_name.toLowerCase().includes(search) || 
      (p.email && p.email.toLowerCase().includes(search));

    if (!matchesSearch) return false;
    if (userTabFilter === 'pending') return !p.is_approved;
    if (userTabFilter === 'no_tokens') return p.is_approved && (p.game_tokens ?? 0) <= 0;
    if (userTabFilter === 'one_token') return p.is_approved && (p.game_tokens ?? 0) === 1;
    if (userTabFilter === 'paid') return p.is_approved && (p.game_tokens ?? 0) >= 2;
    if (userTabFilter === 'active') return p.is_approved;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-[#0055FF] text-white flex items-center justify-center font-black shadow-lg shadow-[#0055FF]/20 shrink-0">
              <Users size={20} />
            </span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white uppercase">
              PLAYERS & GAME TOKENS
            </h1>
          </div>
          <p className="text-white/50 text-xs sm:text-sm font-medium pl-1">
            Manage player access and track prepaid game tokens (cash payments for lights).
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
          <input 
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full glass-card text-white placeholder-white/40 rounded-full pl-10 pr-4 py-2.5 text-sm font-medium outline-none focus:border-white/30 transition-colors"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')} 
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {statusMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-4 rounded-2xl flex items-start gap-3 shadow-md",
            statusMessage.type === 'error' 
              ? "bg-[#FF5500]/15 text-[#FF7A45]" 
              : "bg-[#0055FF]/15 text-[#60A5FA]"
          )}
        >
          <div className="flex-1 text-sm font-bold whitespace-pre-line">{statusMessage.text}</div>
          <button onClick={() => setStatusMessage(null)} className="text-white/40 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </motion.div>
      )}

      {sqlMigrationNeeded && (
        <div className="p-4 rounded-2xl bg-[#FFBE0B]/15 text-[#FFBE0B] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-black text-sm text-white">
              <AlertCircle size={16} className="text-[#FFBE0B] shrink-0" />
              <span>Database Migration Required in Supabase</span>
            </div>
            <p className="text-xs text-white/70">
              The <code className="bg-black/50 px-1.5 py-0.5 rounded text-[#FFBE0B] font-mono">game_tokens</code> column has not been added yet.
            </p>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS game_tokens INTEGER NOT NULL DEFAULT 2;');
              showStatus('success', 'SQL copied to clipboard! Paste and run it in Supabase SQL Editor.');
            }}
            className="bg-[#FFBE0B] text-black px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-2 self-start sm:self-center shrink-0 hover:bg-[#FFD154] transition-colors"
          >
            <Copy size={14} /> Copy SQL
          </button>
        </div>
      )}

      {/* 5 High-Contrast Stat Cards (Glass Card style) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Players */}
        <button
          onClick={() => setUserTabFilter('all')}
          className={cn(
            "p-5 rounded-2xl text-left transition-all relative overflow-hidden group cursor-pointer",
            userTabFilter === 'all'
              ? "glass-card border-white/40 shadow-lg shadow-white/5 bg-white/10"
              : "glass-card hover:bg-white/[0.08]"
          )}
        >
          <div className="text-[11px] uppercase font-black tracking-wider text-white/50">TOTAL PLAYERS</div>
          <div className="text-3xl font-black text-white mt-2">{totalCount}</div>
          <div className="text-[10px] text-white/40 font-medium mt-1">Full registered squad</div>
        </button>

        {/* Active Players */}
        <button
          onClick={() => setUserTabFilter('active')}
          className={cn(
            "p-5 rounded-2xl text-left transition-all relative overflow-hidden group cursor-pointer",
            userTabFilter === 'active'
              ? "glass-card border-[#0055FF]/60 shadow-lg shadow-[#0055FF]/20 bg-[#0055FF]/15"
              : "glass-card hover:bg-white/[0.08]"
          )}
        >
          <div className="text-[11px] uppercase font-black tracking-wider text-[#4D88FF]">ACTIVE PLAYERS</div>
          <div className="text-3xl font-black text-[#0055FF] mt-2">{activeCount}</div>
          <div className="text-[10px] text-white/40 font-medium mt-1">Approved members</div>
        </button>

        {/* Needs Cash (0 tokens - Blocked) */}
        <button
          onClick={() => setUserTabFilter('no_tokens')}
          className={cn(
            "p-5 rounded-2xl text-left transition-all relative overflow-hidden group cursor-pointer",
            userTabFilter === 'no_tokens'
              ? "glass-card border-[#FF5500]/60 shadow-lg shadow-[#FF5500]/25 bg-[#FF5500]/15"
              : "glass-card hover:bg-white/[0.08]"
          )}
        >
          <div className="text-[11px] uppercase font-black tracking-wider text-[#FF7033] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#FF5500] animate-pulse"></span>
            NEEDS CASH
          </div>
          <div className="text-3xl font-black text-[#FF5500] mt-2">{noTokensCount}</div>
          <div className="text-[10px] text-[#FF8F5A] font-bold mt-1">0 tokens (Blocked)</div>
        </button>

        {/* 1 Game Left (Paying Soon) */}
        <button
          onClick={() => setUserTabFilter('one_token')}
          className={cn(
            "p-5 rounded-2xl text-left transition-all relative overflow-hidden group cursor-pointer",
            userTabFilter === 'one_token'
              ? "glass-card border-[#FFBE0B]/60 shadow-lg shadow-[#FFBE0B]/25 bg-[#FFBE0B]/15"
              : "glass-card hover:bg-white/[0.08]"
          )}
        >
          <div className="text-[11px] uppercase font-black tracking-wider text-[#FFD154] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#FFBE0B] animate-pulse"></span>
            1 GAME LEFT
          </div>
          <div className="text-3xl font-black text-[#FFBE0B] mt-2">{oneTokenCount}</div>
          <div className="text-[10px] text-[#FFE38A] font-bold mt-1">Pay cash next match</div>
        </button>

        {/* Pending Approval */}
        <button
          onClick={() => setUserTabFilter('pending')}
          className={cn(
            "p-5 rounded-2xl text-left transition-all relative overflow-hidden group cursor-pointer",
            userTabFilter === 'pending'
              ? "glass-card border-white/40 shadow-lg shadow-white/5 bg-white/10"
              : "glass-card hover:bg-white/[0.08]"
          )}
        >
          <div className="text-[11px] uppercase font-black tracking-wider text-white flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white"></span>
            PENDING APPROVAL
          </div>
          <div className="text-3xl font-black text-white mt-2">{pendingCount}</div>
          <div className="text-[10px] text-white/40 font-medium mt-1">Awaiting access</div>
        </button>
      </div>

      {/* FILTER PILLS */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* ALL */}
          <button
            onClick={() => setUserTabFilter('all')}
            className={cn(
              "rounded-full px-5 py-2.5 text-sm font-black transition-all flex items-center gap-2 cursor-pointer",
              userTabFilter === 'all'
                ? "bg-white text-black shadow-lg shadow-white/20 scale-105"
                : "glass-card text-white/90 hover:bg-white/10 hover:text-white"
            )}
          >
            <span>All</span>
            <span className={cn(
              "w-5 h-5 rounded-full text-[11px] font-black inline-flex items-center justify-center",
              userTabFilter === 'all' ? "bg-black text-white" : "bg-black/40 text-white/70"
            )}>
              {totalCount}
            </span>
          </button>

          {/* 0 TOKENS / NEEDS CASH (Warm Vermilion Orange) */}
          <button
            onClick={() => setUserTabFilter('no_tokens')}
            className={cn(
              "rounded-full px-5 py-2.5 text-sm font-black transition-all flex items-center gap-2 cursor-pointer",
              userTabFilter === 'no_tokens'
                ? "bg-[#FF5500] text-black shadow-lg shadow-[#FF5500]/30 scale-105"
                : "glass-card text-white/90 hover:bg-white/10 hover:text-white"
            )}
          >
            <span>0 Tokens / Needs Cash</span>
            <span className={cn(
              "w-5 h-5 rounded-full text-[11px] font-black inline-flex items-center justify-center",
              userTabFilter === 'no_tokens' ? "bg-black text-[#FF5500]" : "bg-[#FF5500]/25 text-[#FF7033]"
            )}>
              {noTokensCount}
            </span>
          </button>

          {/* 1 GAME LEFT / PAYING SOON (Golden Yellow) */}
          <button
            onClick={() => setUserTabFilter('one_token')}
            className={cn(
              "rounded-full px-5 py-2.5 text-sm font-black transition-all flex items-center gap-2 cursor-pointer",
              userTabFilter === 'one_token'
                ? "bg-[#FFBE0B] text-black shadow-lg shadow-[#FFBE0B]/30 scale-105"
                : "glass-card text-white/90 hover:bg-white/10 hover:text-white"
            )}
          >
            <span>1 Game Left / Paying Soon</span>
            <span className={cn(
              "w-5 h-5 rounded-full text-[11px] font-black inline-flex items-center justify-center",
              userTabFilter === 'one_token' ? "bg-black text-[#FFBE0B]" : "bg-[#FFBE0B]/25 text-[#FFD154]"
            )}>
              {oneTokenCount}
            </span>
          </button>

          {/* PENDING APPROVAL */}
          <button
            onClick={() => setUserTabFilter('pending')}
            className={cn(
              "rounded-full px-5 py-2.5 text-sm font-black transition-all flex items-center gap-2 cursor-pointer",
              userTabFilter === 'pending'
                ? "bg-white text-black shadow-lg shadow-white/20 scale-105"
                : "glass-card text-white/90 hover:bg-white/10 hover:text-white"
            )}
          >
            <span>Pending</span>
            <span className={cn(
              "w-5 h-5 rounded-full text-[11px] font-black inline-flex items-center justify-center",
              userTabFilter === 'pending' ? "bg-black text-white" : "bg-black/40 text-white/70"
            )}>
              {pendingCount}
            </span>
          </button>

          {/* ACTIVE (Electric Blue) */}
          <button
            onClick={() => setUserTabFilter('active')}
            className={cn(
              "rounded-full px-5 py-2.5 text-sm font-black transition-all flex items-center gap-2 cursor-pointer",
              userTabFilter === 'active'
                ? "bg-[#0055FF] text-white shadow-lg shadow-[#0055FF]/30 scale-105"
                : "glass-card text-white/90 hover:bg-white/10 hover:text-white"
            )}
          >
            <span>Active</span>
            <span className={cn(
              "w-5 h-5 rounded-full text-[11px] font-black inline-flex items-center justify-center",
              userTabFilter === 'active' ? "bg-white text-[#0055FF]" : "bg-[#0055FF]/25 text-[#60A5FA]"
            )}>
              {activeCount}
            </span>
          </button>
        </div>

        {/* PAYMENT FLAGS ROW */}
        <div className="flex flex-wrap items-center justify-between gap-4 glass-card px-5 py-4">
          <div className="flex items-center flex-wrap gap-2.5 text-xs font-bold">
            <span className="text-white/40 uppercase tracking-widest text-[11px] font-black mr-1">
              PAYMENT FLAGS:
            </span>
            
            {/* Active / Paid */}
            <span className="bg-[#0055FF] text-white font-black px-4 py-1.5 rounded-full text-xs inline-flex items-center gap-2 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-white"></span>
              Active / Paid (2+ games)
            </span>

            {/* Low Credits (1 game) */}
            <span className="bg-[#FFBE0B] text-black font-black px-4 py-1.5 rounded-full text-xs inline-flex items-center gap-2 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-black animate-pulse"></span>
              Low Credits (1 game)
            </span>

            {/* Needs Payment (0 games) */}
            <span className="bg-[#FF5500] text-black font-black px-4 py-1.5 rounded-full text-xs inline-flex items-center gap-2 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-black"></span>
              Needs Payment (0 games)
            </span>
          </div>

          <div className="text-xs text-white/40 font-medium">
            Quick visual flags for cash collection
          </div>
        </div>
      </div>

      {/* PayID / Cash Info Box */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs glass-card p-4">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-[#0055FF] text-white flex items-center justify-center text-sm font-black shrink-0">
            💳
          </span>
          <div>
            <div className="text-white font-black text-xs sm:text-sm">
              Payment Method: <span className="text-[#FFBE0B]">Australian PayID</span> or Cash in hand for pitch lights • <span className="text-[#00ff66]">$20 = 10 games/tokens</span>
            </div>
            <div className="text-white/50 text-[11px] mt-0.5 font-medium">
              Manage member game tokens directly using the token balance controls.
            </div>
          </div>
        </div>

        <button 
          onClick={fetchProfiles}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors cursor-pointer"
          title="Refresh player list"
        >
          <RefreshCw size={15} className={cn(loading && "animate-spin")} />
        </button>
      </div>

      {/* Players Directory */}
      <div className="glass-card overflow-hidden shadow-2xl">
        {/* Desktop Table */}
        <table className="hidden md:table w-full text-left border-collapse">
          <thead className="bg-white/5 text-white/40 text-[10px] uppercase font-black tracking-widest border-b border-white/5">
            <tr>
              <th className="p-5">PLAYER & PAYMENT STATUS</th>
              <th className="p-5">STATUS</th>
              <th className="p-5">GAME TOKENS (AVAILABLE)</th>
              <th className="p-5 text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredProfiles.map(profile => {
              const tokens = profile.game_tokens ?? 0;
              const isApproved = profile.is_approved;

              return (
                <tr key={profile.id} className="hover:bg-white/[0.03] transition-colors">
                  {/* Player Name & Info */}
                  <td className="p-5">
                    <div className="font-bold flex items-center flex-wrap gap-2">
                      <span className="text-white font-black text-sm">{profile.full_name}</span>
                      {profile.is_admin && (
                        <span className="text-[10px] bg-[#00E65C] text-black px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                          Admin
                        </span>
                      )}
                      {!isApproved && (
                        <span className="text-[10px] bg-white text-black px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                          Pending Approval
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/40 mt-1 font-medium">
                      {profile.email && <span>{profile.email}</span>}
                    </div>
                  </td>

                  {/* Status Pill (Reference-Inspired NO-STROKE High Contrast Pill) */}
                  <td className="p-5">
                    {!isApproved ? (
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black bg-white text-black shadow-sm">
                        <span className="h-2 w-2 rounded-full bg-black"></span>
                        Awaiting Approval
                      </span>
                    ) : tokens <= 0 ? (
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black bg-[#FF5500] text-black shadow-sm">
                        <span className="h-2 w-2 rounded-full bg-black"></span>
                        Needs Payment (0 games)
                      </span>
                    ) : tokens === 1 ? (
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black bg-[#FFBE0B] text-black shadow-sm">
                        <span className="h-2 w-2 rounded-full bg-black animate-pulse"></span>
                        Low Credits (1 game left)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black bg-[#0055FF] text-white shadow-sm">
                        <span className="h-2 w-2 rounded-full bg-white"></span>
                        Active / Paid
                      </span>
                    )}
                  </td>

                  {/* Game Tokens (Available) */}
                  <td className="p-5">
                    {!isApproved ? (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => approveUser(profile.id, 0)}
                          disabled={approvingId === profile.id}
                          className="bg-[#0055FF] hover:bg-[#0047E0] text-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-md shadow-[#0055FF]/20"
                          title="Approve player"
                        >
                          {approvingId === profile.id ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
                          Approve Player
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex items-baseline gap-1 min-w-[50px]">
                          <span className={cn(
                            "text-xl font-black font-mono",
                            tokens <= 0 ? "text-[#FF5500]" : tokens === 1 ? "text-[#FFBE0B]" : "text-white"
                          )}>
                            {tokens}
                          </span>
                          <span className="text-[10px] uppercase font-bold text-white/40">games</span>
                        </div>

                        <button
                          onClick={() => setTokenEditModal({ id: profile.id, name: profile.full_name, tokens })}
                          title="Manually set token count"
                          className="px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 size={13} />
                          <span>Edit</span>
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Actions (Admin / Revoke) */}
                  <td className="p-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isApproved && (
                        <>
                          {togglingAdminId === profile.id ? (
                            <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full">
                              <span className="text-[10px] font-bold text-[#FFBE0B] uppercase">Confirm?</span>
                              <button 
                                onClick={() => toggleAdmin(profile.id, profile.is_admin)}
                                className="bg-white text-black px-2.5 py-0.5 rounded-full text-[10px] font-black hover:bg-white/90 transition-all"
                              >
                                Yes
                              </button>
                              <button 
                                onClick={() => setTogglingAdminId(null)}
                                className="text-white/60 hover:text-white text-[10px] font-bold"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : deletingProfileId === profile.id ? (
                            <div className="flex items-center gap-2 bg-[#FF5500]/20 px-3 py-1.5 rounded-full">
                              <span className="text-[10px] font-bold text-[#FF5500] uppercase">Revoke?</span>
                              <button 
                                onClick={() => revokeAccess(profile.id)}
                                className="bg-[#FF5500] text-black px-2.5 py-0.5 rounded-full text-[10px] font-black transition-all"
                              >
                                Yes
                              </button>
                              <button 
                                onClick={() => setDeletingProfileId(null)}
                                className="text-white/60 hover:text-white text-[10px] font-bold"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => setTogglingAdminId(profile.id)}
                                className={cn(
                                  "px-3 py-1.5 rounded-full transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer",
                                  profile.is_admin 
                                    ? "bg-[#00E65C]/15 text-[#00E65C]" 
                                    : "bg-white/10 text-white/60 hover:text-white hover:bg-white/15"
                                )}
                              >
                                <Shield size={12} />
                                {profile.is_admin ? 'Admin' : 'Make Admin'}
                              </button>

                              <button 
                                onClick={() => setDeletingProfileId(profile.id)}
                                className="text-white/30 hover:text-[#FF5500] p-2 transition-colors rounded-full hover:bg-white/10 cursor-pointer"
                                title="Revoke player access"
                              >
                                <X size={15} />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Mobile List View */}
        <div className="md:hidden divide-y divide-white/5">
          {filteredProfiles.map(profile => {
            const tokens = profile.game_tokens ?? 0;
            const isApproved = profile.is_approved;

            return (
              <div key={profile.id} className="p-5 space-y-4">
                {/* Header: Name and Status */}
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-bold text-base tracking-tight flex items-center flex-wrap gap-2">
                      <span className="text-white font-black">{profile.full_name}</span>
                      {profile.is_admin && (
                        <span className="text-[9px] bg-[#00E65C] text-black px-2 py-0.5 rounded-full font-black uppercase">
                          Admin
                        </span>
                      )}
                    </div>
                    {profile.email && <div className="text-xs text-white/40 mt-0.5">{profile.email}</div>}
                  </div>

                  {/* Status Pill */}
                  {!isApproved ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-white text-black shadow-sm shrink-0">
                      Pending
                    </span>
                  ) : tokens <= 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-[#FF5500] text-black shadow-sm shrink-0">
                      Needs Cash
                    </span>
                  ) : tokens === 1 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-[#FFBE0B] text-black shadow-sm shrink-0">
                      1 Left
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-[#0055FF] text-white shadow-sm shrink-0">
                      Active
                    </span>
                  )}
                </div>

                {/* Tokens & Controls */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn(
                      "text-2xl font-black font-mono",
                      tokens <= 0 ? "text-[#FF5500]" : tokens === 1 ? "text-[#FFBE0B]" : "text-white"
                    )}>
                      {tokens}
                    </span>
                    <span className="text-xs uppercase font-bold text-white/40">Tokens Available</span>
                  </div>

                  {isApproved && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setTokenEditModal({ id: profile.id, name: profile.full_name, tokens })}
                        className="px-3.5 py-2 rounded-full bg-white/10 text-white/80 hover:text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 size={14} />
                        <span>Edit Tokens</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Approvals / Admin Actions */}
                {!isApproved ? (
                  <div className="pt-2">
                    <button 
                      onClick={() => approveUser(profile.id, 0)}
                      disabled={approvingId === profile.id}
                      className="w-full bg-[#0055FF] text-white px-4 py-2.5 rounded-full text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[#0055FF]/20"
                    >
                      {approvingId === profile.id ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                      Approve Player
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                    <button
                      onClick={() => toggleAdmin(profile.id, profile.is_admin)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5",
                        profile.is_admin ? "bg-[#00E65C]/20 text-[#00E65C]" : "bg-white/10 text-white/60"
                      )}
                    >
                      <Shield size={12} />
                      {profile.is_admin ? 'Admin Role' : 'Make Admin'}
                    </button>

                    <button 
                      onClick={() => revokeAccess(profile.id)}
                      className="text-white/30 hover:text-[#FF5500] text-xs font-semibold px-2 py-1 cursor-pointer"
                    >
                      Revoke Access
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredProfiles.length === 0 && !loading && (
          <div className="text-center py-16 space-y-3">
            <div className="w-12 h-12 rounded-full bg-white/10 text-white/40 flex items-center justify-center mx-auto">
              <Users size={24} />
            </div>
            <div className="text-white font-bold text-base">No players found</div>
            <p className="text-white/40 text-xs max-w-sm mx-auto">
              No players match your search filter "{searchTerm || userTabFilter}".
            </p>
            {(searchTerm || userTabFilter !== 'all') && (
              <button
                onClick={() => { setSearchTerm(''); setUserTabFilter('all'); }}
                className="bg-white text-black font-black text-xs px-4 py-2 rounded-full mt-2 cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Token Edit Modal */}
      <AnimatePresence>
        {tokenEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card bg-[#181B26]/95 max-w-md w-full p-6 rounded-3xl space-y-6 shadow-2xl border border-white/20"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-xl text-white">
                  <span className="w-8 h-8 rounded-full bg-[#0055FF] text-white flex items-center justify-center text-xs">
                    <Ticket size={16} />
                  </span>
                  <span>MANAGE GAME TOKENS</span>
                </div>
                <button 
                  onClick={() => setTokenEditModal(null)}
                  className="text-white/40 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="glass-card p-4 rounded-2xl space-y-1">
                <div className="text-[10px] text-white/40 uppercase font-black tracking-wider">Player</div>
                <div className="text-lg font-bold text-white">{tokenEditModal.name}</div>
                <div className="text-xs text-[#60A5FA] font-medium mt-1">
                  Adjust available prepaid games for player
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs uppercase font-black tracking-wider text-white/70">
                  Games Available:
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="500"
                    value={tokenEditModal.tokens}
                    onChange={e => setTokenEditModal(prev => prev ? { ...prev, tokens: Math.max(0, parseInt(e.target.value) || 0) } : null)}
                    className="flex-1 glass-card rounded-2xl px-4 py-3 text-2xl font-mono font-black text-white focus:bg-white/10 outline-none"
                  />
                  <div className="text-sm font-black text-white/40 uppercase">Games</div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="space-y-2">
                <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Quick Presets:</div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setTokenEditModal(prev => prev ? { ...prev, tokens: (prev.tokens || 0) + 10 } : null)}
                    className="glass-card hover:bg-white/15 text-white py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer"
                  >
                    +10 Games
                  </button>
                  <button
                    onClick={() => setTokenEditModal(prev => prev ? { ...prev, tokens: (prev.tokens || 0) + 5 } : null)}
                    className="glass-card hover:bg-white/15 text-white py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer"
                  >
                    +5 Games
                  </button>
                  <button
                    onClick={() => setTokenEditModal(prev => prev ? { ...prev, tokens: (prev.tokens || 0) + 1 } : null)}
                    className="glass-card hover:bg-white/15 text-white py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer"
                  >
                    +1 Game
                  </button>
                  <button
                    onClick={() => setTokenEditModal(prev => prev ? { ...prev, tokens: 20 } : null)}
                    className="bg-[#FFBE0B] hover:bg-[#FFD154] text-black py-2.5 rounded-full text-xs font-black transition-all cursor-pointer"
                  >
                    Set to 20
                  </button>
                  <button
                    onClick={() => setTokenEditModal(prev => prev ? { ...prev, tokens: 10 } : null)}
                    className="glass-card hover:bg-white/15 text-white py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer"
                  >
                    Set to 10
                  </button>
                  <button
                    onClick={() => setTokenEditModal(prev => prev ? { ...prev, tokens: 0 } : null)}
                    className="bg-[#FF5500] hover:bg-[#FF7033] text-black py-2.5 rounded-full text-xs font-black transition-all cursor-pointer"
                  >
                    Reset (0)
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setTokenEditModal(null)}
                  className="flex-1 glass-card hover:bg-white/15 text-white py-3 rounded-full font-bold text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => updateTokens(tokenEditModal.id, tokenEditModal.tokens)}
                  disabled={updatingTokenId === tokenEditModal.id}
                  className="flex-1 bg-white hover:bg-white/90 text-black py-3 rounded-full font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-white/10"
                >
                  {updatingTokenId === tokenEditModal.id ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Check size={16} />
                  )}
                  Save Tokens
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
