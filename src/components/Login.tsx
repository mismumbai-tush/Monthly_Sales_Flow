import React, { useState } from 'react';
import { supabase } from '@/src/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Mail, Lock, LayoutDashboard, User, Building2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { BRANCHES } from '@/src/constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, X } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<'Sales Person' | 'Branch Head' | 'Admin'>('Sales Person');
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (isSignUp) {
        if (!firstName || !lastName) throw new Error('First and Last name are required');
        if (role !== 'Admin' && selectedBranches.length === 0) throw new Error('Please select at least one branch');

        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: {
              full_name: `${firstName} ${lastName}`,
              role: role,
              branch_ids: role === 'Admin' ? [] : selectedBranches
            }
          }
        });
        if (error) throw error;
        toast.success('Sign up successful! Please check your email or sign in.');
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Logged in successfully');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleBranch = (branch: string) => {
    console.log('Toggling branch:', branch, 'for role:', role);
    if (role === 'Sales Person') {
      setSelectedBranches([branch]);
    } else {
      setSelectedBranches(prev => 
        prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch]
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 md:p-6 font-sans">
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
            <span className="text-primary italic">SalesPulse</span>
            <span className="text-[10px] md:text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground/60">Ginza Industries Ltd</span>
          </CardTitle>
          <CardDescription className="text-xs md:text-sm text-muted-foreground font-medium px-4">
            {isSignUp ? 'Create your professional account' : 'Access your SalesPulse dashboard'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 md:p-8 space-y-6">
          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">First Name</Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="firstName"
                      placeholder="John"
                      className="pl-11 h-12 bg-secondary/20 border-border focus-visible:ring-primary rounded-xl shadow-none"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Last Name</Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      className="pl-11 h-12 bg-secondary/20 border-border focus-visible:ring-primary rounded-xl shadow-none"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
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
                  className="pl-11 h-12 bg-secondary/20 border-border focus-visible:ring-primary rounded-xl shadow-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {isSignUp && (
              <>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Select Role</Label>
                  <Select value={role} onValueChange={(v: any) => {
                    setRole(v);
                    setSelectedBranches([]);
                  }}>
                    <SelectTrigger className="h-12 bg-secondary/20 border-border rounded-xl shadow-none font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sales Person" className="font-bold">Sales Person</SelectItem>
                      <SelectItem value="Branch Head" className="font-bold">Branch Head</SelectItem>
                      <SelectItem value="Admin" className="font-bold">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {role !== 'Admin' && (
                  <div className="space-y-3 p-4 bg-secondary/10 rounded-2xl border border-border/50">
                    <div className="flex items-center justify-between px-1">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {role === 'Sales Person' ? 'Select Branch (Single)' : 'Select Branches (Multiple)'}
                      </Label>
                      {role === 'Branch Head' && selectedBranches.length > 0 && (
                        <button 
                          type="button"
                          onClick={() => setSelectedBranches([])}
                          className="text-[10px] font-bold text-primary hover:underline"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {BRANCHES.map(branch => {
                        const isSelected = selectedBranches.includes(branch);
                        return (
                          <button
                            key={branch}
                            type="button"
                            onClick={() => toggleBranch(branch)}
                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border text-left ${
                              isSelected 
                              ? 'bg-primary/10 border-primary text-primary shadow-sm shadow-primary/10' 
                              : 'bg-card border-border hover:border-primary/50 text-muted-foreground'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-all ${
                              isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                            }`}>
                              {isSelected && <Check size={12} className="text-primary-foreground stroke-[4px]" />}
                            </div>
                            <span className="text-xs font-bold truncate">
                              {branch}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {role === 'Branch Head' && (
                      <p className="text-[10px] text-muted-foreground text-center italic mt-1 font-medium">
                        {selectedBranches.length} branches selected
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            <Button type="submit" className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98] mt-4" disabled={loading}>
              {loading ? (isSignUp ? 'Creating Account...' : 'Signing in...') : (isSignUp ? 'Create Account' : 'Sign In')}
            </Button>
          </form>

          <div className="text-center pt-2">
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs font-black text-primary hover:underline uppercase tracking-widest"
            >
              {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Create one'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
