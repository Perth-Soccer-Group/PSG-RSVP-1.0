import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { Profile } from './types';
import Auth from './components/Auth';
import UpdatePassword from './components/UpdatePassword';
import MatchView from './components/MatchView';
import HistoryView from './components/HistoryView';
import AdminView from './components/AdminView';
import PublicGameView from './components/PublicGameView';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, History, ShieldAlert, LogOut, Menu, X, AlertTriangle, ExternalLink, RefreshCw, Share2, Ticket } from 'lucide-react';
import { cn, formatTime } from './lib/utils';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<'match' | 'history' | 'admin'>('match');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isResettingPassword, setIsResettingPassword] = useState(
    () => window.location.pathname.startsWith('/reset-password')
  );
  // Errors Supabase sends back in the URL hash (e.g. expired email links)
  const [linkError] = useState<string | null>(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code = hash.get('error_code');
    if (!code && !hash.get('error')) return null;
    window.history.replaceState({}, '', window.location.pathname);
    if (code === 'otp_expired') {
      return 'That email link has expired or was already used. Please request a new one.';
    }
    return hash.get('error_description')?.replace(/\+/g, ' ') || 'That email link could not be used. Please try again.';
  });

  // Handle Public Route
  const path = window.location.pathname;
  const isPublicRoute = path.startsWith('/game-feed/') || path.startsWith('/match/');
  const publicGameId = isPublicRoute ? path.split('/')[2] : null;

  useEffect(() => {
    // Dynamically enforce ⚽ favicon globally
    const setDynamicFavicon = () => {
      const link = (document.querySelector("link[rel*='icon']") as HTMLLinkElement) || document.createElement('link');
      link.type = 'image/svg+xml';
      link.rel = 'icon';
      link.href = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚽</text></svg>`;
      document.getElementsByTagName('head')[0].appendChild(link);
    };
    setDynamicFavicon();
    document.title = "Perth Soccer Group";

    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id, session.user.email);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        window.history.replaceState({}, '', '/reset-password');
        setIsResettingPassword(true);
      }
      setSession(session);
      if (session) fetchProfile(session.user.id, session.user.email);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Realtime subscription to own profile changes (e.g. admin updates game tokens)
  useEffect(() => {
    if (!session?.user?.id) return;
    const profileChannel = supabase
      .channel(`profile-realtime-${session.user.id}`)
      .on('postgres_changes' as any, {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${session.user.id}`
      }, (payload: any) => {
        if (payload.new) {
          setProfile(prev => prev ? ({
            ...prev,
            ...payload.new,
            game_tokens: payload.new.game_tokens ?? prev.game_tokens ?? 0
          }) : payload.new);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [session?.user?.id]);

  const fetchProfile = async (userId: string, userEmail?: string) => {
    try {
      let email = userEmail?.toLowerCase();
      if (!email && session?.user?.email) {
        email = session.user.email.toLowerCase();
      }
      
      const isCharley = email === 'charley.moraes@gmail.com';
      console.log('fetchProfile: email =', email, 'isCharley =', isCharley);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist, try to create it with 2 welcome tokens & auto-approved
        console.log('Profile missing, creating with 2 starter tokens & auto-approved...');
        const profilePayload: any = {
          id: userId,
          full_name: email ? email.split('@')[0] : 'New Player',
          email,
          is_admin: isCharley ? true : false,
          is_approved: true, // Auto-approved on first login so players can RSVP straight away!
          game_tokens: 2     // Welcome bonus: 2 games/tokens credited automatically!
        };

        let newProfile: any = null;
        let createError: any = null;

        // Try to insert with is_approved and game_tokens
        try {
          const { data: p1, error: e1 } = await supabase
            .from('profiles')
            .insert(profilePayload)
            .select()
            .single();
          newProfile = p1;
          createError = e1;
        } catch (e1Err: any) {
          console.warn('Catch on first insert:', e1Err);
          createError = e1Err;
        }

        // If fails because game_tokens or is_approved column is missing, retry with fallbacks
        if (createError && (createError.message?.includes('game_tokens') || createError.code === '42703')) {
          console.log('Detected missing game_tokens column, retrying insert without it...');
          try {
            const { data: p2, error: e2 } = await supabase
              .from('profiles')
              .insert({
                id: userId,
                full_name: email ? email.split('@')[0] : 'New Player',
                email,
                is_admin: isCharley ? true : false,
                is_approved: true
              })
              .select()
              .single();
            newProfile = p2;
            createError = e2;
          } catch (e2Err: any) {
            console.warn('Catch on second insert:', e2Err);
            createError = e2Err;
          }
        }

        if (createError && (createError.message?.includes('is_approved') || createError.code === 'PGRST204' || createError.code === '42703')) {
          console.log('Detected missing is_approved column, retrying insert with minimal columns...');
          try {
            const { data: p3, error: e3 } = await supabase
              .from('profiles')
              .insert({
                id: userId,
                full_name: email ? email.split('@')[0] : 'New Player',
                email,
                is_admin: isCharley ? true : false
              })
              .select()
              .single();
            newProfile = p3;
            createError = e3;
          } catch (e3Err: any) {
            console.error('Catch on third insert:', e3Err);
            createError = e3Err;
          }
        }

        if (createError) {
          console.error('Error creating profile:', createError);
        }

        if (newProfile) {
          setProfile({
            ...newProfile,
            email: email || newProfile.email,
            is_approved: newProfile.is_approved ?? true,
            is_admin: isCharley ? true : !!newProfile.is_admin,
            game_tokens: newProfile.game_tokens ?? 2
          });
        } else {
          // Fallback if RLS or insert completely failed but we want them to log in and RSVP
          setProfile({
            id: userId,
            full_name: email ? email.split('@')[0] : 'New Player',
            email,
            is_admin: isCharley ? true : false,
            is_approved: true,
            game_tokens: 2,
            created_at: new Date().toISOString()
          });
        }
      } else if (error) {
        console.error('Error fetching profile:', error);
        // If there is an error fetching profile (e.g. database RLS, connection, etc.)
        // grant local profile with 2 starter tokens and approved access
        setProfile({
          id: userId,
          full_name: email ? email.split('@')[0] : 'Player',
          email,
          is_admin: isCharley ? true : false,
          is_approved: true,
          game_tokens: 2,
          created_at: new Date().toISOString()
        });
      } else if (data) {
        const hasAdmin = data.is_admin;
        const hasApproved = data.is_approved ?? true;

        // If an existing user has no game_tokens recorded yet (null/undefined), grant them 2 welcome tokens!
        let userTokens = data.game_tokens;
        if (userTokens === null || userTokens === undefined) {
          userTokens = 2;
          try {
            await supabase.from('profiles').update({ game_tokens: 2 }).eq('id', userId);
          } catch (tokUpdateErr) {
            console.warn('Could not auto-seed tokens in database:', tokUpdateErr);
          }
        }

        if (isCharley && (!hasAdmin || !hasApproved)) {
          console.log('Ensuring Charley has admin status...');
          
          let updatedProfile: any = null;
          let updateError: any = null;

          // Try updating with is_approved first
          try {
            const { data: u1, error: ue1 } = await supabase
              .from('profiles')
              .update({ is_admin: true, is_approved: true })
              .eq('id', userId)
              .select()
              .single();
            updatedProfile = u1;
            updateError = ue1;
          } catch (ue1Err: any) {
            console.warn('Catch on first update:', ue1Err);
            updateError = ue1Err;
          }

          // If fails because is_approved column is missing, retry with ONLY is_admin
          if (updateError && (updateError.message?.includes('is_approved') || updateError.code === 'PGRST204')) {
            console.log('Detected missing is_approved column, retrying update with only is_admin...');
            try {
              const { data: u2, error: ue2 } = await supabase
                .from('profiles')
                .update({ is_admin: true })
                .eq('id', userId)
                .select()
                .single();
              updatedProfile = u2;
              updateError = ue2;
            } catch (ue2Err: any) {
              console.error('Catch on second update:', ue2Err);
              updateError = ue2Err;
            }
          }

          // Even if update failed on backend due to RLS, make sure we force is_admin: true on client side!
          setProfile({
            ...(updatedProfile || data),
            email: email || (updatedProfile || data).email,
            is_admin: true,
            is_approved: true,
            game_tokens: (updatedProfile || data).game_tokens ?? userTokens ?? 2
          });
        } else {
          setProfile({
            ...data,
            email: email || data.email,
            is_approved: data.is_approved ?? true,
            is_admin: isCharley ? true : !!data.is_admin,
            game_tokens: userTokens ?? 2
          });
        }
      }
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => supabase.auth.signOut();
  const handleRefresh = () => {
    if (session) {
      setLoading(true);
      fetchProfile(session.user.id, session.user.email);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card max-w-lg w-full p-8 text-center space-y-6 border-yellow-500/20"
        >
          <div className="bg-yellow-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto border border-yellow-500/20">
            <AlertTriangle className="text-yellow-500" size={32} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Supabase Setup Required</h1>
            <p className="text-white/60">
              To use this app, you need to connect your own Supabase project.
            </p>
          </div>
          
          <div className="bg-white/5 rounded-xl p-6 text-left space-y-4 border border-white/10">
            <p className="text-sm font-medium">Follow these steps:</p>
            <ol className="text-sm text-white/60 space-y-3 list-decimal list-inside">
              <li>Go to your <span className="text-white font-bold">Supabase Dashboard</span></li>
              <li>Navigate to <span className="text-white font-bold">Project Settings &gt; API</span></li>
              <li>Copy the <span className="text-pitch font-bold">Project URL</span> and <span className="text-pitch font-bold">anon public key</span></li>
              <li>In AI Studio, open <span className="text-white font-bold">Settings &gt; Secrets</span></li>
              <li>Add <code className="bg-white/10 px-1 rounded text-pitch">VITE_SUPABASE_URL</code></li>
              <li>Add <code className="bg-white/10 px-1 rounded text-pitch">VITE_SUPABASE_ANON_KEY</code></li>
            </ol>
          </div>

          <a 
            href="https://supabase.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-pitch hover:underline text-sm font-bold"
          >
            Go to Supabase <ExternalLink size={14} />
          </a>
        </motion.div>
      </div>
    );
  }

  if (isResettingPassword) {
    return <UpdatePassword onComplete={() => setIsResettingPassword(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-pitch animate-pulse text-4xl font-black tracking-tighter">PSG PERTH</div>
      </div>
    );
  }

  if (isPublicRoute && publicGameId) {
    return <PublicGameView gameId={publicGameId} />;
  }

  if (!session) return <Auth initialError={linkError} />;

  const tabs = [
    { id: 'match', label: 'Match', icon: Trophy },
    { id: 'history', label: 'History', icon: History },
    { id: 'admin', label: 'Admin', icon: ShieldAlert },
  ] as const;

  return (
    <div className="min-h-screen bg-black pb-24 md:pb-0 md:pt-20">
      {/* Header / Desktop Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-xl md:text-2xl font-black tracking-tighter text-white italic">PSG PERTH</div>
          
          <nav className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-xl">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-6 py-2 rounded-lg transition-all font-bold text-sm",
                  activeTab === tab.id ? "bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.2)]" : "text-white/60 hover:text-white"
                )}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {profile?.is_admin && activeTab === 'match' && (
              <button 
                onClick={() => {
                  // Find the active game and copy its link with details for WhatsApp
                  supabase.from('games')
                    .select('id, location, date, time')
                    .neq('status', 'finished')
                    .order('date', { ascending: false })
                    .limit(1)
                    .single()
                    .then(({ data, error }) => {
                      if (error) {
                        console.error('Error fetching game for share:', error);
                        alert('Could not find an active game to share.');
                        return;
                      }

                      if (data) {
                        // Format: [Location] [Time] [Day] [DD/MM] [Live Link]
                        // We use a fixed date conversion to avoid timezone shifts on the share string
                        const [year, month, day] = data.date.split('-').map(Number);
                        const dateObj = new Date(year, month - 1, day);
                        
                        const dayName = dateObj.toLocaleDateString('en-AU', { weekday: 'long' });
                        const dd = String(dateObj.getDate()).padStart(2, '0');
                        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                        
                        // Handle time formatting (ensure it's clean e.g. 6:45 pm)
                        const cleanTime = formatTime(data.time).toLowerCase();
                        
                        const url = `${window.location.origin}/match/${data.id}`;
                        const shareText = `${data.location} ${cleanTime} ${dayName} ${dd}/${mm} ${url}`;
                        
                        navigator.clipboard.writeText(shareText);
                        alert('Share text copied to clipboard!\n\n' + shareText);
                      }
                    });
                }}
                className="p-2 text-white/40 hover:text-white transition-colors"
                title="Share Live List"
              >
                <Share2 size={18} />
              </button>
            )}
            {profile && (
              <div 
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border transition-all cursor-default",
                  (profile.game_tokens ?? 0) === 1
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-pulse"
                    : (profile.game_tokens ?? 0) > 0 
                      ? "bg-[#00ff66]/10 text-[#00ff66] border-[#00ff66]/30 shadow-[0_0_12px_rgba(0,255,102,0.15)]" 
                      : "bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.15)]"
                )}
                title={
                  (profile.game_tokens ?? 0) === 1
                    ? "⚠️ ATTENTION: Only 1 game available! This is your final game. Top-up rate: $20 = 10 games/tokens. Contact Admin (Payment Method: Australian PayID or Cash in hand for pitch lights)."
                    : `Available games: ${profile.game_tokens ?? 0}. Top-up rate: $20 = 10 games/tokens. Payment Method: Australian PayID or Cash in hand for pitch lights.`
                }
              >
                <Ticket 
                  size={13} 
                  className={
                    (profile.game_tokens ?? 0) === 1 
                      ? "text-amber-400" 
                      : (profile.game_tokens ?? 0) > 0 
                        ? "text-[#00ff66]" 
                        : "text-red-400"
                  } 
                />
                <span>
                  {(profile.game_tokens ?? 0) === 1 
                    ? "1 Game Left! ⚠️" 
                    : `${profile.game_tokens ?? 0} Games`}
                </span>
              </div>
            )}
            <button 
              onClick={handleRefresh}
              className="p-2 text-white/40 hover:text-white transition-colors"
              title="Refresh Profile"
            >
              <RefreshCw size={18} />
            </button>
            <div className="hidden md:block text-right">
              <div className="text-sm font-bold">{profile?.full_name}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-widest">
                {profile?.is_admin ? 'Admin Access' : 'Player'}
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-white/40 hover:text-red-500 transition-colors"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 md:p-12 max-w-6xl mx-auto mt-16 md:mt-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'match' && <MatchView user={session.user} profile={profile} onGoToAdmin={() => setActiveTab('admin')} />}
            {activeTab === 'history' && <HistoryView user={session.user} />}
            {activeTab === 'admin' && (
              profile?.is_admin ? <AdminView /> : (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                  <div className="bg-white/5 p-6 rounded-full border border-white/10">
                    <ShieldAlert size={48} className="text-white/20" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Admin Access Required</h2>
                    <p className="text-white/40 max-w-md">
                      Your account currently has "Player" status. To access the admin panel, you need to be granted admin privileges.
                    </p>
                  </div>
                  <div className="bg-white/10 p-4 rounded-xl border border-white/20 text-white text-sm font-medium">
                    Current Status: {profile?.full_name} (Player)
                  </div>
                </div>
              )
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-t border-white/5 px-6 py-4">
        <div className="flex items-center justify-around">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex flex-col items-center gap-1 transition-all",
                activeTab === tab.id ? "text-white" : "text-white/40"
              )}
            >
              <tab.icon size={24} className={cn(activeTab === tab.id && "drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]")} />
              <span className="text-[10px] font-bold uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
