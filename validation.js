// Floor Log — input validation and spreadsheet-formula-injection guard.
// Byte-identical to backend/src/Validation.js, kept as one shared source
// of truth: the Apps Script backend uses it for real, and ?demo=1 uses it
// so the in-browser mock backend validates the same way the real one does.
var LOG_TYPES = ['weight_reps', 'bodyweight_reps', 'time', 'distance'];

function sanitizeText(value, maxLen) {
  var s = value == null ? '' : String(value);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function isInRange(n, min, max) {
  return typeof n === 'number' && isFinite(n) && n >= min && n <= max;
}

function validateSetFields(logType, fields) {
  fields = fields || {};
  if (LOG_TYPES.indexOf(logType) < 0) return { ok: false, error: 'bad_log_type' };

  var weight = fields.weightKg, reps = fields.reps, seconds = fields.seconds,
    distance = fields.distanceM, rpe = fields.rpe;

  if (rpe != null && !isInRange(rpe, 1, 10)) return { ok: false, error: 'rpe_out_of_range' };

  if (logType === 'weight_reps') {
    if (weight == null || reps == null) return { ok: false, error: 'missing_required_fields' };
    if (!isInRange(weight, 0, 1000)) return { ok: false, error: 'weight_out_of_range' };
    if (!isInRange(reps, 0, 1000)) return { ok: false, error: 'reps_out_of_range' };
    return { ok: true };
  }
  if (logType === 'bodyweight_reps') {
    if (reps == null) return { ok: false, error: 'missing_required_fields' };
    if (!isInRange(reps, 0, 1000)) return { ok: false, error: 'reps_out_of_range' };
    return { ok: true };
  }
  if (logType === 'time') {
    if (seconds == null) return { ok: false, error: 'missing_required_fields' };
    if (!isInRange(seconds, 0, 86400)) return { ok: false, error: 'seconds_out_of_range' };
    return { ok: true };
  }
  if (logType === 'distance') {
    if (distance == null || seconds == null) return { ok: false, error: 'missing_required_fields' };
    if (!isInRange(distance, 0, 1000000)) return { ok: false, error: 'distance_out_of_range' };
    if (!isInRange(seconds, 0, 86400)) return { ok: false, error: 'seconds_out_of_range' };
    return { ok: true };
  }
  return { ok: false, error: 'bad_log_type' };
}

function isDuplicateExerciseName(name, existingNames) {
  var norm = String(name || '').trim().toLowerCase();
  if (!norm) return false;
  for (var i = 0; i < existingNames.length; i++) {
    if (String(existingNames[i] || '').trim().toLowerCase() === norm) return true;
  }
  return false;
}

function canMergeExercises(dupLogType, keepLogType) {
  return dupLogType === keepLogType;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LOG_TYPES: LOG_TYPES,
    sanitizeText: sanitizeText,
    isInRange: isInRange,
    validateSetFields: validateSetFields,
    isDuplicateExerciseName: isDuplicateExerciseName,
    canMergeExercises: canMergeExercises
  };
}
