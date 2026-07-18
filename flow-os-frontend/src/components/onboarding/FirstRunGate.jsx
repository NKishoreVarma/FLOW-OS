/**
 * First-Run Gate (Phase 17, M2).
 *
 * On load, if this workspace hasn't finished onboarding, route to /welcome. Fails OPEN:
 * any error, or an already-complete/dismissed flag, leaves the user where they are — it
 * never traps an existing session (the flow itself offers "Skip for now").
 */

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onboardingApi } from '../../lib/onboardingApi';

export default function FirstRunGate() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/welcome') return;
    if (localStorage.getItem('flow_onboarding_complete') === 'true') return;
    if (localStorage.getItem('flow_onboarding_dismissed') === 'true') return;
    let cancelled = false;
    onboardingApi.state()
      .then((s) => {
        if (cancelled || !s) return;
        if (s.completed) { localStorage.setItem('flow_onboarding_complete', 'true'); return; }
        navigate('/welcome');
      })
      .catch(() => { /* fail open — never block the app on the gate */ });
    return () => { cancelled = true; };
  }, [location.pathname, navigate]);

  return null;
}
