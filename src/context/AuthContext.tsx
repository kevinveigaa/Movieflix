import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, Subscription, ViewerProfile } from '@/types';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  subscription: Subscription | null;
  loading: boolean;
  activeViewerProfile: ViewerProfile | null;
  setActiveViewerProfile: (p: ViewerProfile | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const PROFILE_KEY = 'movieflix_active_profile';

function loadSavedProfile(): ViewerProfile | null {
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeViewerProfile, setActiveViewerProfileState] = useState<ViewerProfile | null>(loadSavedProfile);

  function setActiveViewerProfile(p: ViewerProfile | null) {
    setActiveViewerProfileState(p);
    if (p) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    } else {
      localStorage.removeItem(PROFILE_KEY);
    }
  }

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (!data) {
      const email = (await supabase.auth.getUser()).data.user?.email ?? '';
      const { data: created } = await supabase
        .from('profiles')
        .insert({ id: userId, email })
        .select()
        .maybeSingle();
      setProfile(created as Profile | null);
    } else {
      setProfile(data as Profile);
    }
  }

  async function loadSubscription(userId: string) {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setSubscription(data as Subscription | null);
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        Promise.all([loadProfile(data.session.user.id), loadSubscription(data.session.user.id)]).finally(() =>
          mounted && setLoading(false),
        );
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        setSession(sess);
        if (sess) {
          await Promise.all([loadProfile(sess.user.id), loadSubscription(sess.user.id)]);
        } else {
          setProfile(null);
          setSubscription(null);
          setActiveViewerProfile(null);
        }
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      subscription,
      loading,
      activeViewerProfile,
      setActiveViewerProfile,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signUp(email, password) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          await supabase.from('profiles').insert({ id: data.user.id, email }).maybeSingle();
        }
      },
      async signOut() {
        localStorage.removeItem(PROFILE_KEY);
        await supabase.auth.signOut();
      },
      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (error) throw error;
      },
      async refreshProfile() {
        if (session?.user.id) await loadProfile(session.user.id);
      },
      async refreshSubscription() {
        if (session?.user.id) await loadSubscription(session.user.id);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, profile, subscription, loading, activeViewerProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function hasActiveSubscription(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.status !== 'active') return false;
  if (sub.expires_at && new Date(sub.expires_at) < new Date()) return false;
  return true;
}
