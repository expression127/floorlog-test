// Floor Log — authorization rules. Byte-identical to backend/src/Authorization.js
// (which mirrors floorlog_schema_reference.sql's RLS policies 1:1). Kept as
// one shared source so ?demo=1's in-browser mock backend enforces the same
// rules as the real Apps Script backend.

function isStaff_(actor) { return actor && actor.kind === 'staff' && actor.active; }
function roleIs_(actor, roles) { return isStaff_(actor) && roles.indexOf(actor.role) >= 0; }

function canSeeMember(actor, member) {
  if (!actor || !member) return false;
  if (roleIs_(actor, ['owner'])) return true;
  if (roleIs_(actor, ['manager'])) return actor.locationIds.indexOf(member.homeLocationId) >= 0;
  if (roleIs_(actor, ['trainer'])) {
    return !!member.__activeAssignmentTrainerIds && member.__activeAssignmentTrainerIds.indexOf(actor.id) >= 0;
  }
  if (actor.kind === 'member') return actor.memberId === member.id;
  return false;
}

function canSeeStaff(actor, targetStaff, sharedLocation) {
  if (!actor) return false;
  if (actor.kind === 'staff' && actor.id === targetStaff.id) return true;
  if (roleIs_(actor, ['owner'])) return true;
  if (roleIs_(actor, ['manager'])) return !!sharedLocation;
  return false;
}

function canSeeStaffLocations(actor, staffId, locationId) {
  if (!actor) return false;
  if (actor.kind === 'staff' && actor.id === staffId) return true;
  if (roleIs_(actor, ['owner'])) return true;
  if (roleIs_(actor, ['manager'])) return actor.locationIds.indexOf(locationId) >= 0;
  return false;
}

function canAddMember(actor, homeLocationId) {
  if (roleIs_(actor, ['owner'])) return true;
  if (roleIs_(actor, ['manager', 'trainer'])) return actor.locationIds.indexOf(homeLocationId) >= 0;
  return false;
}

function canUpdateMember(actor, member) {
  if (roleIs_(actor, ['owner'])) return true;
  if (roleIs_(actor, ['manager'])) return actor.locationIds.indexOf(member.homeLocationId) >= 0;
  return false;
}

function canAssignClient(actor, member) {
  return roleIs_(actor, ['owner', 'manager']) && canSeeMember(actor, member);
}

function canSeeAssignment(actor, assignment, member) {
  if (isStaff_(actor) && actor.id === assignment.trainerId) return true;
  if (roleIs_(actor, ['owner'])) return true;
  return canSeeMember(actor, member);
}

function canSeeExercise(actor, exercise) {
  if (exercise.mergedInto) return false;
  if (exercise.review === 'approved') return true;
  if (isStaff_(actor) && actor.id === exercise.createdBy) return true;
  return roleIs_(actor, ['owner', 'manager']);
}

function canCreateExercise(actor) {
  return isStaff_(actor);
}

function canApproveExercise(actor, exercise) {
  if (roleIs_(actor, ['owner'])) return true;
  return roleIs_(actor, ['manager']) && exercise.createdBy !== actor.id;
}
function canMergeExercise(actor, exercise) {
  if (roleIs_(actor, ['owner'])) return true;
  return roleIs_(actor, ['manager']) && exercise.createdBy !== actor.id;
}

// A member may create a session for themselves, with no trainer attached,
// but only when selfLoggingEnabled (Config.member_self_logging) is on.
function canCreateSession(actor, member, trainerIdOnSession, locationId, selfLoggingEnabled) {
  if (actor && actor.kind === 'member') {
    return !!selfLoggingEnabled && !trainerIdOnSession && canSeeMember(actor, member);
  }
  if (!isStaff_(actor)) return false;
  if (actor.id !== trainerIdOnSession) return false;
  if (!canSeeMember(actor, member)) return false;
  if (actor.role === 'owner') return true;
  return actor.locationIds.indexOf(locationId) >= 0;
}

// A member may update their own self-logged session (trainer_id blank)
// when selfLoggingEnabled is on.
function canUpdateSession(actor, session, member, selfLoggingEnabled) {
  if (!canSeeMember(actor, member)) return false;
  if (actor.kind === 'member') return !!selfLoggingEnabled && !session.trainerId;
  if (isStaff_(actor) && actor.id === session.trainerId) return true;
  return roleIs_(actor, ['owner', 'manager']);
}

function canAddSet(actor, session, member, selfLoggingEnabled) {
  return canUpdateSession(actor, session, member, selfLoggingEnabled);
}

function canEditOrDeleteSet(actor, session, member, selfLoggingEnabled) {
  if (!canSeeMember(actor, member)) return false;
  if (actor.kind === 'member') return !!selfLoggingEnabled && !session.trainerId;
  if (isStaff_(actor) && actor.id === session.trainerId) return true;
  return roleIs_(actor, ['owner', 'manager']);
}

// Any active staff member or any member may create a reusable exercise-list
// template ("programme") — unconditional, not gated by the member
// self-logging toggle, since saving a plan doesn't touch Sessions/Sets.
function canCreateProgramme(actor) {
  return isStaff_(actor) || (actor && actor.kind === 'member');
}

// Staff see the whole shared library. A member sees their own creations,
// plus any programme that's actually been used to start one of their own
// sessions (usedOnOwnSession is computed by the caller from Sessions.programmeId).
function canSeeProgramme(actor, programme, usedOnOwnSession) {
  if (isStaff_(actor)) return true;
  if (actor && actor.kind === 'member') return programme.createdBy === actor.memberId || !!usedOnOwnSession;
  return false;
}

function canSeeAudit(actor, session) {
  if (roleIs_(actor, ['owner', 'manager'])) return true;
  return isStaff_(actor) && actor.role === 'trainer' && actor.id === session.trainerId;
}

function canChangeStaffRoleOrLocations(actor) {
  return roleIs_(actor, ['owner']);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    canSeeMember: canSeeMember,
    canSeeStaff: canSeeStaff,
    canSeeStaffLocations: canSeeStaffLocations,
    canAddMember: canAddMember,
    canUpdateMember: canUpdateMember,
    canAssignClient: canAssignClient,
    canSeeAssignment: canSeeAssignment,
    canSeeExercise: canSeeExercise,
    canCreateExercise: canCreateExercise,
    canApproveExercise: canApproveExercise,
    canMergeExercise: canMergeExercise,
    canCreateProgramme: canCreateProgramme,
    canSeeProgramme: canSeeProgramme,
    canCreateSession: canCreateSession,
    canUpdateSession: canUpdateSession,
    canAddSet: canAddSet,
    canEditOrDeleteSet: canEditOrDeleteSet,
    canSeeAudit: canSeeAudit,
    canChangeStaffRoleOrLocations: canChangeStaffRoleOrLocations
  };
}
