import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Preserves the existing User reference when Supabase emits a visibilitychange
 * or token-refresh event for the exact same authenticated user. This prevents
 * unnecessary full-tree re-renders and data re-fetches on tab switch.
 */
function pickStableUser(prev: User | null, next: User | null): User | null {
  if (prev === next) return prev;
  if (!prev || !next) return next;
  if (prev.id === next.id && prev.email === next.email) {
    return prev;
  }
  return next;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore the session on page load
    supabase.auth.getSession().then(({ data }) => {
      setUser((prev) => pickStableUser(prev, data.session?.user ?? null));
      setIsLoading(false);
    });

    // Track session changes (sign-in, sign-out, token refresh)
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser((prev) => pickStableUser(prev, session?.user ?? null));
      setIsLoading(false);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async () => {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
    } catch (error) {
      console.error('Sign-in failed:', error);
    }
  }, []);

  const logOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Sign-out failed:', error);
    }
  }, []);

  const contextValue = useMemo(
    () => ({ user, isLoading, signIn, logOut }),
    [user, isLoading, signIn, logOut],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
