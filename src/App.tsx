import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/src/lib/supabase';
import { Profile } from '@/src/types';
import Login from '@/src/components/Login';
import Dashboard from '@/src/components/Dashboard';
import DataEntry from '@/src/components/DataEntry';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { LogOut, LayoutDashboard, Database, Users } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [configError, setConfigError] = useState<string | null>(null);

  const fetchingRef = useRef<string | null>(null);
  const authInitializedRef = useRef(false);

  const fetchProfile = useCallback(async (userId: string) => {
    if (fetchingRef.current === userId) return;
    fetchingRef.current = userId;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      
      if (data) {
        setProfile(prev => {
          if (prev?.id === data.id && JSON.stringify(prev) === JSON.stringify(data)) return prev;
          return data;
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      fetchingRef.current = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase.auth) {
      setConfigError('Supabase is not configured correctly. Please check secrets.');
      setLoading(false);
      return;
    }

    let mounted = true;

    // Consolidate auth initialization
    const initAuth = async () => {
      if (authInitializedRef.current) return;
      
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (initialSession) {
          setSession(initialSession);
          await fetchProfile(initialSession.user.id);
        } else {
          setLoading(false);
        }
        
        authInitializedRef.current = true;
      } catch (err) {
        console.error('Auth init error:', err);
        if (mounted) setLoading(false);
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
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground font-medium">Initializing SalesPulse...</p>
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
            Tip: After adding secrets, you may need to refresh the page or restart the dev server.
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
    <div className="flex h-screen bg-background font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col p-6 shrink-0">
        <div className="text-xl font-extrabold tracking-tighter text-primary mb-10">
          SalesPulse.
        </div>
        <nav className="flex-1">
          <ul className="space-y-1">
            <li 
              onClick={() => setActiveTab('dashboard')}
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
              onClick={() => setActiveTab('data-entry')}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all ${
                activeTab === 'data-entry' 
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-bold shadow-sm' 
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground'
              }`}
            >
              <Database size={18} />
              Data Entry
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
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-20 px-8 flex items-center justify-between shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">
            {activeTab === 'dashboard' ? 'Insights Overview' : 'Sales Data Entry'}
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest bg-secondary/50 px-3 py-1.5 rounded-full">
              {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 pb-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="hidden">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="data-entry">Data Entry</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="mt-0 flex-1 outline-none">
              <Dashboard profile={profile} />
            </TabsContent>
            <TabsContent value="data-entry" className="mt-0 flex-1 outline-none">
              <DataEntry profile={profile} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Toaster position="top-right" />
    </div>
  );
}
