import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Game, RSVP, Profile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapPin, 
  Clock, 
  Trophy, 
  CheckCircle2, 
  Shuffle, 
  Loader2, 
  BarChart3, 
  Users, 
  ExternalLink, 
  Check, 
  RotateCw, 
  X, 
  Frown, 
  Share2, 
  Ticket, 
  AlertCircle,
  Copy,
  Mail
} from 'lucide-react';
import { cn, formatTime, formatDate, formatRsvpTime } from '../lib/utils';

interface PublicGameViewProps {
  gameId: string;
}

interface Vote {
  id: string;
  game_id: string;
  voter_id: string;
  candidate_id: string;
}

const MVP_PHRASES = [
  "carried the entire team on their back tonight. 💪🏆",
  "Absolute masterclass from start to finish. ✨⚽️",
  "The undisputed king of the pitch tonight. 👑🔥",
  "Turned the game into their own personal highlight reel. 📹🌟",
  "Pure class in every single touch. 🪄👌",
  "They aren't just playing the game, they're running it. ⚙️🧠",
  "Unstoppable force from the first whistle to the last. ⚡️🏃‍♂️",
  "Made a difficult game look effortlessly easy. 😎🎖️",
  "The definition of a game-changer tonight. 💥🚀",
  "Give them the trophy already, no contest. 🥇🤝"
];

const MSP_PHRASES = [
  "Played like they forgot which sport we were playing. 😅🏌️‍♂️",
  "An absolute disasterclass from start to finish. 🤦‍♂️📉",
  "The opposition’s best defender was actually on our team. 🙄🛑",
  "Spent more time on the grass than the ball did. 🌱🛌",
  "A walking, talking turnover machine tonight. 🔄🎭",
  "They’d have trouble finding the back of the net in an empty stadium. 🥅💨",
  "Running around like a headless chicken out there. 🐔💨",
  "Pretty sure they were playing for the wrong team. 🤔👐",
  "If missing passes was an art form, they'd be Picasso. 🎨🤦",
  "The only thing they successfully defended tonight was their own shadow. 👤🛡️"
];

const getStablePhrase = (phrases: string[], playerId: string, gameId: string) => {
  if (!playerId) return phrases[0];
  const combinedStr = `${gameId}-${playerId}`;
  let hash = 0;
  for (let i = 0; i < combinedStr.length; i++) {
    hash = (hash << 5) - hash + combinedStr.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  const idx = Math.abs(hash) % phrases.length;
  return phrases[idx];
};

export default function PublicGameView({ gameId }: PublicGameViewProps) {
  const [game, setGame] = useState<Game | null>(null);
  const [rsvps, setRsvps] = useState<RSVP[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [mspVotes, setMspVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const [rsvpMessage, setRsvpMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [voteMessage, setVoteMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [showNoTokensModal, setShowNoTokensModal] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [copiedPayId, setCopiedPayId] = useState(false);

  const handleCopyPayID = async () => {
    try {
      await navigator.clipboard.writeText("charley.moraes@gmail.com");
      setCopiedPayId(true);
      setTimeout(() => setCopiedPayId(false), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  // Mobile segmented tabs
  const [mobileSquadTab, setMobileSquadTab] = useState<'teams' | 'confirmed' | 'waiting' | 'declined'>('confirmed');
  const [mobileVoteTab, setMobileVoteTab] = useState<'mvp' | 'msp'>('mvp');

  const fetchRSVPs = async () => {
    const { data, error } = await supabase
      .from('rsvps')
      .select('*')
      .eq('game_id', gameId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching RSVPs:', error);
      return;
    }

    if (data) {
      const userIds = data.map(r => r.user_id);
      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds);

        if (profilesError) {
          console.error('Error fetching profiles for RSVPs:', profilesError);
          const merged = data.map(r => ({ ...r, profiles: null }));
          setRsvps(merged as any);
        } else {
          const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
          const merged = data.map(r => ({
            ...r,
            profiles: profilesMap.get(r.user_id) || null
          }));
          setRsvps(merged as any);
        }
      } else {
        setRsvps([]);
      }
    }
  };

  const fetchVotes = async () => {
    const { data, error } = await supabase
      .from('votes')
      .select('*')
      .eq('game_id', gameId);

    if (error) console.error('Error fetching votes:', error);
    if (data) setVotes(data);
  };

  const fetchMspVotes = async () => {
    const { data, error } = await supabase
      .from('msp_votes')
      .select('*')
      .eq('game_id', gameId);

    if (error) {
      console.warn('Error fetching msp_votes:', error);
      return;
    }
    if (data) setMspVotes(data);
  };

  const fetchCurrentUserProfile = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (data) {
        const tokens = (data.game_tokens !== null && data.game_tokens !== undefined) ? data.game_tokens : 2;
        setCurrentUserProfile({
          ...data,
          is_approved: data.is_approved ?? true,
          game_tokens: tokens
        });
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  };

  const fetchGameData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();

      if (gameError) throw gameError;
      setGame(gameData);
      if (gameData) {
        document.title = `Live Match Centre • ${gameData.location}`;
      }
      await Promise.all([fetchRSVPs(), fetchVotes(), fetchMspVotes()]);
      if (currentUser?.id) {
        await fetchCurrentUserProfile(currentUser.id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    const locationName = game?.location || 'PSG Perth';
    const matchDate = game ? formatDate(game.date) : '';
    const matchTime = game ? formatTime(game.time) : '';
    const shareText = `⚽ PSG PERTH MATCH SQUAD\n📍 ${locationName}\n📅 ${matchDate} at ${matchTime}\n\nCheck the live team sheet and RSVP:\n${url}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `PSG Perth • ${locationName}`,
          text: shareText,
          url: url,
        });
        return;
      } catch (err) {
        // User cancelled or share failed, fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 3000);
    } catch (clipErr) {
      console.error('Could not copy to clipboard:', clipErr);
    }
  };

  const handleRSVPAction = async (going: boolean) => {
    if (!currentUser) {
      window.location.href = '/';
      return;
    }

    if (currentUserProfile && !currentUserProfile.is_approved) {
      setRsvpMessage({ type: 'error', text: 'Your account is pending approval by an admin.' });
      return;
    }

    // Token check: All players must have at least 1 game token to RSVP "I'M IN"
    if (going) {
      const localTokens = currentUserProfile?.game_tokens ?? 0;
      if (localTokens <= 0) {
        setShowNoTokensModal(true);
        setRsvpMessage({ 
          type: 'error', 
          text: 'You have 0 game tokens remaining. Please contact President/Admin Charley Moraes to pay and get 20 more games added.' 
        });
        return;
      }

      let currentTokens = localTokens;
      try {
        const { data: freshProf } = await supabase
          .from('profiles')
          .select('game_tokens')
          .eq('id', currentUser.id)
          .single();
        if (freshProf && freshProf.game_tokens !== undefined && freshProf.game_tokens !== null) {
          currentTokens = freshProf.game_tokens;
          setCurrentUserProfile(prev => prev ? { ...prev, game_tokens: freshProf.game_tokens } : prev);
        }
      } catch (tokFetchErr) {
        console.warn('Could not fetch fresh tokens:', tokFetchErr);
      }

      if (currentTokens <= 0) {
        setShowNoTokensModal(true);
        setRsvpMessage({ 
          type: 'error', 
          text: 'You have 0 game tokens remaining. Please contact President/Admin Charley Moraes to pay and get 20 more games added.' 
        });
        return;
      }
    }

    setActionLoading(true);
    setRsvpMessage(null);
    try {
      // Fetch fresh data to avoid stale state issues
      const { data: currentRSVPs, error: fetchError } = await supabase
        .from('rsvps')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      
      const latestRSVPs = currentRSVPs || [];
      const existingRSVP = latestRSVPs.find(r => r.user_id === currentUser.id);
      
      if (going) {
        // Handle "I'M IN"
        if (existingRSVP && (existingRSVP.status === 'confirmed' || existingRSVP.status === 'waiting')) {
          setRsvpMessage({ type: 'success', text: "You're already on the squad!" });
          return;
        }

        const confirmedCount = latestRSVPs.filter((r: any) => r.status === 'confirmed').length;
        const newStatus = confirmedCount < 22 ? 'confirmed' : 'waiting';

        if (existingRSVP) {
          const { error: updateError } = await supabase
            .from('rsvps')
            .update({ status: newStatus, created_at: new Date().toISOString() })
            .eq('id', existingRSVP.id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from('rsvps').insert({
            game_id: gameId,
            user_id: currentUser.id,
            status: newStatus
          });
          if (insertError) throw insertError;
        }

        // If player is directly confirmed into the squad, deduct 1 game token
        const currentTokens = currentUserProfile?.game_tokens ?? 0;
        if (newStatus === 'confirmed' && currentTokens > 0) {
          try {
            await supabase
              .from('profiles')
              .update({ game_tokens: currentTokens - 1 })
              .eq('id', currentUser.id);
            setCurrentUserProfile(prev => prev ? { ...prev, game_tokens: currentTokens - 1 } : prev);
          } catch (tokDeductErr) {
            console.warn('Could not deduct token:', tokDeductErr);
          }
        }

        if (newStatus === 'confirmed') {
          if (currentTokens === 1) {
            setRsvpMessage({ 
              type: 'success', 
              text: "You're on it! ⚠️ That was your final game token (0 tokens remaining). Top-up rate: $20 = 10 games/tokens. Please contact Admin before your next match!" 
            });
          } else {
            setRsvpMessage({ 
              type: 'success', 
              text: `You're on the team sheet! 1 game token used (${Math.max(0, currentTokens - 1)} remaining).` 
            });
          }
        } else {
          setRsvpMessage({ type: 'success', text: 'Added to waiting list. Token will only be deducted if you get promoted to confirmed squad.' });
        }
      } else {
        // Handle "I'M OUT"
        if (existingRSVP && existingRSVP.status === 'declined') {
          setRsvpMessage({ type: 'success', text: "You've already declined." });
          return;
        }

        const wasConfirmed = existingRSVP?.status === 'confirmed';

        // Try to update to 'declined'. If this fails due to DB constraint, fallback to delete.
        const { error: updateError } = await (existingRSVP 
          ? supabase.from('rsvps').update({ status: 'declined' }).eq('id', existingRSVP.id)
          : supabase.from('rsvps').insert({ game_id: gameId, user_id: currentUser.id, status: 'declined' }));

        if (updateError) {
          if (updateError.message.includes('violates check constraint') || updateError.message.includes('check constraint "rsvps_status_check"')) {
            if (existingRSVP) {
              const { error: deleteError } = await supabase.from('rsvps').delete().eq('id', existingRSVP.id);
              if (deleteError) throw deleteError;
              setRsvpMessage({ type: 'success', text: 'Successfully withdrew your RSVP.' });
            } else {
              setRsvpMessage({ type: 'success', text: 'Already out.' });
            }
          } else {
            throw updateError;
          }
        } else {
          setRsvpMessage({ type: 'success', text: 'Marked as OUT (Not Playing). Updated in the live feed.' });
          setMobileSquadTab('declined');
        }

        // Refund token if a confirmed player cancels
        if (wasConfirmed) {
          try {
            const { data: freshP } = await supabase.from('profiles').select('game_tokens').eq('id', currentUser.id).single();
            const curr = freshP?.game_tokens ?? currentUserProfile?.game_tokens ?? 0;
            await supabase.from('profiles').update({ game_tokens: curr + 1 }).eq('id', currentUser.id);
            setCurrentUserProfile(prev => prev ? { ...prev, game_tokens: curr + 1 } : prev);
          } catch (tokRefundErr) {
            console.warn('Could not refund token:', tokRefundErr);
          }
        }

        // Manual Promotion: If a confirmed player withdraws, promote the first waiting player
        if (wasConfirmed && game?.status === 'open') {
          const firstWaiting = latestRSVPs.find((r: any) => r.status === 'waiting');
          if (firstWaiting) {
            await supabase.from('rsvps').update({ status: 'confirmed' }).eq('id', firstWaiting.id);
            // Deduct token from promoted player
            try {
              const { data: promotedP } = await supabase.from('profiles').select('game_tokens').eq('id', firstWaiting.user_id).single();
              if (promotedP && promotedP.game_tokens && promotedP.game_tokens > 0) {
                await supabase.from('profiles').update({ game_tokens: promotedP.game_tokens - 1 }).eq('id', firstWaiting.user_id);
              }
            } catch (promoErr) {
              console.warn('Could not deduct token from promoted player:', promoErr);
            }
          }
        }
      }
      
      await fetchRSVPs();
      setTimeout(() => setRsvpMessage(null), 6000);
    } catch (err: any) {
      setRsvpMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    // Dynamically enforce ⚽ favicon for Live Data Feed pages 
    const setDynamicFavicon = () => {
      const link = (document.querySelector("link[rel*='icon']") as HTMLLinkElement) || document.createElement('link');
      link.type = 'image/svg+xml';
      link.rel = 'icon';
      link.href = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚽</text></svg>`;
      document.getElementsByTagName('head')[0].appendChild(link);
    };
    setDynamicFavicon();

    let profileSubscription: any = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
      if (user) {
        fetchCurrentUserProfile(user.id);

        profileSubscription = supabase
          .channel(`public_profile_${user.id}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`
          }, (payload) => {
            if (payload.new) {
              setCurrentUserProfile(payload.new as Profile);
            }
          })
          .subscribe();
      }
    });

    fetchGameData();

    // Realtime subscriptions
    const rsvpSubscription = supabase
      .channel(`public_rsvps_${gameId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'rsvps',
        filter: `game_id=eq.${gameId}`
      }, () => {
        fetchRSVPs();
      })
      .subscribe();

    const gameSubscription = supabase
      .channel(`public_game_${gameId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'games',
        filter: `id=eq.${gameId}`
      }, (payload) => {
        const updatedGame = payload.new as Game;
        setGame(updatedGame);
        if (updatedGame) {
          document.title = `Live Match Centre • ${updatedGame.location}`;
        }
      })
      .subscribe();

    const voteSubscription = supabase
      .channel(`public_votes_${gameId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'votes',
        filter: `game_id=eq.${gameId}`
      }, () => {
        fetchVotes();
      })
      .subscribe();

    const mspVoteSubscription = supabase
      .channel(`public_msp_votes_${gameId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'msp_votes',
        filter: `game_id=eq.${gameId}`
      }, () => {
        fetchMspVotes();
      })
      .subscribe();

    return () => {
      if (profileSubscription) profileSubscription.unsubscribe();
      rsvpSubscription.unsubscribe();
      gameSubscription.unsubscribe();
      voteSubscription.unsubscribe();
      mspVoteSubscription.unsubscribe();
    };
  }, [gameId]);

  const handleVote = async (candidateId: string) => {
    setVoteMessage(null);
    if (!currentUser) {
      setVoteMessage({ type: 'error', text: 'Please log in to cast your vote!' });
      window.location.href = '/';
      return;
    }

    if (game?.status !== 'voting') {
      setVoteMessage({ type: 'error', text: 'Voting is not open yet!' });
      return;
    }

    // Eligibility check: Only confirmed players can vote
    const isPlayerConfirmed = confirmed.some(r => r.user_id === currentUser.id);
    if (!isPlayerConfirmed) {
      setVoteMessage({ type: 'error', text: 'Only players confirmed for this match can vote!' });
      return;
    }

    // Cannot vote for self
    if (candidateId === currentUser.id) {
      setVoteMessage({ type: 'error', text: 'You cannot vote for yourself!' });
      return;
    }

    // Cannot vote for same candidate as MSP
    const myMspVote = mspVotes.find(v => v.voter_id === currentUser.id);
    if (myMspVote && myMspVote.candidate_id === candidateId) {
      setVoteMessage({ type: 'error', text: 'You cannot vote for your MSP choice as MVP!' });
      return;
    }

    setActionLoading(true);
    try {
      const { error } = await supabase.from('votes').insert({
        game_id: gameId,
        voter_id: currentUser.id,
        candidate_id: candidateId
      });
      if (error) throw error;
      setVoteMessage({ type: 'success', text: 'MVP vote cast successfully!' });
      fetchVotes();
      setTimeout(() => setVoteMessage(null), 5000);
    } catch (err: any) {
      setVoteMessage({ 
        type: 'error', 
        text: err.code === '23505' ? 'You have already voted!' : err.message 
      });
      setTimeout(() => setVoteMessage(null), 5000);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMspVote = async (candidateId: string) => {
    setVoteMessage(null);
    if (!currentUser) {
      setVoteMessage({ type: 'error', text: 'Please log in to cast your vote!' });
      window.location.href = '/';
      return;
    }

    if (game?.status !== 'voting') {
      setVoteMessage({ type: 'error', text: 'Voting is not open yet!' });
      return;
    }

    // Eligibility check: Only confirmed players can vote
    const isPlayerConfirmed = confirmed.some(r => r.user_id === currentUser.id);
    if (!isPlayerConfirmed) {
      setVoteMessage({ type: 'error', text: 'Only players confirmed for this match can vote!' });
      return;
    }

    // Cannot vote for same candidate as MVP
    const myVote = votes.find(v => v.voter_id === currentUser?.id);
    if (myVote && myVote.candidate_id === candidateId) {
      setVoteMessage({ type: 'error', text: 'You cannot vote for your MVP choice as the Most Shitty Player!' });
      return;
    }

    setActionLoading(true);
    try {
      const { error } = await supabase.from('msp_votes').insert({
        game_id: gameId,
        voter_id: currentUser.id,
        candidate_id: candidateId
      });
      if (error) throw error;
      setVoteMessage({ type: 'success', text: 'MSP vote cast successfully!' });
      fetchMspVotes();
      setTimeout(() => setVoteMessage(null), 5000);
    } catch (err: any) {
      setVoteMessage({ 
        type: 'error', 
        text: err.code === '23505' ? 'You have already voted for MSP!' : err.message 
      });
      setTimeout(() => setVoteMessage(null), 5000);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="animate-spin text-pitch" size={40} />
        <p className="text-white/50 font-black tracking-widest text-xs uppercase">Entering Match Centre...</p>
      </div>
    </div>
  );

  if (error || !game) return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
      <div className="space-y-4 max-w-sm">
        <h1 className="text-2xl font-black text-white/50 italic tracking-tighter">MATCH NOT FOUND</h1>
        <p className="text-white/30 text-xs leading-relaxed">This match might have been deleted or the link is incorrect.</p>
        <button 
          onClick={() => window.location.href = '/'} 
          className="bg-white text-black px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider hover:bg-white/90 transition-all cursor-pointer"
        >
          Return to PSG Perth
        </button>
      </div>
    </div>
  );

  const confirmed = rsvps.filter(r => r.status === 'confirmed');
  const waiting = rsvps.filter(r => r.status === 'waiting');
  const declined = rsvps.filter(r => r.status === 'declined');
  const myVote = votes.find(v => v.voter_id === currentUser?.id);
  const myMspVote = mspVotes.find(v => v.voter_id === currentUser?.id);

  const getVoteCount = (playerId: string) => votes.filter(v => v.candidate_id === playerId).length;
  const maxVotes = Math.max(...confirmed.map(p => getVoteCount(p.user_id)), 1);
  const getMspVoteCount = (playerId: string) => mspVotes.filter(v => v.candidate_id === playerId).length;

  // Find overall MVP Winner(s)
  const mvpWinners = (() => {
    if (confirmed.length === 0 || votes.length === 0) return [];
    const counts = confirmed.map(p => ({ player: p, count: getVoteCount(p.user_id) }));
    const max = Math.max(...counts.map(c => c.count));
    if (max === 0) return [];
    return counts.filter(c => c.count === max).map(c => c.player);
  })();

  // Find overall MSP Winner(s)
  const mspWinners = (() => {
    if (confirmed.length === 0 || mspVotes.length === 0) return [];
    const counts = confirmed.map(p => ({ player: p, count: getMspVoteCount(p.user_id) }));
    const max = Math.max(...counts.map(c => c.count));
    if (max === 0) return [];
    return counts.filter(c => c.count === max).map(c => c.player);
  })();

  const userTokens = currentUserProfile?.game_tokens ?? 0;
  const isOutOfTokens = userTokens <= 0;
  const isOneTokenLeft = userTokens === 1;
  const hasTeams = game.team_a && game.team_a.length > 0;

  const currentUserRSVP = currentUser ? rsvps.find(r => r.user_id === currentUser.id) : null;
  const isConfirmed = currentUserRSVP?.status === 'confirmed';
  const isWaiting = currentUserRSVP?.status === 'waiting';
  const isDeclined = currentUserRSVP?.status === 'declined';

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-[#00ff66] selection:text-black overflow-x-hidden pb-16">
      {/* Sticky Mobile-Optimized Top Bar */}
      <header className="bg-black/90 border-b border-white/10 px-3.5 sm:px-6 py-2.5 sm:py-3 sticky top-0 z-40 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          {/* Logo & Live Status Indicator */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <a href="/" className="text-lg sm:text-xl font-black italic tracking-tighter text-white hover:opacity-80 transition-opacity">
              PSG PERTH
            </a>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-[9px] sm:text-[10px] font-black uppercase text-red-400 tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </div>
          </div>

          {/* Action Bar (Share, Refresh, Auth Navigation) */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {/* Native Mobile Share Button */}
            <button
              type="button"
              onClick={handleShare}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors flex items-center justify-center cursor-pointer"
              title="Share match link"
              aria-label="Share match link"
            >
              <Share2 size={16} />
            </button>

            {/* Refresh Button */}
            <button 
              type="button"
              onClick={() => fetchGameData(true)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors flex items-center justify-center cursor-pointer"
              title="Refresh Live Data"
              aria-label="Refresh Live Data"
            >
              <RotateCw size={16} className={cn(refreshing && "animate-spin text-pitch")} />
            </button>

            {/* User Navigation Button */}
            {!currentUser ? (
              <button 
                type="button"
                onClick={() => window.location.href = '/'}
                className="text-[10px] sm:text-xs font-black uppercase tracking-wider bg-white text-black px-3.5 sm:px-5 py-2 rounded-xl hover:bg-white/90 transition-all font-bold cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.15)]"
              >
                Sign In
              </button>
            ) : (
              <button 
                type="button"
                onClick={() => window.location.href = '/'}
                className="text-[10px] sm:text-xs font-black uppercase tracking-wider bg-white/10 text-white hover:bg-white/20 border border-white/20 px-3 sm:px-4 py-2 rounded-xl transition-all font-bold cursor-pointer"
              >
                Open App
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container - Fully Fluid & Screen Padded */}
      <main className="max-w-6xl mx-auto px-3.5 sm:px-6 md:px-10 py-5 sm:py-8 space-y-6 sm:space-y-10">
        
        {/* Match Hero Section */}
        <section className="space-y-4 sm:space-y-6">
          {/* Status & Date Tag Row */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className={cn(
              "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full",
              game.status === 'open' ? "bg-emerald-500 text-black font-black" : 
              game.status === 'voting' ? "bg-blue-500 text-white font-black" : "bg-yellow-500 text-black font-black"
            )}>
              {game.status === 'open' ? 'SQUAD OPEN' : game.status.toUpperCase()}
            </span>
            <span className="text-white/60 text-[11px] sm:text-xs font-bold uppercase tracking-wider">
              {formatDate(game.date)}
            </span>
          </div>

          {/* Location Title - Responsive Mobile Typography */}
          <h1 className="text-3xl sm:text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter italic leading-none break-words uppercase text-white">
            {game.location}
          </h1>

          {/* Quick Match Meta Chips (Touch & Mobile Friendly) */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-bold uppercase tracking-wider">
            {/* Interactive Map Pin */}
            <a 
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${game.location}, Perth WA`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-pitch hover:bg-pitch/10 text-white/80 hover:text-pitch transition-all group cursor-pointer"
              title="Navigate on Google Maps"
            >
              <MapPin size={14} className="text-white/60 group-hover:text-pitch transition-colors" />
              <span className="truncate max-w-[200px] sm:max-w-none">{game.location}</span>
              <ExternalLink size={11} className="opacity-40 group-hover:opacity-100" />
            </a>

            {/* Match Time */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/80">
              <Clock size={14} className="text-white/50" />
              <span>{formatTime(game.time)}</span>
            </div>

            {/* Confirmed Count Badge */}
            <div className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-black",
              confirmed.length >= 22 
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" 
                : "bg-white/5 border-white/10 text-white/90"
            )}>
              <Users size={14} className={confirmed.length >= 22 ? "text-emerald-400" : "text-white/50"} />
              <span>{confirmed.length} / 22 Confirmed</span>
            </div>

            {/* Waitlist count if any */}
            {waiting.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMobileSquadTab('waiting');
                  document.getElementById('squad-tabs-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold hover:bg-amber-500/25 transition-all cursor-pointer"
                title="View waitlisted players"
              >
                <Shuffle size={13} />
                <span>{waiting.length} Waiting</span>
              </button>
            )}

            {/* Said NO / Not Going count badge */}
            <button
              type="button"
              onClick={() => {
                setMobileSquadTab('declined');
                document.getElementById('squad-tabs-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer",
                declined.length > 0
                  ? "bg-red-500/15 border-red-500/30 text-red-400 font-bold hover:bg-red-500/25"
                  : "bg-white/5 border-white/10 text-white/60 hover:text-white"
              )}
              title="View players who said NO / declined"
            >
              <X size={13} className={declined.length > 0 ? "text-red-400" : "text-white/40"} />
              <span>{declined.length} Not Going</span>
            </button>

            {/* Current Player Token Pill (if logged in) */}
            {currentUser && (
              <button
                type="button"
                onClick={() => {
                  if (isOutOfTokens) setShowNoTokensModal(true);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer",
                  isOutOfTokens
                    ? "bg-red-500/15 border-red-500/40 text-red-400 animate-pulse font-black"
                    : isOneTokenLeft
                      ? "bg-amber-500/15 border-amber-500/30 text-amber-300 font-black"
                      : "bg-white/5 border-white/10 text-white/70 hover:text-white"
                )}
                title={isOutOfTokens ? "Tap for token top-up instructions" : "Your active game tokens"}
              >
                <Ticket size={14} className={isOutOfTokens ? "text-red-400" : isOneTokenLeft ? "text-amber-400" : "text-pitch"} />
                <span>
                  {isOutOfTokens ? "0 Tokens • Top Up" : `${userTokens} ${userTokens === 1 ? 'Token' : 'Tokens'}`}
                </span>
              </button>
            )}
          </div>
        </section>

        {/* Winner Highlight Banners (if MVP or MSP declared) */}
        {(game.mvp_winner || game.msp_winner) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {game.mvp_winner && (() => {
              const mvpWinnerPlayer = confirmed.find(p => p.profiles?.full_name?.toLowerCase() === game.mvp_winner?.toLowerCase());
              const mvpWinnerUserId = mvpWinnerPlayer?.user_id || mvpWinners[0]?.user_id || '';
              const mvpPhrase = getStablePhrase(MVP_PHRASES, mvpWinnerUserId, game.id);
              return (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white text-black p-4 sm:p-6 rounded-3xl flex flex-col items-center text-center space-y-2 shadow-[0_0_40px_rgba(255,255,255,0.15)]"
                >
                  <Trophy size={32} className="text-blue-600 animate-bounce" />
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black/50">Player of the Match</p>
                    <h2 className="text-xl sm:text-2xl font-black italic tracking-tighter uppercase">{game.mvp_winner}</h2>
                    <p className="text-xs font-bold text-black/70 leading-relaxed italic max-w-xs pt-0.5">
                      "{mvpPhrase}"
                    </p>
                  </div>
                </motion.div>
              );
            })()}

            {game.msp_winner && (() => {
              const mspWinnerPlayer = confirmed.find(p => p.profiles?.full_name?.toLowerCase() === game.msp_winner?.toLowerCase());
              const mspWinnerUserId = mspWinnerPlayer?.user_id || mspWinners[0]?.user_id || '';
              const mspPhrase = getStablePhrase(MSP_PHRASES, mspWinnerUserId, game.id);
              return (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-red-500/10 text-red-500 p-4 sm:p-6 rounded-3xl flex flex-col items-center text-center space-y-2 border border-red-500/30 shadow-[0_0_40px_rgba(239,68,68,0.1)]"
                >
                  <Frown size={32} className="text-red-500 animate-pulse" />
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400/70">Most Shitty Player</p>
                    <h2 className="text-xl sm:text-2xl font-black italic tracking-tighter text-white uppercase">{game.msp_winner}</h2>
                    <p className="text-xs font-bold text-white/80 leading-relaxed italic max-w-xs pt-0.5">
                      "{mspPhrase}"
                    </p>
                  </div>
                </motion.div>
              );
            })()}
          </div>
        )}

        {/* Dynamic RSVP Action Card - Optimized for Mobile Thumbs */}
        {game.status === 'open' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 sm:p-6 md:p-8 rounded-3xl border border-white/10 bg-white/5 relative overflow-hidden backdrop-blur-xl shadow-2xl"
          >
            <div className="absolute top-0 left-0 w-1.5 h-full bg-[#00ff66]" />
            
            <div className="space-y-4 sm:space-y-5">
              {/* Card Header & Player Status */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <h3 className="text-[10px] sm:text-xs font-black tracking-widest text-[#00ff66] uppercase flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#00ff66] animate-pulse" />
                    Match RSVP
                  </h3>
                  {currentUser && (
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                      isOutOfTokens
                        ? "bg-red-500/20 text-red-400 border-red-500/30"
                        : isOneTokenLeft
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                          : "bg-white/10 text-white/70 border-white/10"
                    )}>
                      {userTokens} {userTokens === 1 ? 'Token' : 'Tokens'} Left
                    </span>
                  )}
                </div>

                {currentUser ? (
                  <div className="space-y-1">
                    <p className="text-lg sm:text-xl font-bold flex flex-wrap items-center gap-2 text-white">
                      <span>Hello, {currentUserProfile?.full_name || currentUser.email?.split('@')[0]}!</span>
                      {(() => {
                        const myRSVP = rsvps.find(r => r.user_id === currentUser.id);
                        if (myRSVP?.status === 'confirmed') {
                          const idx = confirmed.findIndex(r => r.user_id === currentUser.id);
                          return (
                            <span className="text-[#00ff66] bg-[#00ff66]/15 border border-[#00ff66]/30 text-xs px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                              Confirmed #{idx !== -1 ? idx + 1 : ''}
                            </span>
                          );
                        } else if (myRSVP?.status === 'waiting') {
                          const idx = waiting.findIndex(r => r.user_id === currentUser.id);
                          return (
                            <span className="text-yellow-400 bg-yellow-400/15 border border-yellow-400/30 text-xs px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                              Waitlist #{idx !== -1 ? idx + 1 : ''}
                            </span>
                          );
                        } else if (myRSVP?.status === 'declined') {
                          return (
                            <span className="text-red-400 bg-red-500/15 border border-red-500/30 text-xs px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                              Declined (OUT)
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </p>
                    <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                      {(() => {
                        const myRSVP = rsvps.find(r => r.user_id === currentUser.id);
                        if (!myRSVP) return "Select your status below to claim your spot in the squad.";
                        if (myRSVP.status === 'confirmed') {
                          const idx = confirmed.findIndex(r => r.user_id === currentUser.id);
                          return `🎉 You are locked in on the squad sheet (Spot #${idx !== -1 ? idx + 1 : 1}).`;
                        }
                        if (myRSVP.status === 'waiting') {
                          const idx = waiting.findIndex(r => r.user_id === currentUser.id);
                          return `⏳ You are #${idx !== -1 ? idx + 1 : 1} on the waiting list. You will be automatically moved in if someone cancels.`;
                        }
                        return "❌ You are currently listed as OUT. Tap I'M IN if your plans changed!";
                      })()}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-base sm:text-lg font-bold text-white">Join This Tuesday's Match</p>
                    <p className="text-xs sm:text-sm text-white/50">Log in or sign up in seconds to reserve your spot on the team sheet.</p>
                  </div>
                )}
              </div>

              {/* Out of Tokens Warning Banner */}
              {currentUser && isOutOfTokens && (
                <div 
                  onClick={() => setShowNoTokensModal(true)}
                  className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 cursor-pointer hover:bg-red-500/15 transition-all group"
                >
                  <div className="flex items-center gap-2.5">
                    <AlertCircle size={18} className="text-red-400 shrink-0" />
                    <div className="text-left">
                      <p className="text-xs font-black text-white uppercase tracking-wider">0 Games Available</p>
                      <p className="text-[11px] text-red-300/80 leading-tight">Top-up rate: $20 = 10 games. Payment Method: Australian PayID or Cash in hand for pitch lights. Tap to contact Admin.</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-300 px-2.5 py-1 rounded-full border border-red-500/30 shrink-0 group-hover:bg-red-500/30">
                    Contact Admin ⚡
                  </span>
                </div>
              )}

              {/* 1 Token Remaining Warning Banner */}
              {currentUser && isOneTokenLeft && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5">
                  <AlertCircle size={16} className="text-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-200 leading-tight">
                    ⚠️ <strong>1 token available</strong> — Joining this match will be your final credit. Top-up rate: <strong>$20 = 10 games/tokens</strong>. Contact Admin to top up!
                  </p>
                </div>
              )}

              {/* Action Buttons Row */}
              <div className="pt-1">
                {currentUser ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
                    {(() => {
                      const myRSVP = rsvps.find(r => r.user_id === currentUser.id);
                      const isConfirmed = myRSVP?.status === 'confirmed';
                      const isWaiting = myRSVP?.status === 'waiting';
                      const isDeclined = myRSVP?.status === 'declined';
                      
                      return (
                        <>
                          {/* I'M IN Button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isOutOfTokens && !isConfirmed && !isWaiting) {
                                setShowNoTokensModal(true);
                                return;
                              }
                              handleRSVPAction(true);
                            }}
                            disabled={actionLoading || isConfirmed || isWaiting}
                            className={cn(
                              "w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer",
                              (isConfirmed || isWaiting)
                                ? "bg-[#00ff66] text-black shadow-[0_0_20px_rgba(0,255,102,0.3)] cursor-default"
                                : isOutOfTokens
                                  ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                                  : "bg-[#00ff66] text-black hover:bg-[#00e65c] shadow-[0_0_25px_rgba(0,255,102,0.25)] hover:scale-[1.02]"
                            )}
                          >
                            {actionLoading ? (
                              <Loader2 className="animate-spin w-4 h-4" />
                            ) : (isConfirmed || isWaiting) ? (
                              <>
                                <Check size={16} /> YOU'RE ON IT ⚽
                              </>
                            ) : isOutOfTokens ? (
                              <>
                                <AlertCircle size={16} /> 0 TOKENS • TAP TO TOP UP
                              </>
                            ) : (
                              "I'M IN ⚽"
                            )}
                          </button>
                          
                          {/* I'M OUT Button & Confirmation dialog */}
                          {showConfirmCancel ? (
                            <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-2 bg-red-500/10 border border-red-500/30 p-2 rounded-2xl">
                              <span className="text-[11px] text-red-300 font-black uppercase tracking-tight text-center sm:text-left px-1">
                                Give up your spot?
                              </span>
                              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setShowConfirmCancel(false);
                                    await handleRSVPAction(false);
                                  }}
                                  disabled={actionLoading}
                                  className="flex-1 sm:flex-none bg-red-500 text-white text-[11px] font-black uppercase px-3 py-2 rounded-xl hover:bg-red-600 transition-all cursor-pointer text-center"
                                >
                                  Confirm OUT ❌
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowConfirmCancel(false)}
                                  className="flex-1 sm:flex-none bg-white/10 text-white text-[11px] font-black uppercase px-3 py-2 rounded-xl hover:bg-white/20 transition-all cursor-pointer text-center"
                                >
                                  Keep Spot ⚽
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (myRSVP && (myRSVP.status === 'confirmed' || myRSVP.status === 'waiting')) {
                                  setShowConfirmCancel(true);
                                } else {
                                  handleRSVPAction(false);
                                }
                              }}
                              disabled={actionLoading || isDeclined}
                              className={cn(
                                "w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer",
                                isDeclined
                                  ? "bg-red-500/20 border border-red-500/40 text-red-400 cursor-default"
                                  : "bg-white/5 border border-white/10 text-white/70 hover:border-red-500/50 hover:text-red-400 hover:bg-red-500/5"
                              )}
                            >
                              {actionLoading ? <Loader2 className="animate-spin w-4 h-4" /> : isDeclined ? "DECLINED (OUT) ❌" : "I'M OUT ❌"}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => window.location.href = '/'}
                    className="w-full sm:w-auto min-h-[48px] bg-white text-black text-xs font-black uppercase tracking-widest px-7 py-3 rounded-2xl hover:bg-white/90 transition-all flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(255,255,255,0.2)] cursor-pointer"
                  >
                    Sign In to RSVP ⚽ <ExternalLink size={14} />
                  </button>
                )}
              </div>

              {/* Notification Message Banner */}
              {rsvpMessage && (
                <motion.div 
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "p-3.5 rounded-2xl text-xs font-bold border leading-relaxed",
                    rsvpMessage.type === 'success' 
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                      : "bg-red-500/10 border-red-500/30 text-red-400"
                  )}
                >
                  {rsvpMessage.text}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* Live MVP & MSP Voting Sections OR Player Squad Sheets */}
        <AnimatePresence mode="wait">
          {(game.status === 'voting' || game.status === 'finished') ? (
            <motion.section 
              key="voting"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6 sm:space-y-8"
            >
              {/* Toast / Message */}
              {voteMessage && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    "p-4 rounded-2xl text-xs font-black tracking-wider uppercase border text-center",
                    voteMessage.type === 'success' 
                      ? "bg-[#00ff66]/10 border-[#00ff66]/20 text-[#00ff66] shadow-[0_0_15px_rgba(0,255,102,0.1)]" 
                      : "bg-[#ff3b30]/10 border-[#ff3b30]/20 text-[#ff3b30] shadow-[0_0_15px_rgba(255,59,48,0.1)]"
                  )}
                >
                  {voteMessage.text}
                </motion.div>
              )}

              {/* Mobile Voting Tab Switcher (High Contrast No-Stroke Pills) */}
              <div className="flex lg:hidden bg-[#0F1118] p-1.5 rounded-2xl gap-1.5">
                <button
                  type="button"
                  onClick={() => setMobileVoteTab('mvp')}
                  className={cn(
                    "flex-1 min-h-[44px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                    mobileVoteTab === 'mvp' ? "bg-[#0055FF] text-white shadow-lg font-black" : "bg-[#181B26] text-white/70 hover:text-white font-bold"
                  )}
                >
                  <Trophy size={14} /> MVP ({votes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMobileVoteTab('msp')}
                  className={cn(
                    "flex-1 min-h-[44px] py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                    mobileVoteTab === 'msp' ? "bg-[#FF334B] text-white shadow-lg font-black" : "bg-[#181B26] text-white/70 hover:text-white font-bold"
                  )}
                >
                  <Frown size={14} /> MSP ({mspVotes.length})
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                {/* MVP Section */}
                <div className={cn("space-y-4 sm:space-y-6", mobileVoteTab !== 'mvp' && "hidden lg:block")}>
                  <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
                    <h3 className="text-xl sm:text-2xl font-black italic tracking-tighter flex items-center gap-2.5 text-blue-500">
                      <BarChart3 size={20} /> 
                      {game.status === 'finished' ? 'FINAL MVP RESULTS' : 'LIVE MVP VOTING'}
                    </h3>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                      {votes.length} Votes
                    </div>
                  </div>

                  <div className="space-y-2 sm:space-y-3">
                    {confirmed
                      .sort((a, b) => getVoteCount(b.user_id) - getVoteCount(a.user_id))
                      .slice(0, 12)
                      .map((player, idx) => {
                        const voteCount = getVoteCount(player.user_id);
                        const isVotedByMe = myVote?.candidate_id === player.user_id;
                        const isSelfCandidate = player.user_id === currentUser?.id;
                        const isMspCandidate = myMspVote?.candidate_id === player.user_id;
                        const canCastVote = game.status === 'voting' && !myVote && currentUser && !isSelfCandidate && !isMspCandidate;

                        return (
                          <div
                            key={player.id}
                            className={cn(
                              "relative p-3.5 sm:p-4 rounded-2xl border transition-all overflow-hidden",
                              isVotedByMe ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.25)]" : "bg-white/5 border-white/10"
                            )}
                          >
                            {/* Progress Bar */}
                            <div 
                              className={cn(
                                "absolute inset-0 transition-all duration-700 opacity-15",
                                isVotedByMe ? "bg-black" : "bg-blue-500"
                              )}
                              style={{ width: `${(voteCount / maxVotes) * 100}%` }}
                            />

                            <div className="relative flex items-center justify-between z-10 gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-xs font-black italic opacity-30 w-5 shrink-0">#{idx + 1}</span>
                                <span className="font-bold tracking-tight text-xs sm:text-sm truncate">{player.profiles?.full_name || 'Unknown Player'}</span>
                                {isSelfCandidate && <span className="text-[9px] uppercase bg-white/10 px-1.5 py-0.5 rounded text-white/50 shrink-0">You</span>}
                                {isMspCandidate && <span className="text-[9px] uppercase bg-red-500/15 px-1.5 py-0.5 rounded text-red-400 font-bold shrink-0">MSP Pick</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-black">{voteCount} {voteCount === 1 ? 'vote' : 'votes'}</span>
                                {canCastVote && (
                                  <button 
                                    type="button"
                                    onClick={() => handleVote(player.user_id)}
                                    disabled={actionLoading}
                                    className="bg-blue-500 text-white px-2.5 py-1 rounded-xl hover:bg-blue-600 transition-all text-xs font-black flex items-center gap-1 cursor-pointer"
                                    title="Vote MVP"
                                  >
                                    <Check size={12} /> Vote
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    {confirmed.length === 0 && (
                      <p className="text-white/20 italic text-sm">No players confirmed for this match.</p>
                    )}
                  </div>
                </div>

                {/* MSP Section */}
                <div className={cn("space-y-4 sm:space-y-6", mobileVoteTab !== 'msp' && "hidden lg:block")}>
                  <div className="flex items-center justify-between border-b border-red-500/20 pb-3">
                    <h3 className="text-xl sm:text-2xl font-black italic tracking-tighter flex items-center gap-2.5 text-red-500">
                      <Frown size={20} /> 
                      {game.status === 'finished' ? 'FINAL MSP RESULTS' : 'LIVE MSP VOTING'}
                    </h3>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                      {mspVotes.length} Votes
                    </div>
                  </div>

                  <div className="space-y-2 sm:space-y-3">
                    {confirmed
                      .sort((a, b) => getMspVoteCount(b.user_id) - getMspVoteCount(a.user_id))
                      .slice(0, 12)
                      .map((player, idx) => {
                        const mspVoteCount = getMspVoteCount(player.user_id);
                        const isVotedByMe = myMspVote?.candidate_id === player.user_id;
                        const isSelfCandidate = player.user_id === currentUser?.id;
                        const isMvpCandidate = myVote?.candidate_id === player.user_id;
                        const canCastMspVote = game.status === 'voting' && !myMspVote && currentUser && !isMvpCandidate;
                        const maxMspVotes = Math.max(...confirmed.map(p => getMspVoteCount(p.user_id)), 1);

                        return (
                          <div
                            key={player.id}
                            className={cn(
                              "relative p-3.5 sm:p-4 rounded-2xl border transition-all overflow-hidden",
                              isVotedByMe ? "bg-white text-black border-white shadow-[0_0_15px_rgba(239,68,68,0.25)]" : "bg-white/5 border-white/10"
                            )}
                          >
                            {/* Progress Bar */}
                            <div 
                              className={cn(
                                "absolute inset-0 transition-all duration-700 opacity-15",
                                isVotedByMe ? "bg-black" : "bg-red-500"
                              )}
                              style={{ width: `${(mspVoteCount / maxMspVotes) * 100}%` }}
                            />

                            <div className="relative flex items-center justify-between z-10 gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-xs font-black italic opacity-30 w-5 shrink-0">#{idx + 1}</span>
                                <span className="font-bold tracking-tight text-xs sm:text-sm truncate">{player.profiles?.full_name || 'Unknown Player'}</span>
                                {isSelfCandidate && <span className="text-[9px] uppercase bg-white/10 px-1.5 py-0.5 rounded text-white/50 shrink-0">You</span>}
                                {isMvpCandidate && <span className="text-[9px] uppercase bg-blue-500/15 px-1.5 py-0.5 rounded text-blue-400 font-bold shrink-0">MVP Pick</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-black">{mspVoteCount} {mspVoteCount === 1 ? 'vote' : 'votes'}</span>
                                {canCastMspVote && (
                                  <button 
                                    type="button"
                                    onClick={() => handleMspVote(player.user_id)}
                                    disabled={actionLoading}
                                    className="bg-red-500 text-white px-2.5 py-1 rounded-xl hover:bg-red-600 transition-all text-xs font-black flex items-center gap-1 cursor-pointer"
                                    title="Vote MSP"
                                  >
                                    <Check size={12} /> Vote
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    {confirmed.length === 0 && (
                      <p className="text-white/20 italic text-sm">No players confirmed for this match.</p>
                    )}
                  </div>
                </div>
              </div>

              {game.status === 'voting' && !currentUser && (
                <div className="text-center p-6 bg-white/5 rounded-3xl border border-dashed border-white/10 space-y-3">
                  <p className="text-white/50 text-xs font-bold">Want to cast your vote? Log in to your player account.</p>
                  <button 
                    type="button"
                    onClick={() => window.location.href = '/'}
                    className="bg-white text-black px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-white/90 transition-all inline-flex items-center gap-2 mx-auto cursor-pointer"
                  >
                    Login to Vote <ExternalLink size={14} />
                  </button>
                </div>
              )}
            </motion.section>
          ) : (
            <motion.div 
              key="squad"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6 sm:space-y-8"
            >
              {/* Squad Navigation Tabs (High Contrast No-Stroke Pills) */}
              <div id="squad-tabs-section" className="flex bg-[#0F1118] p-1.5 rounded-2xl gap-1.5 overflow-x-auto scrollbar-none">
                {hasTeams && (
                  <button
                    type="button"
                    onClick={() => setMobileSquadTab('teams')}
                    className={cn(
                      "flex-1 min-w-[100px] min-h-[44px] py-2.5 px-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all text-center shrink-0 cursor-pointer flex items-center justify-center gap-1.5",
                      mobileSquadTab === 'teams' 
                        ? "bg-[#00E65C] text-black shadow-md font-black" 
                        : "bg-[#181B26] text-white/70 hover:text-white font-bold"
                    )}
                  >
                    <Users size={14} /> Teams A & B
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMobileSquadTab('confirmed')}
                  className={cn(
                    "flex-1 min-w-[110px] min-h-[44px] py-2.5 px-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all text-center shrink-0 cursor-pointer flex items-center justify-center gap-1.5",
                    mobileSquadTab === 'confirmed' 
                      ? "bg-white text-black shadow-md font-black" 
                      : "bg-[#181B26] text-white/70 hover:text-white font-bold"
                  )}
                >
                  <CheckCircle2 size={14} className={mobileSquadTab === 'confirmed' ? "text-black" : "text-[#00ff66]"} />
                  Confirmed ({confirmed.length}/22)
                </button>
                <button
                  type="button"
                  onClick={() => setMobileSquadTab('waiting')}
                  className={cn(
                    "flex-1 min-w-[95px] min-h-[44px] py-2.5 px-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all text-center shrink-0 cursor-pointer flex items-center justify-center gap-1.5",
                    mobileSquadTab === 'waiting' 
                      ? "bg-[#FFBE0B] text-black shadow-md font-black" 
                      : waiting.length > 0 
                        ? "bg-[#251E10] text-[#FFBE0B] hover:bg-[#322814] font-bold" 
                        : "bg-[#181B26] text-white/70 hover:text-white font-bold"
                  )}
                >
                  <Shuffle size={13} />
                  Waitlist ({waiting.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMobileSquadTab('declined')}
                  className={cn(
                    "flex-1 min-w-[105px] min-h-[44px] py-2.5 px-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all text-center shrink-0 cursor-pointer flex items-center justify-center gap-1.5",
                    mobileSquadTab === 'declined' 
                      ? "bg-[#FF334B] text-white shadow-md font-black" 
                      : declined.length > 0 
                        ? "bg-[#251618] text-[#FF334B] hover:bg-[#331c20] font-bold" 
                        : "bg-[#181B26] text-white/70 hover:text-white font-bold"
                  )}
                >
                  <X size={13} className={mobileSquadTab === 'declined' ? "text-white" : declined.length > 0 ? "text-[#FF334B]" : "text-white/50"} />
                  Not Going ({declined.length})
                </button>
              </div>

              {/* View Content based on Tab */}
              {mobileSquadTab === 'teams' && hasTeams && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {/* Team A (Green) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-[#00ff66]/10 border border-[#00ff66]/20 px-4 py-2.5 rounded-2xl">
                      <h3 className="text-base sm:text-lg font-black italic tracking-tight flex items-center gap-2 text-[#00ff66]">
                        <Users size={18} /> TEAM A (GREEN)
                      </h3>
                      <span className="text-[10px] font-black uppercase text-[#00ff66]/80 bg-[#00ff66]/20 px-2.5 py-0.5 rounded-full">
                        {game.team_a?.length || 0} Players
                      </span>
                    </div>
                    <div className="space-y-2">
                      {game.team_a?.map((player, i) => {
                        const isMe = player.id === currentUser?.id;
                        return (
                          <div 
                            key={player.id} 
                            className={cn(
                              "p-3 sm:p-3.5 rounded-2xl flex items-center justify-between border transition-all",
                              isMe 
                                ? "bg-[#00ff66]/15 border-[#00ff66]/50 shadow-[0_0_15px_rgba(0,255,102,0.15)]" 
                                : "bg-white/5 border-white/5 hover:border-[#00ff66]/30"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-[#00ff66]/40 font-black italic text-xs w-6 shrink-0">#{i + 1}</span>
                              <span className="font-bold tracking-tight text-xs sm:text-sm truncate">{player.full_name}</span>
                              {isMe && (
                                <span className="bg-[#00ff66] text-black text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0">
                                  You
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Team B (Orange) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-orange-500/10 border border-orange-500/20 px-4 py-2.5 rounded-2xl">
                      <h3 className="text-base sm:text-lg font-black italic tracking-tight flex items-center gap-2 text-orange-400">
                        <Users size={18} /> TEAM B (ORANGE)
                      </h3>
                      <span className="text-[10px] font-black uppercase text-orange-400/80 bg-orange-500/20 px-2.5 py-0.5 rounded-full">
                        {game.team_b?.length || 0} Players
                      </span>
                    </div>
                    <div className="space-y-2">
                      {game.team_b?.map((player, i) => {
                        const isMe = player.id === currentUser?.id;
                        return (
                          <div 
                            key={player.id} 
                            className={cn(
                              "p-3 sm:p-3.5 rounded-2xl flex items-center justify-between border transition-all",
                              isMe 
                                ? "bg-orange-500/15 border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.15)]" 
                                : "bg-white/5 border-white/5 hover:border-orange-500/30"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-orange-500/40 font-black italic text-xs w-6 shrink-0">#{i + 1}</span>
                              <span className="font-bold tracking-tight text-xs sm:text-sm truncate">{player.full_name}</span>
                              {isMe && (
                                <span className="bg-orange-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0">
                                  You
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmed Squad List */}
              {mobileSquadTab === 'confirmed' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <h3 className="text-base sm:text-lg font-black italic tracking-tight flex items-center gap-2 text-white">
                      <CheckCircle2 size={18} className="text-[#00ff66]" /> CONFIRMED SQUAD ({confirmed.length}/22)
                    </h3>
                    <span className="text-[10px] font-black uppercase tracking-wider text-white/40">
                      {22 - confirmed.length > 0 ? `${22 - confirmed.length} spots free` : 'FULL'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    {confirmed.map((rsvp, i) => {
                      const isMe = rsvp.user_id === currentUser?.id;
                      return (
                        <div 
                          key={rsvp.id} 
                          className={cn(
                            "p-3 sm:p-3.5 rounded-2xl flex items-center justify-between border transition-all group",
                            isMe 
                              ? "bg-[#00ff66]/10 border-[#00ff66]/40 shadow-[0_0_15px_rgba(0,255,102,0.1)]" 
                              : "bg-white/5 border-white/5 hover:border-white/20"
                          )}
                        >
                          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                            <span className={cn(
                              "font-black italic text-xs w-6 shrink-0",
                              isMe ? "text-[#00ff66]" : "text-white/30 group-hover:text-white/60"
                            )}>
                              #{i + 1}
                            </span>
                            <span className="font-bold tracking-tight text-xs sm:text-sm truncate">
                              {rsvp.profiles?.full_name || 'Unknown Player'}
                            </span>
                            {isMe && (
                              <span className="bg-[#00ff66] text-black text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0">
                                You
                              </span>
                            )}
                          </div>
                          {rsvp.created_at && (
                            <span className="text-[10px] font-mono text-white/30 tracking-wider font-semibold shrink-0 ml-2">
                              {formatRsvpTime(rsvp.created_at)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {confirmed.length === 0 && (
                      <div className="col-span-full text-center py-8 bg-white/5 rounded-3xl border border-dashed border-white/10">
                        <p className="text-white/30 italic text-xs">Waiting for players to join the match sheet...</p>
                      </div>
                    )}
                  </div>

                  {/* Live Feed: Who Said "NO" / Not Going Section */}
                  {declined.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#FF334B] animate-pulse shrink-0" />
                          <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                            <X size={15} className="text-[#FF334B]" /> Said "NO" / Not Going ({declined.length})
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setMobileSquadTab('declined');
                            document.getElementById('squad-tabs-section')?.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="text-[11px] font-black uppercase tracking-wider text-red-400/80 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          View Tab &rarr;
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5">
                        {declined.map((rsvp, idx) => {
                          const isMe = rsvp.user_id === currentUser?.id;
                          return (
                            <div 
                              key={rsvp.id} 
                              className={cn(
                                "p-2.5 sm:p-3 rounded-2xl flex items-center justify-between border transition-all",
                                isMe 
                                  ? "bg-red-500/15 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]" 
                                  : "bg-[#181B26] border-white/5 hover:border-red-500/30"
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-red-400/50 font-black italic text-xs w-5 shrink-0">#{idx + 1}</span>
                                <span className="font-bold tracking-tight text-xs sm:text-sm truncate text-white/90">
                                  {rsvp.profiles?.full_name || 'Unknown Player'}
                                </span>
                                {isMe && (
                                  <span className="bg-red-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0">
                                    You
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-wider text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md shrink-0 ml-2">
                                OUT ❌
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Waiting List */}
              {mobileSquadTab === 'waiting' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                    <h3 className="text-base sm:text-lg font-black italic tracking-tight flex items-center gap-2 text-amber-400">
                      <Shuffle size={18} /> WAITING LIST ({waiting.length})
                    </h3>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400/60">
                      Auto-promoted if spots open
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    {waiting.map((rsvp, i) => {
                      const isMe = rsvp.user_id === currentUser?.id;
                      return (
                        <div 
                          key={rsvp.id} 
                          className={cn(
                            "p-3 sm:p-3.5 rounded-2xl flex items-center justify-between border transition-all",
                            isMe 
                              ? "bg-amber-500/15 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]" 
                              : "bg-white/5 border-white/5 opacity-70"
                          )}
                        >
                          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                            <span className="text-amber-400/50 font-black italic text-xs w-6 shrink-0">#{i + 1}</span>
                            <span className="font-bold tracking-tight text-xs sm:text-sm truncate text-white/90">
                              {rsvp.profiles?.full_name || 'Unknown Player'}
                            </span>
                            {isMe && (
                              <span className="bg-amber-500 text-black text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0">
                                You
                              </span>
                            )}
                          </div>
                          {rsvp.created_at && (
                            <span className="text-[10px] font-mono text-white/30 tracking-wider font-semibold shrink-0 ml-2">
                              {formatRsvpTime(rsvp.created_at)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {waiting.length === 0 && (
                      <div className="col-span-full text-center py-8 bg-white/5 rounded-3xl border border-dashed border-white/10">
                        <p className="text-white/30 italic text-xs">No players on the waiting list currently.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Declined List */}
              {mobileSquadTab === 'declined' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-red-500/20 pb-2">
                    <div>
                      <h3 className="text-base sm:text-lg font-black italic tracking-tight flex items-center gap-2 text-red-400">
                        <X size={18} /> PLAYERS WHO SAID "NO" ({declined.length})
                      </h3>
                      <p className="text-xs text-white/50 mt-0.5">
                        Players who have marked themselves as unavailable for this match.
                      </p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-red-400/80 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full shrink-0">
                      {declined.length === 1 ? '1 Player Out' : `${declined.length} Players Out`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    {declined.map((rsvp, i) => {
                      const isMe = rsvp.user_id === currentUser?.id;
                      return (
                        <div 
                          key={rsvp.id} 
                          className={cn(
                            "p-3 sm:p-3.5 rounded-2xl flex items-center justify-between border transition-all",
                            isMe 
                              ? "bg-red-500/15 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]" 
                              : "bg-[#181B26] border-white/5 hover:border-red-500/30"
                          )}
                        >
                          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                            <span className="text-red-400/50 font-black italic text-xs w-6 shrink-0">#{i + 1}</span>
                            <span className="font-bold tracking-tight text-xs sm:text-sm truncate text-white/90">
                              {rsvp.profiles?.full_name || 'Unknown Player'}
                            </span>
                            {isMe && (
                              <span className="bg-red-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0">
                                You
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {rsvp.created_at && (
                              <span className="text-[10px] font-mono text-white/30 tracking-wider font-semibold">
                                {formatRsvpTime(rsvp.created_at)}
                              </span>
                            )}
                            <span className="text-[9px] font-black uppercase tracking-wider text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md">
                              OUT ❌
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {declined.length === 0 && (
                      <div className="col-span-full text-center py-10 bg-white/5 rounded-3xl border border-dashed border-white/10 space-y-1.5">
                        <p className="text-white/70 font-bold text-sm">No players marked as not going yet.</p>
                        <p className="text-white/40 italic text-xs">Everyone on the roster is either confirmed, waitlisted, or yet to reply!</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Floating Sticky RSVP Status Bar */}
        {currentUser && (
          <div className="sm:hidden fixed bottom-4 left-3 right-3 z-30 pointer-events-none">
            <div className="pointer-events-auto bg-[#161922]/95 backdrop-blur-xl border border-white/15 p-2.5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 pl-1">
                <span className={cn(
                  "w-2.5 h-2.5 rounded-full shrink-0",
                  isOutOfTokens ? "bg-red-500 animate-pulse" : (isConfirmed || isWaiting) ? "bg-[#00ff66]" : "bg-white/50"
                )} />
                <div className="truncate">
                  <div className="text-[10px] font-black uppercase text-white/50 tracking-wider">Your Status</div>
                  <div className="text-xs font-black text-white truncate">
                    {isConfirmed 
                      ? `Confirmed (Spot #${confirmed.findIndex(r => r.user_id === currentUser.id) + 1})` 
                      : isWaiting 
                        ? `Waitlist (#${waiting.findIndex(r => r.user_id === currentUser.id) + 1})` 
                        : isDeclined 
                          ? "Declined (OUT)" 
                          : isOutOfTokens 
                            ? "0 Tokens • Top Up" 
                            : "Not RSVP'd"}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (isOutOfTokens && !isConfirmed && !isWaiting) {
                    setShowNoTokensModal(true);
                    return;
                  }
                  if (isConfirmed || isWaiting) {
                    document.getElementById('rsvp-section')?.scrollIntoView({ behavior: 'smooth' });
                  } else {
                    handleRSVPAction(true);
                  }
                }}
                disabled={actionLoading}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider shrink-0 transition-all flex items-center gap-1.5 shadow-md cursor-pointer",
                  (isConfirmed || isWaiting)
                    ? "bg-white/10 text-white hover:bg-white/20"
                    : isOutOfTokens
                      ? "bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                      : "bg-[#00ff66] text-black hover:bg-[#00e65c] shadow-[0_0_15px_rgba(0,255,102,0.3)]"
                )}
              >
                {(isConfirmed || isWaiting) ? (
                  <>View Spot ⚽</>
                ) : isOutOfTokens ? (
                  <>Contact Admin ⚡</>
                ) : (
                  <>I'M IN ⚽</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center pt-10 sm:pt-16 pb-16 sm:pb-6 border-t border-white/5 space-y-2">
          <div className="text-xl sm:text-2xl font-black italic tracking-tighter text-white">PSG PERTH</div>
          <p className="text-white/30 text-[10px] uppercase font-black tracking-[0.3em]">
            Official Match Centre &copy; {new Date().getFullYear()}
          </p>
        </footer>
      </main>

      {/* Pop-Up Modal: Out of Tokens (Strict Blocking) */}
      <AnimatePresence>
        {showNoTokensModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", duration: 0.35 }}
              className="relative w-full max-w-md bg-[#161922] border border-red-500/40 rounded-3xl p-5 sm:p-7 shadow-[0_0_50px_rgba(239,68,68,0.25)] text-center space-y-4"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setShowNoTokensModal(false)}
                className="absolute top-4 right-4 p-2.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X size={20} />
              </button>

              {/* Icon & Badge */}
              <div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                <Ticket size={32} />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-[11px] font-black uppercase tracking-wider border border-red-500/30">
                  <AlertCircle size={13} /> 0 Games Available
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                  Cannot RSVP Without Tokens
                </h3>
                <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
                  You have run out of game credits. Please <strong className="text-white">Contact Admin</strong> to top up your account: <strong className="text-[#00ff66]">$20 = 10 games/tokens</strong>.
                </p>
              </div>

              {/* Payment Details Box */}
              <div className="bg-[#0f1118] border border-white/10 rounded-2xl p-4 text-left space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-white/50">Top-Up Rate</span>
                  <span className="text-[10px] bg-pitch/20 text-pitch border border-pitch/30 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                    $20 = 10 Games
                  </span>
                </div>
                <div>
                  <div className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <span>⚽ $20 = 10 games / tokens ($2/game)</span>
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed mt-1">
                    Payment Method: Australian PayID or Cash in hand for pitch lights
                  </p>
                </div>

                <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-xs text-white/80 leading-relaxed">
                  Please contact the Admin directly to arrange payment and have your 10 tokens added immediately.
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    window.open('mailto:charley.moraes@gmail.com?subject=PSG%20Perth%20Game%20Tokens%20Top-Up&body=Hi%20Charley,%20I%20would%20like%20to%20top%20up%20my%20game%20tokens%20($20%20=%2010%20games).', '_blank');
                  }}
                  className="w-full min-h-[44px] bg-[#00ff66] text-black py-3 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-[#00e65c] transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Mail size={15} /> Contact Admin
                </button>

                {currentUserProfile?.is_admin && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNoTokensModal(false);
                      window.location.href = '/';
                    }}
                    className="w-full min-h-[44px] bg-white/15 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-white/20 transition-all cursor-pointer"
                  >
                    Open Admin Dashboard (Add Tokens) ⚡
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowNoTokensModal(false)}
                  className="w-full min-h-[44px] bg-white/5 text-white/70 hover:text-white py-3 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-white/10 transition-all cursor-pointer"
                >
                  Understood • I'll Contact the Admin
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Share Toast Notification */}
      <AnimatePresence>
        {showShareToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white text-black px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_10px_30px_rgba(0,0,0,0.5)] border border-white/20"
          >
            <Check size={16} className="text-emerald-600" /> Match link copied to clipboard! 📋
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
