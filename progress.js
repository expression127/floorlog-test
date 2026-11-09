// Floor Log backend — progress logic: scoring, PRs, weekly volume.
// Mirrors the Postgres views set_scores / personal_records / weekly_volume
// in floorlog_schema_reference.sql. Pure functions, no Apps Script services.
//
// This file is byte-identical to backend/src/Progress.js. It is kept as a
// SEPARATE static file here (rather than duplicated inline in index.html)
// so the scoring/PR/week-boundary math has exactly one source of truth
// shared between the Apps Script backend and the browser. If you change
// one copy, change the other the same way.

// A set is scoreable per floorlog_schema_reference.sql's set_scores view:
//  - weight_reps requires reps > 0 and a non-null weight (0 is allowed).
//  - distance requires distance_m > 0 and seconds > 0.
function isScoreable(logType, set) {
  if (logType === 'weight_reps') return set.reps > 0 && set.weightKg != null;
  if (logType === 'distance') return set.distanceM > 0 && set.seconds > 0;
  return true;
}

// Returns a numeric score, or null if the set should be ignored entirely.
function score(logType, set) {
  if (!isScoreable(logType, set)) return null;
  if (logType === 'weight_reps') {
    return set.reps === 1 ? set.weightKg : set.weightKg * (1 + set.reps / 30);
  }
  if (logType === 'bodyweight_reps') return set.reps;
  if (logType === 'time') return set.seconds;
  if (logType === 'distance') return -(set.seconds / set.distanceM * 500);
  return null;
}

// sets: array of { id, exerciseId, logType, sessionStartedAt, position, weightKg, reps, seconds, distanceM, deletedAt }
// Returns a Set-like object (plain object map) of setId -> true for every PR,
// scanning strictly ordered by (sessionStartedAt, position) per exercise, and
// ignoring soft-deleted sets. The first scoreable set for an exercise is a
// baseline (never a PR); a set only becomes a PR if it strictly beats every
// earlier score for that member+exercise. Ties never count.
function computePRs(sets) {
  var byExercise = {};
  sets.forEach(function (s) {
    if (s.deletedAt) return;
    var sc = score(s.logType, s);
    if (sc == null) return;
    (byExercise[s.exerciseId] = byExercise[s.exerciseId] || []).push({ set: s, score: sc });
  });
  var prIds = {};
  Object.keys(byExercise).forEach(function (exId) {
    var list = byExercise[exId].slice().sort(function (a, b) {
      if (a.set.sessionStartedAt !== b.set.sessionStartedAt) return a.set.sessionStartedAt - b.set.sessionStartedAt;
      return (a.set.position || 0) - (b.set.position || 0);
    });
    var best = null;
    list.forEach(function (entry, i) {
      if (i > 0 && best !== null && entry.score > best) prIds[entry.set.id] = true;
      if (best === null || entry.score > best) best = entry.score;
    });
  });
  return prIds;
}

// --- timezone helpers -------------------------------------------------
// Resolve the UTC offset (ms) in effect at `ms` for IANA zone `timeZone`.
function offsetMsAt_(ms, timeZone) {
  var dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  var parts = {};
  dtf.formatToParts(new Date(ms)).forEach(function (p) { parts[p.type] = p.value; });
  var hour = parts.hour === '24' ? 0 : Number(parts.hour);
  var asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  return asUtc - ms;
}

// Monday 00:00 *local time* for the week containing `ms`, in `timeZone`,
// returned as a real UTC epoch ms.
function weekStartMs(ms, timeZone) {
  var offset = offsetMsAt_(ms, timeZone);
  var localAsUtc = ms + offset;
  var d = new Date(localAsUtc);
  var utcDay = d.getUTCDay(); // Sun=0..Sat=6
  var daysSinceMonday = (utcDay + 6) % 7;
  var localMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0);
  var localMondayMidnight = localMidnight - daysSinceMonday * 86400000;
  return localMondayMidnight - offset;
}

// sets: array of { exerciseId, logType, weightKg, reps, sessionStartedAt, deletedAt }
// Returns a map weekStartMs -> volumeKg, counting only weight_reps sets.
function weeklyVolume(sets, timeZone) {
  var out = {};
  sets.forEach(function (s) {
    if (s.deletedAt) return;
    if (s.logType !== 'weight_reps') return;
    if (!(s.reps > 0) || s.weightKg == null) return;
    var wk = weekStartMs(s.sessionStartedAt, timeZone);
    out[wk] = (out[wk] || 0) + s.weightKg * s.reps;
  });
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isScoreable: isScoreable,
    score: score,
    computePRs: computePRs,
    weekStartMs: weekStartMs,
    weeklyVolume: weeklyVolume
  };
}
