import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Mail, Lock, X, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (!isSupabaseConfigured) {
        throw new Error('Database is not configured. Please add SUPABASE_URL and SUPABASE_ANON_KEY to your secrets.');
      }

      // Ensure a clean start for the new auth attempt
      if (typeof window !== 'undefined') {
        console.log('--- PREPARING AUTH ---');
      }

      console.log('Attempting sign in for:', email);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        if (error.message.includes('Email not confirmed')) {
          throw new Error('Your email has not been confirmed yet. Please check your inbox for the verification link.');
        }
        throw error;
      }

      if (data.user) {
        // Check if profile exists, if not create it (safe fallback for existing users)
        const { data: existingProfile, error: fetchError } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('id', data.user.id)
          .maybeSingle();

        if (fetchError) {
          console.error('Error checking existing profile:', fetchError);
        }

        if (!existingProfile) {
          console.log('Profile missing on login, initializing as Sales Person...');
          await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              email: email,
              role: data.user.user_metadata?.role || 'Sales Person',
              full_name: data.user.user_metadata?.full_name || email.split('@')[0],
              branch_ids: data.user.user_metadata?.branch_ids || [],
              updated_at: new Date().toISOString()
            });
        }
      }
      
      toast.success('Logged in successfully');
    } catch (error: any) {
      console.error('Auth handler error:', error);
      toast.error(error.message || 'An unexpected error occurred', {
        duration: 5000
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 md:p-6 font-sans">
      <Card className="w-full max-w-lg shadow-2xl border-border rounded-3xl overflow-hidden bg-card">
        <CardHeader className="space-y-2 text-center bg-secondary/30 pb-6 pt-8 md:pb-8 md:pt-10 border-b border-border">
          <div className="mx-auto mb-4">
            <img 
              src="https://www.ginzalimited.com/cdn/shop/files/Ginza_logo.png" 
              alt="GINZA Logo" 
              className="h-12 md:h-16 object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <CardTitle className="text-xl md:text-2xl lg:text-3xl font-black tracking-tighter text-foreground flex flex-col items-center gap-1">
            <div className="flex items-center gap-2 text-primary italic">
              <ShieldCheck className="h-6 w-6" />
              <span>SalesPulse</span>
            </div>
            <span className="text-[10px] md:text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground/60">Professional Portal</span>
          </CardTitle>
          <CardDescription className="text-xs md:text-sm text-muted-foreground font-medium px-4">
            Access your SalesPulse dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 md:p-8 space-y-6">
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="off"
                  className="pl-11 h-12 bg-secondary/20 border-border focus-visible:ring-primary rounded-xl shadow-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="off"
                  className="pl-11 h-12 bg-secondary/20 border-border focus-visible:ring-primary rounded-xl shadow-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98] mt-4" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
      
      <div className="mt-8 text-center">
        <button 
          onClick={async () => {
            if (confirm('This will clear all saved sessions and cookies for this app. Use this if you are seeing the wrong account. Continue?')) {
              await supabase.auth.signOut();
              localStorage.clear();
              sessionStorage.clear();
              window.location.reload();
            }
          }}
          className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-primary transition-colors flex items-center gap-2"
        >
          <X size={12} />
          Trouble with account? Clear Data & Reset
        </button>
      </div>
    </div>
  );
}
