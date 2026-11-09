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

function canCreateSession(actor, member, trainerIdOnSession, locationId) {
  if (!isStaff_(actor)) return false;
  if (actor.id !== trainerIdOnSession) return false;
  if (!canSeeMember(actor, member)) return false;
  if (actor.role === 'owner') return true;
  return actor.locationIds.indexOf(locationId) >= 0;
}

function canUpdateSession(actor, session, member) {
  if (!canSeeMember(actor, member)) return false;
  if (isStaff_(actor) && actor.id === session.trainerId) return true;
  return roleIs_(actor, ['owner', 'manager']);
}

function canAddSet(actor, session, member) {
  return canUpdateSession(actor, session, member);
}

function canEditOrDeleteSet(actor, session, member) {
  if (!canSeeMember(actor, member)) return false;
  if (isStaff_(actor) && actor.id === session.trainerId) return true;
  return roleIs_(actor, ['owner', 'manager']);
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
    canCreateSession: canCreateSession,
    canUpdateSession: canUpdateSession,
    canAddSet: canAddSet,
    canEditOrDeleteSet: canEditOrDeleteSet,
    canSeeAudit: canSeeAudit,
    canChangeStaffRoleOrLocations: canChangeStaffRoleOrLocations
  };
}
