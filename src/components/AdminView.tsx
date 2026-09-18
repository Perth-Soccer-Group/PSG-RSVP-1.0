import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Game, Profile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Users, Shield, Trash2, Check, X, Copy, Flag, Share2, Trophy, Loader2, RotateCw, Frown, Ticket, AlertCircle, Edit3, Coins, Banknote, Sparkles } from 'lucide-react';
import { cn, formatDate, formatTime } from '../lib/utils';
import PlayersManagement from './PlayersManagement';

interface AdminViewProps {
  initialTab?: 'matches' | 'players';
  onTabChange?: (tab: 'matches' | 'players') => void;
}

export default function AdminView({ initialTab = 'matches', onTabChange }: AdminViewProps) {
  const [adminTab, setAdminTab] = useState<'matches' | 'players'>(initialTab);
  const [games, setGames] = useState<Game[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGameDate, setNewGameDate] = useState('');
  const [newGameTime, setNewGameTime] = useState('18:45');
  const [newGameLocation, setNewGameLocation] = useState('Rivervale');
  const [hasInitializedForm, setHasInitializedForm] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);
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

  useEffect(() => {
    fetchData();
  }, []);

  const getNextWeekDateString = (dateStr: string): string => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      date.setDate(date.getDate() + 7);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    } catch (e) {
      return '';
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [gamesRes, profilesRes] = await Promise.all([
        supabase.from('games').select('*').order('date', { ascending: false }),
        supabase.from('profiles').select('*').order('full_name', { ascending: true })
      ]);

      if (gamesRes.error) {
        showStatus('error', 'Error loading games: ' + gamesRes.error.message);
      } else if (gamesRes.data) {
        setGames(gamesRes.data);
        
        // Auto-prefill the creation form on initial load
        if (!hasInitializedForm) {
          if (gamesRes.data.length > 0) {
            const lastGame = gamesRes.data[0];
            setNewGameLocation(lastGame.location);
            setNewGameTime(lastGame.time);
            const nextDate = getNextWeekDateString(lastGame.date);
            if (nextDate) {
              setNewGameDate(nextDate);
            }
          } else {
            // Defaults if no games exist
            setNewGameLocation('Rivervale (Copley Park)');
            setNewGameTime('18:45');
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            setNewGameDate(`${y}-${m}-${d}`);
          }
          setHasInitializedForm(true);
        }
      }
      
      if (profilesRes.error) {
        showStatus('error', 'Error loading profiles: ' + profilesRes.error.message);
      } else if (profilesRes.data) {
        setProfiles(profilesRes.data.map((p: any) => ({
          ...p,
          is_approved: p.is_approved ?? true,
          game_tokens: p.game_tokens ?? 2
        })));
      }
    } catch (err: any) {
      console.error('fetchData error:', err);
      showStatus('error', 'Network/database error during fetch: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const activeGames = games.filter(g => g.status !== 'finished');
  const historyGames = games.filter(g => g.status === 'finished');
  const activeGame = activeGames[0]; // There should only be one active game based on our logic

  const createGame = async (copyPrevious = false) => {
    if (activeGame) {
      showStatus('error', 'Only one active match can exist at a time. Please finish or delete the current match first.');
      return;
    }

    let gameData = {
      date: newGameDate,
      time: newGameTime,
      location: newGameLocation,
      status: 'open'
    };

    if (copyPrevious && games.length > 0) {
      const last = games[0];
      gameData.time = last.time;
      gameData.location = last.location;
    }

    if (!gameData.date) {
      showStatus('error', 'Please select a date for the new match.');
      return;
    }

    try {
      const { error } = await supabase.from('games').insert(gameData);
      if (error) {
        showStatus('error', 'Could not create match: ' + error.message);
      } else {
        showStatus('success', 'Match created successfully!');
        fetchData();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error creating match: ' + (err.message || err));
    }
  };
  
  const copyPublicLink = (game: Game) => {
    try {
      // Format: [Location] [Time] [Day] [DD/MM] [Live Link]
      const [year, month, day] = game.date.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      
      const dayName = dateObj.toLocaleDateString('en-AU', { weekday: 'long' });
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      
      const cleanTime = formatTime(game.time).toLowerCase();
      const url = `${window.location.origin}/match/${game.id}`;
      const shareText = `${game.location} ${cleanTime} ${dayName} ${dd}/${mm} ${url}`;

      navigator.clipboard.writeText(shareText);
      showStatus('success', 'WhatsApp share message copied to clipboard!\n\n' + shareText);
    } catch (err: any) {
      showStatus('error', 'Error copying link: ' + (err.message || err));
    }
  };

  const toggleAdmin = async (profileId: string, currentStatus: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id === profileId && currentStatus) {
        showStatus('error', 'You cannot remove your own admin status to prevent lockout.');
        return;
      }

      console.log('Toggling admin for:', profileId, 'from:', currentStatus);
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: !currentStatus })
        .eq('id', profileId);
      
      if (error) {
        showStatus('error', 'Could not toggle admin: ' + error.message);
      } else {
        showStatus('success', 'Admin privileges updated successfully.');
        setTogglingAdminId(null);
        fetchData();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error: ' + (err.message || err));
    }
  };

  const drawTeams = async (gameId: string) => {
    try {
      const { data: rsvpsData, error: fetchErr } = await supabase
        .from('rsvps')
        .select('*')
        .eq('game_id', gameId)
        .eq('status', 'confirmed');

      if (fetchErr) {
        showStatus('error', 'Error fetching RSVPs: ' + fetchErr.message);
        return;
      }

      if (!rsvpsData || rsvpsData.length < 2) {
        showStatus('error', 'Not enough players to draw teams (minimum 2 players confirmed).');
        return;
      }

      const userIds = rsvpsData.map(r => r.user_id);
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      if (profilesErr) {
        showStatus('error', 'Error fetching profiles for RSVPs: ' + profilesErr.message);
        return;
      }

      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));
      const playing = rsvpsData
        .map(r => profilesMap.get(r.user_id))
        .filter(Boolean) as any[];

      const shuffled = [...playing].sort(() => Math.random() - 0.5);
      const mid = Math.ceil(shuffled.length / 2);
      const teamA = shuffled.slice(0, mid);
      const teamB = shuffled.slice(mid);

      const { error } = await supabase
        .from('games')
        .update({ team_a: teamA, team_b: teamB })
        .eq('id', gameId);

      if (error) {
        showStatus('error', 'Could not save drawn teams: ' + error.message);
      } else {
        showStatus('success', 'Teams drawn and saved successfully!');
        fetchData();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error drawing teams: ' + (err.message || err));
    }
  };

  const updateGameStatus = async (gameId: string, status: string) => {
    try {
      let updateData: any = { status };
      
      if (status === 'finished') {
        // Safe calculative blocks
        try {
          // Calculate MVP
          const { data: votes, error: votesError } = await supabase
            .from('votes')
            .select('candidate_id')
            .eq('game_id', gameId);
          
          if (votesError) {
            console.warn('Error fetching MVP votes on finish:', votesError.message);
          }
          
          if (votes && votes.length > 0) {
            const counts: Record<string, number> = {};
            votes.forEach(v => {
              if (v.candidate_id) {
                counts[v.candidate_id] = (counts[v.candidate_id] || 0) + 1;
              }
            });
            const sortedCounts = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            if (sortedCounts.length > 0) {
              const winnerId = sortedCounts[0][0];
              const winner = profiles.find(p => p.id === winnerId);
              if (winner) {
                updateData.mvp_winner = winner.full_name;
              } else {
                // Direct database fallback lookup
                const { data: pData } = await supabase
                  .from('profiles')
                  .select('full_name')
                  .eq('id', winnerId)
                  .single();
                if (pData) {
                  updateData.mvp_winner = pData.full_name;
                } else {
                  updateData.mvp_winner = `Player (${winnerId.slice(0, 5)})`;
                }
              }
            }
          }
        } catch (mvpErr: any) {
          console.error('Safe MVP calculation caught error:', mvpErr);
        }

        try {
          // Calculate MSP
          const { data: mspVotes, error: mspError } = await supabase
            .from('msp_votes')
            .select('candidate_id')
            .eq('game_id', gameId);

          if (mspError) {
            console.warn('Error fetching MSP votes on finish:', mspError.message);
          }

          if (mspVotes && mspVotes.length > 0) {
            const mspCounts: Record<string, number> = {};
            mspVotes.forEach(v => {
              if (v.candidate_id) {
                mspCounts[v.candidate_id] = (mspCounts[v.candidate_id] || 0) + 1;
              }
            });
            const sortedMspCounts = Object.entries(mspCounts).sort((a, b) => b[1] - a[1]);
            if (sortedMspCounts.length > 0) {
              const mspWinnerId = sortedMspCounts[0][0];
              const mspWinner = profiles.find(p => p.id === mspWinnerId);
              if (mspWinner) {
                updateData.msp_winner = mspWinner.full_name;
              } else {
                // Direct database fallback lookup
                const { data: pData } = await supabase
                  .from('profiles')
                  .select('full_name')
                  .eq('id', mspWinnerId)
                  .single();
                if (pData) {
                  updateData.msp_winner = pData.full_name;
                } else {
                  updateData.msp_winner = `Player (${mspWinnerId.slice(0, 5)})`;
                }
              }
            }
          }
        } catch (mspErr: any) {
          console.error('Safe MSP calculation caught error:', mspErr);
        }
      }

      console.log('Sending games update:', updateData);
      let { error } = await supabase.from('games').update(updateData).eq('id', gameId);
      
      // Fallback: If it failed due to missing msp_winner or mvp_winner column, retry without them
      if (error && (error.message?.includes('msp_winner') || error.message?.includes('mvp_winner') || error.code === 'PGRST204')) {
        console.log('Detected missing winner columns, retrying update with only status...');
        const fallbackData = { status };
        const res = await supabase.from('games').update(fallbackData).eq('id', gameId);
        error = res.error;
      }

      if (error) {
        showStatus('error', `Could not update match status: ${error.message}`);
      } else {
        showStatus('success', `Match status updated successfully to ${status}!`);
        await fetchData();
      }
    } catch (err: any) {
      console.error('Fatal error in updateGameStatus:', err);
      showStatus('error', `A critical error occurred: ${err.message || err}`);
    }
  };

  const copyMVPPoll = (game: Game) => {
    try {
      const appUrl = window.location.origin;
      const pollText = `🏆 *MVP VOTING: ${game.date}*\n\nVote for the best player of the match here:\n${appUrl}\n\n_Only confirmed players can vote!_`;
      
      navigator.clipboard.writeText(pollText);
      showStatus('success', 'MVP voting WhatsApp poll template copied to clipboard!');
    } catch (err: any) {
      showStatus('error', 'Error copying MVP poll template: ' + (err.message || err));
    }
  };

  const copyMSPPoll = (game: Game) => {
    try {
      const appUrl = window.location.origin;
      const pollText = `💩 *MSP VOTING (Most Shitty Player): ${game.date}*\n\nVote for the MSP of the match here:\n${appUrl}\n\n_Only confirmed players can vote!_`;
      
      navigator.clipboard.writeText(pollText);
      showStatus('success', 'MSP voting WhatsApp poll template copied to clipboard!');
    } catch (err: any) {
      showStatus('error', 'Error copying MSP poll template: ' + (err.message || err));
    }
  };

  const deleteGame = async (gameId: string) => {
    try {
      const { error } = await supabase.from('games').delete().eq('id', gameId);
      if (error) {
        showStatus('error', 'Could not delete match: ' + error.message);
      } else {
        showStatus('success', 'Match deleted successfully.');
        setDeletingGameId(null);
        fetchData();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error deleting match: ' + (err.message || err));
    }
  };

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
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error updating tokens: ' + (err.message || err));
    } finally {
      setUpdatingTokenId(null);
    }
  };

  const addCashTokens = async (profile: Profile, count = 20) => {
    const current = profile.game_tokens ?? 0;
    await updateTokens(profile.id, current + count);
  };

  const approveUser = async (profileId: string, initialTokens = 2) => {
    setApprovingId(profileId);
    try {
      // First attempt update with game_tokens and is_approved
      let updatePayload: any = { is_approved: true };
      if (initialTokens > 0) {
        updatePayload.game_tokens = initialTokens;
      }
      
      let { error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', profileId);
      
      // Fallback if game_tokens column is not yet in Supabase
      if (error && (error.code === '42703' || error.message?.includes('game_tokens') || error.code === 'PGRST204')) {
        setSqlMigrationNeeded(true);
        const { error: retryError } = await supabase
          .from('profiles')
          .update({ is_approved: true })
          .eq('id', profileId);
        error = retryError;
      }

      if (error) {
        showStatus('error', `Could not approve player: ${error.message}`);
      } else {
        showStatus('success', initialTokens > 0 
          ? `Player approved with ${initialTokens} game tokens credited (Cash payment)!` 
          : 'Player approved successfully.');
        setProfiles(prev => prev.map(p => p.id === profileId ? { 
          ...p, 
          is_approved: true, 
          game_tokens: initialTokens > 0 ? initialTokens : (p.game_tokens ?? 0) 
        } : p));
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error approving player: ' + (err.message || err));
    } finally {
      setApprovingId(null);
    }
  };

  const revokeAccess = async (profileId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id === profileId) {
        showStatus('error', 'You cannot revoke your own admin access privileges.');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ is_approved: false })
        .eq('id', profileId);
      
      if (error) {
        showStatus('error', 'Could not revoke access: ' + error.message);
      } else {
        showStatus('success', 'Player access revoked successfully.');
        setDeletingProfileId(null);
        fetchData();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error revoking access: ' + (err.message || err));
    }
  };

  const renderPaymentStatusFlag = (profile: Profile) => {
    const tokens = profile.game_tokens ?? 0;

    if (!profile.is_approved) {
      return (
        <span 
          title="Payment Status: Pending Approval" 
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 shrink-0"
        >
          <span className="h-2 w-2 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.6)]"></span>
          Pending
        </span>
      );
    }

    if (tokens <= 0) {
      return (
        <span 
          title="Payment Status: Needs Payment (0 credits available)" 
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse shrink-0"
        >
          <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]"></span>
          Needs Payment
        </span>
      );
    }

    if (tokens === 1) {
      return (
        <span 
          title="Payment Status: Low Credits (1 game left — paying soon)" 
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse shrink-0"
        >
          <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]"></span>
          Low (1 Left)
        </span>
      );
    }

    return (
      <span 
        title={`Payment Status: Active / Paid (${tokens} games remaining)`} 
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#00ff66]/10 text-[#00ff66] border border-[#00ff66]/25 shrink-0"
      >
        <span className="h-2 w-2 rounded-full bg-[#00ff66] shadow-[0_0_8px_rgba(0,255,102,0.8)]"></span>
        Active / Paid
      </span>
    );
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pitch"></div></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      {/* Admin Panel Header & Sub-Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-pitch italic">ADMIN PANEL</h1>
          <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Manage games, players and polls.</p>
        </div>

        {/* Sub-Tab Switcher */}
        <div className="flex items-center gap-2 p-1.5 glass-card rounded-full w-fit">
          <button
            onClick={() => { setAdminTab('matches'); onTabChange?.('matches'); }}
            className={cn(
              "px-5 py-2.5 rounded-full font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer",
              adminTab === 'matches'
                ? "bg-white text-black shadow-md shadow-white/10"
                : "text-white/60 hover:text-white"
            )}
          >
            <Flag size={14} />
            Matches
          </button>
          <button
            onClick={() => { setAdminTab('players'); onTabChange?.('players'); }}
            className={cn(
              "px-5 py-2.5 rounded-full font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer",
              adminTab === 'players'
                ? "bg-[#0055FF] text-white shadow-md shadow-[#0055FF]/25"
                : "text-white/60 hover:text-white"
            )}
          >
            <Users size={14} />
            Players Management
          </button>
        </div>
      </div>

      {adminTab === 'players' ? (
        <PlayersManagement onRefreshParent={fetchData} />
      ) : (
        <>

      {statusMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-4 rounded-xl border flex items-start gap-3",
            statusMessage.type === 'error' 
              ? "bg-red-500/10 border-red-500/20 text-red-400" 
              : "bg-[#00ff66]/10 border-[#00ff66]/20 text-[#00ff66]"
          )}
        >
          <div className="flex-1 text-sm font-bold whitespace-pre-line">{statusMessage.text}</div>
          <button onClick={() => setStatusMessage(null)} className="text-white/40 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </motion.div>
      )}

      {sqlMigrationNeeded && (
        <div className="p-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 text-yellow-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-black text-sm">
              <AlertCircle size={16} className="text-yellow-400 shrink-0" />
              <span>Database Migration Required in Supabase</span>
            </div>
            <p className="text-xs text-white/70">
              The <code className="bg-black/40 px-1.5 py-0.5 rounded text-yellow-400 font-mono">game_tokens</code> column has not been added yet. Run Phase 7 in your Supabase SQL Editor to enable token storage.
            </p>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS game_tokens INTEGER NOT NULL DEFAULT 2;');
              showStatus('success', 'SQL copied to clipboard! Paste and run it in Supabase SQL Editor.');
            }}
            className="bg-yellow-500 text-black px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 self-start sm:self-center shrink-0 hover:bg-yellow-400 transition-colors"
          >
            <Copy size={14} /> Copy SQL
          </button>
        </div>
      )}

      {/* Create Game */}
      <section className="space-y-6">
        <h2 className="text-3xl flex items-center gap-2 font-black tracking-tighter">
          <Plus className="text-pitch" /> CREATE NEW GAME
        </h2>
        
        {activeGame ? (
          <div className="bg-yellow-500/10 border border-yellow-500/20 p-6 rounded-2xl flex items-center gap-4">
            <Flag className="text-yellow-500" size={24} />
            <div>
              <p className="font-bold text-yellow-500">Active game in progress</p>
              <p className="text-sm text-white/40">You must finish or delete the current game on {activeGame.date} before creating a new one.</p>
            </div>
          </div>
        ) : (
          <div className="glass-card p-6 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-1">
                <label className="text-xs text-white/40 uppercase font-bold">Date</label>
                <input 
                  type="date" 
                  value={newGameDate}
                  onChange={e => setNewGameDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 focus:border-pitch outline-none" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-white/40 uppercase font-bold">Time</label>
                <input 
                  type="time" 
                  value={newGameTime}
                  onChange={e => setNewGameTime(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 focus:border-pitch outline-none" 
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs text-white/40 uppercase font-bold">Location</label>
                <input 
                  type="text" 
                  value={newGameLocation}
                  onChange={e => setNewGameLocation(e.target.value)}
                  placeholder="e.g. Rivervale (Copley Park)"
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 focus:border-pitch outline-none" 
                />
              </div>
            </div>

            {/* Quick Presets Selection Buttons */}
            <div className="border-t border-white/5 pt-4 space-y-2">
              <label className="text-xs text-white/40 uppercase font-bold block">Quick Actions</label>
              <div className="flex flex-wrap gap-2">
                {games.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const last = games[0];
                      setNewGameLocation(last.location);
                      setNewGameTime(last.time);
                      const nextDate = getNextWeekDateString(last.date);
                      if (nextDate) setNewGameDate(nextDate);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all flex items-center gap-1 font-bold"
                  >
                    🔄 Autofill Next Week Match
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t border-white/5 pt-4">
              <button 
                onClick={() => createGame()}
                className="bg-pitch text-black font-black py-3 px-8 rounded-xl hover:bg-pitch-dark transition-all uppercase tracking-wider text-sm flex items-center gap-2"
              >
                <Plus size={16} /> Create Game
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Active Games */}
      <section className="space-y-6">
        <h2 className="text-3xl flex items-center gap-2 font-black tracking-tighter uppercase">
          <Flag className="text-pitch" /> Active Match
        </h2>
        <div className="space-y-4">
          {activeGames.map(game => (
            <div key={game.id} className="glass-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 neon-border">
              <div className="space-y-1">
                <div className="font-black text-xl tracking-tight">{game.date}</div>
                <div className="text-sm text-white/40 font-bold uppercase tracking-widest">
                  {game.location} @ {formatTime(game.time)}
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <span className={cn(
                  "text-[10px] uppercase font-black px-3 py-1 rounded-full tracking-tighter",
                  game.status === 'open' ? "bg-pitch text-black" :
                  game.status === 'closed' ? "bg-yellow-500 text-black" :
                  game.status === 'voting' ? "bg-blue-500 text-black" :
                  "bg-white/10 text-white/40"
                )}>
                  {game.status}
                </span>

                {game.status === 'open' && (
                  <>
                    <button 
                      onClick={() => copyPublicLink(game)} 
                      className="bg-blue-500/10 text-blue-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-500/20 transition-all flex items-center gap-2"
                    >
                      <Share2 size={14} /> Share Live List
                    </button>
                    <button 
                      onClick={() => updateGameStatus(game.id, 'closed')} 
                      className="bg-white/10 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/20 transition-all flex items-center gap-2"
                    >
                      <X size={14} /> Close RSVP
                    </button>
                    <button 
                      onClick={() => {
                        if (window.confirm('Are you sure you want to finish this match directly? This will end the game immediately and skip the MVP & MSP voting phase.')) {
                          updateGameStatus(game.id, 'finished');
                        }
                      }} 
                      className="bg-highlight/10 text-highlight px-4 py-2 rounded-xl text-xs font-bold hover:bg-highlight/20 transition-all flex items-center gap-2"
                    >
                      <Check size={14} /> Finish Match
                    </button>
                  </>
                )}

                {game.status === 'closed' && (
                  <>
                    <button 
                      onClick={() => drawTeams(game.id)} 
                      className="bg-pitch text-black px-4 py-2 rounded-xl text-xs font-bold hover:bg-pitch-dark transition-all flex items-center gap-2"
                    >
                      <Share2 size={14} /> Draw Teams
                    </button>
                    <button 
                      onClick={() => updateGameStatus(game.id, 'voting')} 
                      className="bg-pitch text-black px-4 py-2 rounded-xl text-xs font-bold hover:bg-pitch-dark transition-all flex items-center gap-2"
                    >
                      <Trophy size={14} /> Start MVP & MSP Voting
                    </button>
                    <button 
                      onClick={() => {
                        if (window.confirm('Are you sure you want to finish this match directly? This will end the game immediately and skip the MVP & MSP voting phase.')) {
                          updateGameStatus(game.id, 'finished');
                        }
                      }} 
                      className="bg-highlight/10 text-highlight px-4 py-2 rounded-xl text-xs font-bold hover:bg-highlight/20 transition-all flex items-center gap-2"
                    >
                      <Check size={14} /> Finish Match
                    </button>
                  </>
                )}

                {game.status === 'voting' && (
                  <>
                    <button 
                      onClick={() => copyMVPPoll(game)} 
                      className="bg-blue-500/10 text-blue-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-500/20 transition-all flex items-center gap-2"
                    >
                      <Trophy size={14} /> Copy MVP Poll
                    </button>
                    <button 
                      onClick={() => updateGameStatus(game.id, 'finished')} 
                      className="bg-highlight text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-600 transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(255,59,48,0.3)]"
                    >
                      <Check size={14} /> Close Voting & End Match
                    </button>
                  </>
                )}

                {deletingGameId === game.id ? (
                  <div className="flex items-center gap-2 bg-red-500/10 p-2 rounded-xl border border-red-500/20">
                    <span className="text-[10px] font-bold text-red-500 uppercase">Do you really want to delete?</span>
                    <button 
                      onClick={() => deleteGame(game.id)} 
                      className="bg-red-500 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-red-600 transition-all"
                    >
                      Yes, Proceed
                    </button>
                    <button 
                      onClick={() => setDeletingGameId(null)} 
                      className="bg-white/10 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-white/20 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setDeletingGameId(game.id)} 
                    className="p-2 text-white/20 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {activeGames.length === 0 && <p className="text-white/20 italic text-center py-10">No active games.</p>}
        </div>
      </section>

      {/* Match History */}
      <section className="space-y-6">
        <h2 className="text-3xl flex items-center gap-2 font-black tracking-tighter uppercase">
          <Trophy className="text-pitch" /> Match History
        </h2>
        <div className="space-y-4">
          {historyGames.map(game => (
            <div key={game.id} className="glass-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 opacity-60 hover:opacity-100 transition-opacity">
              <div className="space-y-2">
                <div className="font-black text-xl tracking-tight">{game.date}</div>
                <div className="text-sm text-white/40 font-bold uppercase tracking-widest">
                  {game.location}
                </div>
                <div className="flex flex-col gap-1.5 mt-2 text-xs font-bold uppercase tracking-wider">
                  <div className="text-blue-400 flex items-center gap-2">
                    <Trophy size={14} className="text-yellow-500" />
                    <span>MVP: {game.mvp_winner || 'N/A'}</span>
                  </div>
                  <div className="text-red-400 flex items-center gap-2">
                    <Frown size={14} className="text-red-500" />
                    <span>MSP: {game.msp_winner || 'N/A'}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                {deletingGameId === game.id ? (
                  <div className="flex items-center gap-2 bg-red-500/10 p-2 rounded-xl border border-red-500/20">
                    <span className="text-[10px] font-bold text-red-500 uppercase">Delete history?</span>
                    <button 
                      onClick={() => deleteGame(game.id)} 
                      className="bg-red-500 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-red-600 transition-all"
                    >
                      Yes, Proceed
                    </button>
                    <button 
                      onClick={() => setDeletingGameId(null)} 
                      className="bg-white/10 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-white/20 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setDeletingGameId(game.id)} 
                    className="p-2 text-white/20 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {historyGames.length === 0 && <p className="text-white/20 italic text-center py-10">No match history yet.</p>}
        </div>
      </section>

      </>
    )}
    </div>
  );
}
