import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { Profile } from '@/src/types';
import Login from '@/src/components/Login';

const Dashboard = lazy(() => import('@/src/components/Dashboard'));
const DataEntry = lazy(() => import('@/src/components/DataEntry'));

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { LogOut, LayoutDashboard, Database, Users, Menu, X } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { Skeleton } from '@/components/ui/skeleton';

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}

function DataEntrySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [showForceRefresh, setShowForceRefresh] = useState(false);

  const fetchingRef = useRef<string | null>(null);
  const authInitializedRef = useRef(false);

  // Safety timeout for loading state
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        setShowForceRefresh(true);
      }
    }, 15000); // Increased to 15s to be more patient with cold connections
    return () => clearTimeout(timer);
  }, [loading]);

  const fetchProfile = useCallback(async (userId: string) => {
    if (fetchingRef.current === userId) return;
    fetchingRef.current = userId;
    
    console.log('--- fetchProfile START for', userId);
    try {
      // Add a race here too just in case the profile query hangs
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      const profileTimeout = new Promise<{data: null, error: Error}>((_, reject) => 
        setTimeout(() => reject(new Error('Profile fetch timed out')), 30000)
      );

      const { data, error } = await (Promise.race([profilePromise, profileTimeout]) as any);

      if (error) {
        console.warn('Profile fetch warning:', error);
      }
      
      if (data) {
        console.log('--- profile FOUND:', data.full_name);
        setProfile(data);
      } else {
        console.log('--- no profile record found yet');
      }
    } catch (error) {
      console.error('CRITICAL Error in fetchProfile:', error);
    } finally {
      fetchingRef.current = null;
      console.log('--- fetchProfile FINISHED, setting loading=false');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setConfigError('Supabase is not configured correctly. Please check secrets.');
      setLoading(false);
      return;
    }

    let mounted = true;

    // Consolidate auth initialization
    const initAuth = async () => {
      if (authInitializedRef.current) return;
      authInitializedRef.current = true;
      
      console.log('INITIALIZE: Step 1 (Auth Check)');
      
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{data: {session: null}, error: Error}>((_, reject) => 
          setTimeout(() => reject(new Error('Auth check timed out after 12s')), 12000)
        );

        const { data, error } = await (Promise.race([sessionPromise, timeoutPromise]) as any);
        
        if (error) throw error;
        
        const initialSession = data.session;
        console.log('INITIALIZE: Step 2 (Session Result):', !!initialSession);
        
        if (!mounted) return;

        if (initialSession) {
          setSession(initialSession);
          await fetchProfile(initialSession.user.id);
        } else {
          console.log('INITIALIZE: Step 2 (No session found)');
          setLoading(false);
        }
      } catch (err) {
        console.error('INITIALIZE: Error:', err);
        if (mounted) {
          setLoading(false);
          // If we timeout, we assume no session and allow manual login
          if (err instanceof Error && err.message.includes('timed out')) {
            console.warn('Auth check timed out, continuing to Login screen');
          }
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      setSession(prev => {
        if (JSON.stringify(prev) === JSON.stringify(session)) return prev;
        return session;
      });

      if (session) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 bg-white rounded-lg flex items-center justify-center p-1.5 shadow-sm border border-border">
                <img 
                  src="https://www.ginzalimited.com/cdn/shop/files/Ginza_logo.png" 
                  alt="Ginza" 
                  className="h-full w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
          <div className="text-center space-y-4">
            <div>
              <p className="text-sm text-foreground font-black tracking-tighter">Initializing Sales Pulse</p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest font-bold">Ginza Industries Ltd</p>
            </div>
            
            <div className="bg-secondary/20 p-4 rounded-xl border border-border/50 max-w-sm mx-auto">
              <p className="text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {isSupabaseConfigured 
                  ? (showForceRefresh 
                      ? "Connection seems slow. You can try a force refresh or check if your Supabase database is active."
                      : "Establishing secure connection to Supabase database...") 
                  : "Database configuration is missing. Please check your application secrets."}
              </p>
              {isSupabaseConfigured && !showForceRefresh && (
                <div className="mt-2 flex justify-center gap-1">
                  <div className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1 h-1 rounded-full bg-primary animate-bounce" />
                </div>
              )}
            </div>

            {showForceRefresh && (
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4 font-black text-[10px] uppercase tracking-widest h-10 px-6 rounded-xl border-primary/20 hover:bg-primary/5"
                onClick={() => window.location.reload()}
              >
                Force Page Refresh
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="flex items-center justify-center h-screen bg-background p-6">
        <div className="max-w-md w-full bg-destructive/10 border border-destructive/20 p-8 rounded-3xl text-center shadow-2xl shadow-destructive/10">
          <div className="w-16 h-16 bg-destructive/20 rounded-2xl flex items-center justify-center text-destructive mx-auto mb-6">
            <Database size={32} />
          </div>
          <h2 className="text-2xl font-extrabold text-foreground mb-3 tracking-tight">Configuration Required</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            {configError}
          </p>
          <div className="bg-card border border-border rounded-2xl p-4 text-left mb-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Detected Configuration:</p>
            <ul className="space-y-2">
              <li className="flex items-center justify-between text-xs font-medium">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${process.env.SUPABASE_URL ? 'bg-accent' : 'bg-destructive'}`} />
                  SUPABASE_URL
                </div>
                <span className="text-[10px] font-mono opacity-50">
                  {process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.substring(0, 12)}...` : 'MISSING'}
                </span>
              </li>
              <li className="flex items-center justify-between text-xs font-medium">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${process.env.SUPABASE_ANON_KEY ? 'bg-accent' : 'bg-destructive'}`} />
                  SUPABASE_ANON_KEY
                </div>
                <span className="text-[10px] font-mono opacity-50">
                  {process.env.SUPABASE_ANON_KEY ? '••••••••' + process.env.SUPABASE_ANON_KEY.slice(-4) : 'MISSING'}
                </span>
              </li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground italic mb-6">
            Tip: Only Supabase credentials are required. Google Sheets integration has been removed as requested.
          </p>
          <Button 
            onClick={() => window.location.reload()} 
            variant="outline" 
            className="w-full rounded-xl border-border hover:bg-secondary/50"
          >
            Refresh Configuration
          </Button>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <div className="flex h-screen bg-background font-sans overflow-hidden relative">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Fixed to ensure it doesn't push main content on mobile */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col p-6 shrink-0 transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-auto
        ${isSidebarOpen ? 'translate-x-0 shadow-2xl shadow-black/50' : '-translate-x-full'}
      `}>
        <div className="mb-10 flex flex-col items-start gap-6 w-full">
          <div className="flex items-center justify-between w-full lg:hidden">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1">
                <img 
                  src="https://www.ginzalimited.com/cdn/shop/files/Ginza_logo.png" 
                  alt="Ginza" 
                  className="h-full w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <span className="font-extrabold text-lg tracking-tighter text-sidebar-foreground">Sales Pulse</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} className="text-sidebar-foreground/50 hover:text-sidebar-foreground">
              <X size={20} />
            </Button>
          </div>
          
          <div className="hidden lg:flex flex-col gap-4">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center p-2.5 shadow-xl shadow-black/30 border border-white/10 group overflow-hidden relative">
              <img 
                src="https://www.ginzalimited.com/cdn/shop/files/Ginza_logo.png" 
                alt="Ginza Logo" 
                className="h-full w-full object-contain relative z-10"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-transparent" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tighter text-sidebar-foreground leading-none">Sales Pulse</h2>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/40 mt-1">Ginza Industries Ltd</p>
            </div>
          </div>
        </div>
        <nav className="flex-1">
          <ul className="space-y-1">
            <li 
              onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all ${
                activeTab === 'dashboard' 
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-bold shadow-sm' 
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground'
              }`}
            >
              <LayoutDashboard size={18} />
              Dashboard
            </li>
            <li 
              onClick={() => { setActiveTab('target-planning'); setIsSidebarOpen(false); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all ${
                activeTab === 'target-planning' 
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-bold shadow-sm' 
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground'
              }`}
            >
              <Database size={18} />
              Target Planning
            </li>
            <li 
              onClick={() => { setActiveTab('actual-entry'); setIsSidebarOpen(false); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all ${
                activeTab === 'actual-entry' 
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-bold shadow-sm' 
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground'
              }`}
            >
              <Database size={18} />
              Actual Entry
            </li>
            <li className="flex items-center gap-3 px-4 py-3 rounded-lg text-sidebar-foreground/30 font-medium cursor-not-allowed">
              <Users size={18} />
              Branches
            </li>
          </ul>
        </nav>

        <div className="mt-auto pt-6 border-t border-sidebar-border flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center font-bold text-sm text-primary-foreground shadow-lg shadow-primary/20">
            {profile?.full_name?.split(' ').map(n => n[0]).join('') || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{profile?.full_name || 'User'}</p>
            <p className="text-[10px] opacity-60 truncate uppercase tracking-widest font-bold">{profile?.role}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-xl">
            <LogOut size={16} />
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden pb-16 lg:pb-0">
        <header className="h-16 lg:h-20 px-4 lg:px-8 flex items-center justify-between shrink-0 border-b border-border/50 bg-background/95 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden shrink-0" 
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={20} />
            </Button>
            <div className="flex items-center gap-3">
              <img 
                src="https://www.ginzalimited.com/cdn/shop/files/Ginza_logo.png" 
                alt="Ginza" 
                className="h-6 w-auto object-contain brightness-0 lg:hidden"
                referrerPolicy="no-referrer"
              />
              <h1 className="text-base lg:text-2xl font-bold tracking-tight truncate">
                {activeTab === 'dashboard' ? 'Insights Overview' : activeTab === 'target-planning' ? 'Target Planning' : 'Monthly Actual Entry'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 lg:gap-4 shrink-0">
            <div className="text-[10px] lg:text-xs text-muted-foreground font-extrabold uppercase tracking-widest bg-secondary/80 px-2 lg:px-3 py-1 rounded-full whitespace-nowrap border border-border">
              {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-x-hidden overflow-y-auto px-4 lg:px-8 pb-10 pt-4 custom-scrollbar">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="hidden">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="target-planning">Target Planning</TabsTrigger>
              <TabsTrigger value="actual-entry">Actual Entry</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="mt-0 flex-1 outline-none ring-offset-background">
              <Suspense fallback={<DashboardSkeleton />}>
                <Dashboard profile={profile} />
              </Suspense>
            </TabsContent>
            <TabsContent value="target-planning" className="mt-0 flex-1 outline-none ring-offset-background">
              <Suspense fallback={<DataEntrySkeleton />}>
                <DataEntry profile={profile} view="planning" />
              </Suspense>
            </TabsContent>
            <TabsContent value="actual-entry" className="mt-0 flex-1 outline-none ring-offset-background">
              <Suspense fallback={<DataEntrySkeleton />}>
                <DataEntry profile={profile} view="actuals" />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border px-6 py-3 flex items-center justify-between z-40">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'dashboard' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <LayoutDashboard size={20} className={activeTab === 'dashboard' ? 'fill-primary/20' : ''} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('target-planning')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'target-planning' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <Database size={20} className={activeTab === 'target-planning' ? 'fill-primary/20' : ''} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Planning</span>
          </button>
          <button 
            onClick={() => setActiveTab('actual-entry')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'actual-entry' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <Database size={20} className={activeTab === 'actual-entry' ? 'fill-primary/20' : ''} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Actuals</span>
          </button>
          <button 
            disabled
            className="flex flex-col items-center gap-1 text-muted-foreground/30"
          >
            <Users size={20} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Branches</span>
          </button>
        </nav>
      </main>
      <Toaster position="top-right" />
    </div>
  );
}
