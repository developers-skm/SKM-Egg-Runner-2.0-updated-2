/**
 * /notify/* — all notification endpoints
 *
 * Every route:
 *   1. Requires a valid Firebase ID token (Authorization: Bearer <token>)
 *   2. Validates that the uid in the token matches the uid in the body
 *      (users can only trigger their own notifications)
 *   3. Reads FCM token from Firestore via Admin SDK
 *   4. Sends push via Admin SDK messaging.send()
 *   5. Logs: type, uid, success/failure
 *
 * Routes:
 *   POST /notify/login
 *   POST /notify/protein
 *   POST /notify/streak
 *   POST /notify/game
 *   POST /notify/achievement
 *   POST /notify/daily-summary
 *   POST /notify/broadcast    (admin only — checks role in Firestore)
 *   GET  /notify/debug        (admin only — returns token count)
 */

import { Router, type Request, type Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import {
  sendToUser,
  broadcastToAll,
  clickActionFor,
  getAllTokens,
  type PushPayload,
  type NotifPriority,
} from '../services/fcm';

export const notifyRoutes = Router();

// ─── Auth guard on all routes ─────────────────────────────────────────────────

notifyRoutes.use(requireAuth);

// ─── Guard: caller uid must match body uid (except broadcasts) ────────────────

function uidGuard(req: Request, res: Response, bodyUid: string): boolean {
  const callerUid = (req as AuthRequest).uid;
  if (callerUid !== bodyUid) {
    console.warn(`[Auth] UID mismatch: caller=${callerUid} body=${bodyUid}`);
    res.status(403).json({ error: 'You can only send notifications to yourself.' });
    return false;
  }
  return true;
}

// ─── Guard: developer role check ─────────────────────────────────────────────

async function isDeveloper(uid: string): Promise<boolean> {
  try {
    const snap = await getFirestore().collection('users').doc(uid).get();
    return snap.data()?.role === 'developer';
  } catch {
    return false;
  }
}

// ─── POST /notify/login ───────────────────────────────────────────────────────
// Body: { uid, email? }

notifyRoutes.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { uid, email } = req.body ?? {};
  if (!uid) { res.status(400).json({ error: 'uid is required' }); return; }
  if (!uidGuard(req, res, uid)) return;

  const payload: PushPayload = {
    title:       '👋 Welcome Back!',
    body:        'Welcome back to SKM. Your account has been signed in successfully.',
    type:        'login',
    clickAction: clickActionFor('login'),
    priority:    'normal',
    data:        email ? { email } : {},
  };

  console.info(`[NOTIFY] login uid=${uid}`);
  const result = await sendToUser(uid, payload);

  if (result.ok) {
    res.json({ success: true, uid, type: 'login' });
  } else {
    // Not an error the client needs to retry — just no token yet
    res.json({ success: false, uid, type: 'login', reason: result.error });
  }
});

// ─── POST /notify/protein ─────────────────────────────────────────────────────
// Body: { uid, grams, total, type? }
//   type: 'protein_added' | 'protein_goal_complete' | 'protein_duplicate'
//         | 'protein_reminder' | 'daily_goal_reminder' | 'golden_egg_scanned'

notifyRoutes.post('/protein', async (req: Request, res: Response): Promise<void> => {
  const { uid, grams, total, type = 'protein_added', title, body } = req.body ?? {};
  if (!uid) { res.status(400).json({ error: 'uid is required' }); return; }
  if (!uidGuard(req, res, uid)) return;

  let pushTitle: string = title ?? '';
  let pushBody:  string = body  ?? '';
  let priority: NotifPriority = 'normal';

  if (!pushTitle) {
    switch (type) {
      case 'protein_goal_complete':
        pushTitle = '🎯 Daily Protein Goal Reached!';
        pushBody  = `Congratulations! You hit ${total ?? ''}g today. You're on fire!`;
        priority  = 'high';
        break;
      case 'protein_duplicate':
        pushTitle = '⚠️ Duplicate Egg Detected';
        pushBody  = 'This egg has already been consumed today.';
        break;
      case 'protein_reminder':
        pushTitle = '🥚 Time to Fuel Your Day!';
        pushBody  = "Don't forget today's protein. Scan an SKM Egg and earn +6g protein.";
        break;
      case 'daily_goal_reminder':
        pushTitle = '💪 Almost There!';
        pushBody  = `You're close to today's protein goal. Keep going!`;
        break;
      case 'golden_egg_scanned':
        pushTitle = '🥇 Golden Egg Scanned!';
        pushBody  = 'You found a Golden Egg. Unlimited plays unlocked!';
        priority  = 'high';
        break;
      default: // protein_added
        pushTitle = `+${grams ?? '?'}g Protein Added`;
        pushBody  = `Your daily protein is now ${total ?? '?'}g. Keep it up!`;
    }
  }

  const payload: PushPayload = {
    title: pushTitle, body: pushBody, type, priority,
    clickAction: clickActionFor(type),
    data: { grams: String(grams ?? ''), total: String(total ?? '') },
  };

  console.info(`[NOTIFY] protein/${type} uid=${uid}`);
  const result = await sendToUser(uid, payload);
  res.json({ success: result.ok, uid, type, reason: result.error });
});

// ─── POST /notify/streak ──────────────────────────────────────────────────────
// Body: { uid, days, type? }
//   type: 'streak_milestone' | 'streak_reminder'

notifyRoutes.post('/streak', async (req: Request, res: Response): Promise<void> => {
  const { uid, days, type = 'streak_milestone', title, body } = req.body ?? {};
  if (!uid) { res.status(400).json({ error: 'uid is required' }); return; }
  if (!uidGuard(req, res, uid)) return;

  let pushTitle: string = title ?? '';
  let pushBody:  string = body  ?? '';
  let priority: NotifPriority = 'high';

  if (!pushTitle) {
    switch (type) {
      case 'streak_reminder':
        pushTitle = `⏰ Don't Lose Your ${days ?? '?'}-Day Streak!`;
        pushBody  = 'Record today\'s egg before midnight to keep your streak alive!';
        priority  = 'high';
        break;
      default: // streak_milestone
        pushTitle = `🔥 ${days ?? '?'}-Day Streak!`;
        pushBody  = `You've maintained your protein streak for ${days ?? '?'} days straight. Incredible!`;
    }
  }

  const payload: PushPayload = {
    title: pushTitle, body: pushBody, type, priority,
    clickAction: clickActionFor(type),
    data: { days: String(days ?? '') },
  };

  console.info(`[NOTIFY] streak/${type} uid=${uid} days=${days}`);
  const result = await sendToUser(uid, payload);
  res.json({ success: result.ok, uid, type, reason: result.error });
});

// ─── POST /notify/game ────────────────────────────────────────────────────────
// Body: { uid, score?, plays?, missionName?, type? }
//   type: 'new_high_score' | 'game_reminder' | 'mission_complete'
//         | 'qr_validated' | 'run_completed'

notifyRoutes.post('/game', async (req: Request, res: Response): Promise<void> => {
  const { uid, score, plays, missionName, type = 'game_reminder', title, body } = req.body ?? {};
  if (!uid) { res.status(400).json({ error: 'uid is required' }); return; }
  if (!uidGuard(req, res, uid)) return;

  let pushTitle: string = title ?? '';
  let pushBody:  string = body  ?? '';
  let priority: NotifPriority = 'normal';

  if (!pushTitle) {
    switch (type) {
      case 'new_high_score':
        pushTitle = '🏆 New High Score!';
        pushBody  = `You set a new personal best of ${Number(score).toLocaleString()} points!`;
        priority  = 'high';
        break;
      case 'mission_complete':
        pushTitle = '✅ Mission Complete!';
        pushBody  = `You completed "${missionName ?? 'a mission'}". Claim your reward!`;
        break;
      case 'qr_validated':
        pushTitle = '✅ QR Code Validated';
        pushBody  = `Access granted! You have ${plays ?? '?'} play${plays !== 1 ? 's' : ''} available.`;
        break;
      case 'run_completed':
        pushTitle = '🐔 Run Complete!';
        pushBody  = `Your run score: ${Number(score).toLocaleString()} points. Keep training!`;
        break;
      default: // game_reminder
        pushTitle = '🎮 Ready for Another Run?';
        pushBody  = 'Your chicken is warmed up and ready to race. Tap to play!';
        priority  = 'low';
    }
  }

  const payload: PushPayload = {
    title: pushTitle, body: pushBody, type, priority,
    clickAction: clickActionFor(type),
    data: {
      score: String(score ?? ''),
      plays: String(plays ?? ''),
      missionName: missionName ?? '',
    },
  };

  console.info(`[NOTIFY] game/${type} uid=${uid}`);
  const result = await sendToUser(uid, payload);
  res.json({ success: result.ok, uid, type, reason: result.error });
});

// ─── POST /notify/achievement ─────────────────────────────────────────────────
// Body: { uid, achievementName?, total?, rank?, type? }

notifyRoutes.post('/achievement', async (req: Request, res: Response): Promise<void> => {
  const { uid, achievementName, total, rank, type = 'achievement_unlocked', title, body } = req.body ?? {};
  if (!uid) { res.status(400).json({ error: 'uid is required' }); return; }
  if (!uidGuard(req, res, uid)) return;

  let pushTitle: string = title ?? '';
  let pushBody:  string = body  ?? '';
  const priority: NotifPriority = 'high';

  if (!pushTitle) {
    switch (type) {
      case 'protein_milestone':
        pushTitle = `🏅 ${total ?? '?'}g Protein Milestone!`;
        pushBody  = `You've consumed ${total ?? '?'}g of protein total. Champion!`;
        break;
      case 'champion_rank_improved':
        pushTitle = '🏆 Champion Hall Rank Improved!';
        pushBody  = `Your ranking has improved to #${rank ?? '?'} in the Champion Hall.`;
        break;
      case 'level_up':
        pushTitle = '⬆️ Level Up!';
        pushBody  = `You've reached a new level. Keep climbing!`;
        break;
      default: // achievement_unlocked
        pushTitle = '🎖️ Achievement Unlocked!';
        pushBody  = achievementName
          ? `You unlocked "${achievementName}". Well done!`
          : 'You just unlocked a new achievement. Check your profile!';
    }
  }

  const payload: PushPayload = {
    title: pushTitle, body: pushBody, type, priority,
    clickAction: clickActionFor(type),
    data: {
      achievementName: achievementName ?? '',
      total: String(total ?? ''),
      rank:  String(rank  ?? ''),
    },
  };

  console.info(`[NOTIFY] achievement/${type} uid=${uid}`);
  const result = await sendToUser(uid, payload);
  res.json({ success: result.ok, uid, type, reason: result.error });
});

// ─── POST /notify/daily-summary ───────────────────────────────────────────────
// Body: { uid, protein, runs, streak, rank? }

notifyRoutes.post('/daily-summary', async (req: Request, res: Response): Promise<void> => {
  const { uid, protein, runs, streak, rank } = req.body ?? {};
  if (!uid) { res.status(400).json({ error: 'uid is required' }); return; }
  if (!uidGuard(req, res, uid)) return;

  const rankLine = rank ? ` · Rank #${rank}` : '';
  const payload: PushPayload = {
    title:       "📊 Today's Summary",
    body:        `Protein: ${protein ?? 0}g · Runs: ${runs ?? 0} · Streak: ${streak ?? 0} days${rankLine}`,
    type:        'daily_summary',
    priority:    'low',
    clickAction: clickActionFor('daily_summary'),
    data: {
      protein: String(protein ?? 0),
      runs:    String(runs    ?? 0),
      streak:  String(streak  ?? 0),
      rank:    String(rank    ?? 0),
    },
  };

  console.info(`[NOTIFY] daily-summary uid=${uid}`);
  const result = await sendToUser(uid, payload);
  res.json({ success: result.ok, uid, type: 'daily_summary', reason: result.error });
});

// ─── POST /notify/sticker ─────────────────────────────────────────────────────
// Body: { uid, stickerName, rarity, type? }
//   type: 'sticker_unlocked' | 'sticker_collection_progress'

notifyRoutes.post('/sticker', async (req: Request, res: Response): Promise<void> => {
  const { uid, stickerName, rarity, owned, total, type = 'sticker_unlocked', title, body } = req.body ?? {};
  if (!uid) { res.status(400).json({ error: 'uid is required' }); return; }
  if (!uidGuard(req, res, uid)) return;

  let pushTitle: string = title ?? '';
  let pushBody:  string = body  ?? '';
  let priority: NotifPriority = 'normal';

  if (!pushTitle) {
    switch (type) {
      case 'sticker_collection_progress':
        pushTitle = '📖 Sticker Album Updated';
        pushBody  = `You now own ${owned ?? '?'} of ${total ?? '?'} stickers. Collect them all!`;
        priority  = 'low';
        break;
      default: { // sticker_unlocked
        const r = String(rarity ?? '');
        const emoji = r === 'Legendary' ? '👑' : r === 'Epic' ? '🌟' : r === 'Rare' ? '✨' : '🎉';
        pushTitle = r === 'Legendary' ? '👑 Legendary Achievement!'
                  : r === 'Epic'      ? '🌟 Rare Sticker Found!'
                  : r === 'Rare'      ? '✨ Rare Sticker Found!'
                  :                     '🎉 New Sticker Unlocked!';
        pushBody  = `You earned: ${emoji} ${stickerName ?? 'a sticker'}. Tap to view your collection.`;
        priority  = r === 'Legendary' ? 'high' : 'normal';
      }
    }
  }

  const payload: PushPayload = {
    title: pushTitle, body: pushBody, type, priority,
    clickAction: clickActionFor(type),
    data: { stickerName: stickerName ?? '', rarity: rarity ?? '' },
  };

  console.info(`[NOTIFY] sticker/${type} uid=${uid} stickerName=${stickerName}`);
  const result = await sendToUser(uid, payload);
  res.json({ success: result.ok, uid, type, reason: result.error });
});

// ─── POST /notify/weekly ──────────────────────────────────────────────────────
// Body: { uid, type? }
//   type: 'week_complete' | 'new_week_started'

notifyRoutes.post('/weekly', async (req: Request, res: Response): Promise<void> => {
  const { uid, type = 'week_complete', title, body } = req.body ?? {};
  if (!uid) { res.status(400).json({ error: 'uid is required' }); return; }
  if (!uidGuard(req, res, uid)) return;

  let pushTitle: string = title ?? '';
  let pushBody:  string = body  ?? '';
  const priority: NotifPriority = 'high';

  if (!pushTitle) {
    switch (type) {
      case 'new_week_started':
        pushTitle = '📅 New Week Started';
        pushBody  = "A fresh batch begins today. Let's keep growing.";
        break;
      default: // week_complete
        pushTitle = '📦 Week Complete!';
        pushBody  = "Congratulations! You've completed this week's nutrition batch.";
    }
  }

  const payload: PushPayload = {
    title: pushTitle, body: pushBody, type, priority,
    clickAction: clickActionFor(type),
    data: {},
  };

  console.info(`[NOTIFY] weekly/${type} uid=${uid}`);
  const result = await sendToUser(uid, payload);
  res.json({ success: result.ok, uid, type, reason: result.error });
});

// ─── POST /notify/broadcast ───────────────────────────────────────────────────
// Developer only. Body: { uid, title, message, target? }
//   target: 'all' | 'game' | 'protein' | uid:<string>

notifyRoutes.post('/broadcast', async (req: Request, res: Response): Promise<void> => {
  const callerUid = (req as AuthRequest).uid;
  if (!await isDeveloper(callerUid)) {
    res.status(403).json({ error: 'Developer role required for broadcasts.' });
    return;
  }

  const { title, message, target = 'all', type = 'admin_announcement' } = req.body ?? {};
  if (!title || !message) {
    res.status(400).json({ error: 'title and message are required' });
    return;
  }

  const payload: PushPayload = {
    title,
    body:        message,
    type,
    priority:    'high',
    clickAction: clickActionFor(type),
    data:        { adminId: callerUid, target: String(target) },
  };

  console.info(`[NOTIFY] broadcast target=${target} by=${callerUid}`);

  if (typeof target === 'string' && target.startsWith('uid:')) {
    // Single user target
    const targetUid = target.slice(4);
    const result = await sendToUser(targetUid, payload);
    res.json({ success: result.ok, recipientCount: 1, successCount: result.ok ? 1 : 0 });
  } else {
    // All users
    const result = await broadcastToAll(payload);
    res.json({
      success: result.ok,
      recipientCount: result.total,
      successCount:   result.success,
      failureCount:   result.failure,
    });
  }
});

// ─── GET /notify/debug ────────────────────────────────────────────────────────
// Developer only. Returns FCM token stats.

notifyRoutes.get('/debug', async (req: Request, res: Response): Promise<void> => {
  const callerUid = (req as AuthRequest).uid;
  if (!await isDeveloper(callerUid)) {
    res.status(403).json({ error: 'Developer role required.' });
    return;
  }

  const tokens = await getAllTokens();
  res.json({
    tokenCount:  tokens.length,
    sampleToken: tokens[0]?.token.substring(0, 20) ?? null,
  });
});
