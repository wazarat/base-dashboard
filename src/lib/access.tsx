"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AUTH_ENABLED } from "./auth-config";
import { allowed, encodePending, PENDING_KEY, type GatedAction, type PendingAction } from "./gate";
import { reportSignup, trackLoginPrompt, type LoginTrigger } from "./track";

/**
 * Login state for the whole app (owner prompt, login wall phase 1). Components ask
 * `can()`; when the answer is no they call `openLogin()`, optionally saving the action
 * so it finishes after sign-in. With no Clerk keys the wall is off and `can()` is always true.
 */
export interface Access {
  enabled: boolean;
  loaded: boolean;
  signedIn: boolean;
  can: (target: { path: string } | { action: GatedAction }) => boolean;
  loginOpen: boolean;
  setLoginOpen: (open: boolean) => void;
  /** Opens the login pop-up; `trigger` says where it came from (analytics), `pending` is the action to finish after sign-in. */
  openLogin: (trigger: LoginTrigger, pending?: PendingAction) => void;
  signIn: () => void;
  signUp: () => void;
}

const OFF: Access = {
  enabled: false,
  loaded: true,
  signedIn: false,
  can: () => true,
  loginOpen: false,
  setLoginOpen: () => {},
  openLogin: () => {},
  signIn: () => {},
  signUp: () => {},
};

const AccessContext = createContext<Access>(OFF);

export function useAccess(): Access {
  return useContext(AccessContext);
}

function savePending(p: PendingAction | undefined) {
  try {
    if (p) window.sessionStorage.setItem(PENDING_KEY, encodePending(p));
  } catch {
    /* storage unavailable: the action is simply not replayed */
  }
}

function ClerkAccess({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const [loginOpen, setLoginOpen] = useState(false);
  const signedIn = Boolean(isSignedIn);
  const can = useCallback((t: { path: string } | { action: GatedAction }) => allowed(t, signedIn, true), [signedIn]);
  const openLogin = useCallback((trigger: LoginTrigger, p?: PendingAction) => {
    savePending(p);
    trackLoginPrompt(trigger);
    setLoginOpen(true);
  }, []);
  // A new account created after this session's login prompt counts as a sign-up from that prompt (survives Clerk's reload).
  const createdAt = user?.createdAt?.getTime();
  useEffect(() => {
    if (signedIn && createdAt) reportSignup(createdAt);
  }, [signedIn, createdAt]);
  // Clerk's own modals, so the reader never leaves the page; after sign-in they land back on this URL.
  const signIn = useCallback(() => {
    setLoginOpen(false);
    void clerk.openSignIn({ forceRedirectUrl: window.location.href, signUpForceRedirectUrl: window.location.href });
  }, [clerk]);
  const signUp = useCallback(() => {
    setLoginOpen(false);
    void clerk.openSignUp({ forceRedirectUrl: window.location.href, signInForceRedirectUrl: window.location.href });
  }, [clerk]);
  const value = useMemo<Access>(
    () => ({ enabled: true, loaded: isLoaded, signedIn, can, loginOpen: loginOpen && !signedIn, setLoginOpen, openLogin, signIn, signUp }),
    [isLoaded, signedIn, can, loginOpen, openLogin, signIn, signUp],
  );
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function AccessProvider({ children }: { children: ReactNode }) {
  return AUTH_ENABLED ? <ClerkAccess>{children}</ClerkAccess> : <AccessContext.Provider value={OFF}>{children}</AccessContext.Provider>;
}
