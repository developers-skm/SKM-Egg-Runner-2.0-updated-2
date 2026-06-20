import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { getRewardWallet, calcLevel, type RewardWallet } from '../services/protein/proteinTrackerService';
import { GiftIcon, ZapIcon, CoinIcon, LockIcon, UnlockIcon, TrophyIcon, GamepadIcon, CheckCircleIcon, StarIcon } from './Icons';

interface RewardsScreenProps { user: User; refreshKey: number; }

interface Unlockable {
  id:          string;
  title:       string;
  description: string;
  type:        'skin' | 'title' | 'coupon' | 'feature';
  cost:        number;
  currency:    'coins' | 'xp';
  preview?:    string;
  requiredLevel?: number;
}

const UNLOCKABLES: Unlockable[] = [
  { id: 'title_tracker',    title: 'Protein Tracker',    description: 'Exclusive player title',           type: 'title',   cost: 50,   currency: 'coins' },
  { id: 'title_egglord',    title: 'Egg Lord',           description: 'Rare player title',                type: 'title',   cost: 200,  currency: 'coins', requiredLevel: 5 },
  { id: 'title_legend',     title: 'SKM Legend',         description: 'Ultra-rare title for top players', type: 'title',   cost: 1000, currency: 'coins', requiredLevel: 10 },
  { id: 'skin_gold',        title: 'Gold Egg Runner',    description: 'Unlock the Gold Egg skin in game', type: 'skin',    cost: 500,  currency: 'coins', requiredLevel: 5 },
  { id: 'skin_red',         title: 'SKM Red Runner',     description: 'Unlock the SKM Red skin in game',  type: 'skin',    cost: 300,  currency: 'coins', requiredLevel: 3 },
  { id: 'feature_streak',   title: 'Streak Shield',      description: 'Protect streak for 1 missed day',  type: 'feature', cost: 150,  currency: 'coins', requiredLevel: 4 },
  { id: 'coupon_5pct',      title: '5% SKM Discount',    description: 'Discount coupon for SKM products', type: 'coupon',  cost: 400,  currency: 'coins', requiredLevel: 3 },
  { id: 'coupon_10pct',     title: '10% SKM Discount',   description: 'Premium coupon for SKM products',  type: 'coupon',  cost: 800,  currency: 'coins', requiredLevel: 7 },
];

export default function RewardsScreen({ user, refreshKey }: RewardsScreenProps) {
  const [wallet,   setWallet]   = useState<RewardWallet | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<'all' | 'skin' | 'title' | 'coupon' | 'feature'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const wl = await getRewardWallet(user.uid);
      setWallet(wl);
    } catch (e) { console.error('[Rewards]', e); }
    finally { setLoading(false); }
  }, [user.uid]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const levelInfo = calcLevel(wallet?.totalXP ?? 0);
  const coins     = wallet?.coins ?? 0;
  const xp        = wallet?.totalXP ?? 0;

  const filtered = UNLOCKABLES.filter(u => filter === 'all' || u.type === filter);

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#D71920,#B31217)', padding: '20px 20px 20px', flexShrink: 0, boxShadow: '0 4px 20px rgba(215,25,32,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GiftIcon size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Rewards</h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 2 }}>Spend coins to unlock exclusive items</p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

        {/* Wallet card */}
        <div style={{ background: '#fff', borderRadius: 24, padding: 20, margin: '14px 16px 0', boxShadow: '0 4px 20px rgba(0,0,0,0.09)' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>Your Wallet</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <WalletTile icon={<CoinIcon size={18} color="#D97706" />} value={coins.toLocaleString()} label="Coins" bg="#FEF3C7" color="#D97706" />
            <WalletTile icon={<ZapIcon size={18} color="#D71920" />}   value={xp.toLocaleString()}    label="XP"    bg="#FCE8E8" color="#D71920" />
            <WalletTile icon={<StarIcon size={18} color="#8B5CF6" />}  value={`Lv ${levelInfo.level}`} label={levelInfo.title} bg="#F5F3FF" color="#8B5CF6" />
          </div>

          {/* Earn more */}
          <div style={{ marginTop: 14, padding: '12px 14px', background: '#F8F8F8', borderRadius: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#999', margin: '0 0 6px' }}>How to earn coins</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                '+5 coins  — Scan an SKM egg QR',
                '+20 coins — Reach your daily goal',
                'Claim challenge rewards for bonus coins',
              ].map((t, i) => (
                <p key={i} style={{ fontSize: 11, color: '#666', margin: 0, fontWeight: 500 }}>{t}</p>
              ))}
            </div>
          </div>
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {(['all','skin','title','coupon','feature'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              flexShrink: 0, padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, textTransform: 'capitalize',
              background: filter === f ? '#D71920' : '#fff',
              color:      filter === f ? '#fff' : '#666',
              boxShadow:  filter === f ? '0 3px 10px rgba(215,25,32,0.3)' : '0 1px 4px rgba(0,0,0,0.06)',
            }}>
              {f === 'all' ? 'All Items' : f}
            </button>
          ))}
        </div>

        {/* Unlockables grid */}
        <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(item => {
            const canAfford = item.currency === 'coins' ? coins >= item.cost : xp >= item.cost;
            const meetsLevel = !item.requiredLevel || levelInfo.level >= item.requiredLevel;
            const available  = canAfford && meetsLevel;
            return (
              <div key={item.id} style={{
                background: '#fff', borderRadius: 18, padding: '16px 16px',
                display: 'flex', alignItems: 'center', gap: 14,
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                opacity: available ? 1 : 0.65,
              }}>
                {/* Icon */}
                <div style={{
                  width: 48, height: 48, borderRadius: 15, flexShrink: 0,
                  background: item.type === 'skin' ? '#FCE8E8' : item.type === 'title' ? '#F5F3FF' : item.type === 'coupon' ? '#FEF3C7' : '#F0FDF4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.type === 'skin'    && <GamepadIcon size={22} color="#D71920" />}
                  {item.type === 'title'   && <TrophyIcon size={22} color="#8B5CF6" />}
                  {item.type === 'coupon'  && <GiftIcon size={22} color="#D97706" />}
                  {item.type === 'feature' && <ZapIcon size={22} color="#22C55E" />}
                </div>

                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>{item.title}</p>
                  <p style={{ fontSize: 11, color: '#999', margin: '2px 0 6px', fontWeight: 500 }}>{item.description}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {item.currency === 'coins' ? <CoinIcon size={12} color="#D97706" /> : <ZapIcon size={12} color="#D71920" />}
                      <span style={{ fontSize: 12, fontWeight: 900, color: item.currency === 'coins' ? '#D97706' : '#D71920' }}>
                        {item.cost.toLocaleString()} {item.currency}
                      </span>
                    </div>
                    {item.requiredLevel && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#8B5CF6', background: '#F5F3FF', padding: '2px 7px', borderRadius: 7 }}>
                        Lv {item.requiredLevel}+
                      </span>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div style={{ flexShrink: 0 }}>
                  {available ? (
                    <button style={{
                      padding: '8px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff',
                      fontWeight: 900, fontSize: 12,
                    }}>
                      Unlock
                    </button>
                  ) : !meetsLevel ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <LockIcon size={16} color="#ccc" />
                      <span style={{ fontSize: 9, color: '#bbb', fontWeight: 700 }}>Lv {item.requiredLevel}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <CoinIcon size={16} color="#bbb" />
                      <span style={{ fontSize: 9, color: '#bbb', fontWeight: 700 }}>Need more</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Earn more CTA */}
        <div style={{ background: 'linear-gradient(135deg,#D71920,#B31217)', borderRadius: 20, padding: 18, margin: '12px 16px 0', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 4px 16px rgba(215,25,32,0.3)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ZapIcon size={24} color="#fff" />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 900, color: '#fff', margin: 0 }}>Earn More Coins</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', margin: 0, marginTop: 3 }}>Scan eggs and complete challenges to build your wallet.</p>
          </div>
        </div>

      </div>
    </div>
  );
}

function WalletTile({ icon, value, label, bg, color }: { icon: React.ReactNode; value: string; label: string; bg: string; color: string }) {
  return (
    <div style={{ background: bg, borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>{icon}</div>
      <p style={{ fontSize: 16, fontWeight: 900, color, margin: 0, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 9, fontWeight: 700, color, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 0.3, margin: '3px 0 0' }}>{label}</p>
    </div>
  );
}
