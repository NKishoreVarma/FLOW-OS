/**
 * TrustBar (Phase 17, M3) — Track 8.
 *
 * Reinforces trust everywhere it's placed: which systems are connected, their health,
 * where data comes from, and a link to the exact permissions. Nothing magical —
 * everything explainable. Reads /api/connectors + /api/connectors/health; degrades
 * gracefully to an honest "no systems connected yet".
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Circle, ArrowUpRight } from 'lucide-react';
import { trustApi } from '../../lib/trustApi';

const HEALTH_COLOR = { HEALTHY: 'var(--p-normal)', DEGRADED: 'var(--p-high)', DOWN: 'var(--p-critical)' };

export default function TrustBar({ compact = false }) {
  const [connectors, setConnectors] = useState(null);
  const [health, setHealth] = useState({});

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([trustApi.connectors(), trustApi.health()]).then(([c, h]) => {
      if (cancelled) return;
      if (c.status === 'fulfilled') setConnectors(c.value?.connectors || []);
      else setConnectors([]);
      if (h.status === 'fulfilled') {
        const map = {};
        const items = h.value?.results || h.value?.connectors || h.value || [];
        (Array.isArray(items) ? items : Object.values(items)).forEach((r) => { if (r?.id) map[r.id] = (r.status || r.health || 'HEALTHY').toUpperCase(); });
        setHealth(map);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const list = connectors || [];
  const connected = list.filter((c) => c.authenticated || c.status === 'connected' || c.status === 'CONNECTED');

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: compact ? '12px 14px' : '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <ShieldCheck size={15} style={{ color: 'var(--brand)' }} />
        <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.02em', color: 'var(--t2)' }}>TRUST &amp; DATA SOURCES</span>
        <Link to="/settings/permissions" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--brand-text)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          Manage permissions <ArrowUpRight size={12} />
        </Link>
      </div>
      {list.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--t4)', margin: 0 }}>No systems connected yet — FLOW only understands what you explicitly connect and allow.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {list.map((c) => {
            const isOn = connected.includes(c);
            const hcolor = HEALTH_COLOR[health[c.id]] || (isOn ? 'var(--p-normal)' : 'var(--t5)');
            return (
              <div key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-base)', color: isOn ? 'var(--t1)' : 'var(--t4)' }}>
                <Circle size={8} fill={hcolor} color={hcolor} />
                {c.name || c.id}
                <span style={{ fontSize: 10, color: 'var(--t5)' }}>{isOn ? 'connected' : 'not connected'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
