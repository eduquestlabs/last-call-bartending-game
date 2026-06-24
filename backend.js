// ============================================================================
// Backend client (Supabase). Powers the online features: Community sharing,
// likes, and global leaderboards. Uses anonymous auth so there's no login
// friction — each device gets a real, secure account.
//
// Everything here degrades gracefully: if config.js still has the placeholder
// values, isConfigured() returns false and the rest of the game keeps working
// offline. The Supabase library is only fetched (from a CDN) once configured.
// ============================================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

let sb = null; // Supabase client
let myId = null; // current (anonymous) auth user id
let ready = false; // true once signed in + player row ensured

export function isConfigured() {
  return (
    typeof SUPABASE_URL === "string" &&
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_URL.startsWith("http") &&
    !SUPABASE_URL.includes("YOUR_") &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes("YOUR_")
  );
}

export function isReady() { return ready; }
export function currentUserId() { return myId; }

// Sign in anonymously (or reuse the existing session) and make sure this
// player's row exists. Returns true on success.
export async function initBackend(profile) {
  if (!isConfigured()) return false;
  try {
    if (!sb) {
      const mod = await import("https://esm.sh/@supabase/supabase-js@2");
      sb = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    let { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }
    myId = session.user.id;
    await sb.from("players").upsert(
      { id: myId, name: (profile && profile.name) || "Anonymous", location: (profile && profile.location) || null },
      { onConflict: "id" }
    );
    ready = true;
    return true;
  } catch (e) {
    console.warn("[backend] init failed:", e && e.message ? e.message : e);
    ready = false;
    return false;
  }
}

// Push the player's latest stats so the streak leaderboard stays current.
export async function syncStats(stats) {
  if (!ready || !sb || !myId) return;
  try {
    await sb.from("players").update({
      best_streak: stats.bestStreak || 0,
      level: stats.level || 1,
      xp: stats.xp || 0,
      name: stats.name || undefined,
      location: stats.location || undefined,
      updated_at: new Date().toISOString(),
    }).eq("id", myId);
  } catch (e) { /* non-fatal */ }
}

// Share an invention to the community. `c` = { name, recipe, score, verdict, family }.
export async function shareCreation(c) {
  if (!ready || !sb || !myId) throw new Error("not connected");
  const { data, error } = await sb.from("creations").insert({
    player_id: myId,
    name: c.name || "Untitled",
    recipe: c.recipe || {},
    score: c.score || 0,
    verdict: c.verdict || null,
    family: c.family || null,
  }).select("id").single();
  if (error) throw error;
  return data;
}

// List community creations. sort = "top" (most likes) | "new" (newest).
export async function listCommunity(sort = "top") {
  if (!ready || !sb) return [];
  // Disambiguate the embed via the FK name (views also relate creations<->players).
  let q = sb.from("creations").select("id,name,score,verdict,family,recipe,like_count,created_at,players!creations_player_id_fkey(name,location)");
  q = sort === "new" ? q.order("created_at", { ascending: false }) : q.order("like_count", { ascending: false }).order("created_at", { ascending: false });
  const { data, error } = await q.limit(60);
  if (error) throw error;
  return data || [];
}

// The set of creation ids the current player has liked (to render filled hearts).
export async function myLikedIds() {
  if (!ready || !sb || !myId) return new Set();
  const { data, error } = await sb.from("likes").select("creation_id").eq("player_id", myId);
  if (error) return new Set();
  return new Set((data || []).map((r) => r.creation_id));
}

// Toggle a like on a creation. Returns the new liked state (true/false).
export async function toggleLike(creationId, currentlyLiked) {
  if (!ready || !sb || !myId) throw new Error("not connected");
  if (currentlyLiked) {
    const { error } = await sb.from("likes").delete().eq("creation_id", creationId).eq("player_id", myId);
    if (error) throw error;
    return false;
  }
  const { error } = await sb.from("likes").insert({ creation_id: creationId, player_id: myId });
  if (error) throw error;
  return true;
}

export async function leaderboardLikes() {
  if (!ready || !sb) return [];
  const { data, error } = await sb.from("leaderboard_likes").select("*").limit(50);
  if (error) throw error;
  return data || [];
}

export async function leaderboardStreak() {
  if (!ready || !sb) return [];
  const { data, error } = await sb.from("leaderboard_streak").select("*").limit(50);
  if (error) throw error;
  return data || [];
}
