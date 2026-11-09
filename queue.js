// Floor Log — offline write queue. Extracted into its own file (rather than
// inline in index.html) so it can be unit-tested under Node with injected
// fakes (section 11, suite 5: "persisted queue survives reload, ordered
// flush, permanent-failure handling"). The browser gets the exact same
// code, wired to the real IndexedDB/localStorage/fetch via createDefaultStore
// at the bottom of this file.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.FloorLogQueue = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SYNC_OP_TYPES = { createSession: 1, finishSession: 1, addSet: 1, editSet: 1, deleteSet: 1, addCustomExercise: 1, addProgramme: 1 };
  var MGMT_ACTIONS = { addMember: 1, setMemberStatus: 1, assignClient: 1, approveExercise: 1, mergeExercise: 1 };

  function isPermanent(code) { return code === 400 || code === 403 || code === 404 || code === 409; }

  // Pure helper: given the queued items and the results of the batched
  // `sync` call (keyed by opId) plus per-item results for management
  // actions, decides what to do with each item. Exposed separately from
  // the stateful `createQueue` below so it's trivially unit-testable.
  function classifySyncResults(syncItems, apiResponse) {
    var toRemove = [], toAttention = [], toRetry = [];
    if (!apiResponse || !apiResponse.ok) {
      // Whole-request failure (offline, auth problem, server error): retry everything.
      return { toRemove: toRemove, toAttention: toAttention, toRetry: syncItems.slice() };
    }
    var byOpId = {};
    (apiResponse.data.results || []).forEach(function (r) { byOpId[r.opId] = r; });
    syncItems.forEach(function (item) {
      var r = byOpId[item.opId];
      if (!r) { toRetry.push(item); return; }
      if (r.ok) { toRemove.push(item); return; }
      if (isPermanent(r.code)) {
        toAttention.push({ opId: item.opId, type: item.type, payload: item.payload, error: r.error, at: Date.now() });
        toRemove.push(item);
      } else {
        toRetry.push(item);
      }
    });
    return { toRemove: toRemove, toAttention: toAttention, toRetry: toRetry };
  }

  function classifyMgmtResult(item, res) {
    if (res && res.ok) return { action: 'remove' };
    if (res && isPermanent(res.code)) {
      return { action: 'attention', entry: { opId: item.opId, type: item.type, payload: item.payload, error: res.error, at: Date.now() } };
    }
    return { action: 'retry' };
  }

  // storage: {get(k)->Promise<any>, put(k,v)->Promise, del(k)->Promise, all()->Promise<any[]>} for the queue table
  // needsStore: a tiny synchronous-ish KV for the "needs attention" list: {load()->array, save(array)}
  // api: {sync(ops)->Promise<res>, addMember(payload)->Promise<res>, ... one method per MGMT_ACTIONS key}
  // isOnline: () -> boolean
  function createQueue(deps) {
    var storage = deps.storage, needsStore = deps.needsStore, api = deps.api, isOnline = deps.isOnline || function () { return true; };
    var notify = deps.onChange || function () { };
    var now = deps.now || function () { return Date.now(); };
    var minBackoff = deps.minBackoffMs || 2000, maxBackoff = deps.maxBackoffMs || 60000;
    // Wrapped, not just {setTimeout, clearTimeout}: browsers require the
    // native setTimeout to be invoked with `this` bound to `window`, so
    // detaching it onto a plain object ("Illegal invocation" at call time)
    // breaks the very first scheduled retry. Node's global setTimeout has
    // no such restriction, which is why this only shows up under a real
    // browser, not under the Node test suite.
    var scheduler = deps.scheduler || {
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimeout: function (h) { clearTimeout(h); }
    };

    var backoffMs = minBackoff, flushTimer = null, flushing = false;

    function enqueue(type, payload) {
      var item = { opId: payload.id, type: type, payload: payload, createdAt: now(), attempts: 0 };
      return storage.put(item).then(function () { notify(); scheduleFlush(50); return item; });
    }
    function list() { return storage.all(); }
    function remove(opId) { return storage.del(opId); }

    function needsAttentionList() { return needsStore.load(); }
    function pushNeedsAttention(entry) {
      var l = needsStore.load(); l.unshift(entry); needsStore.save(l.slice(0, 50));
    }
    function clearNeedsAttention(opId) {
      needsStore.save(needsStore.load().filter(function (x) { return x.opId !== opId; }));
    }

    function scheduleFlush(delay) {
      if (flushTimer) scheduler.clearTimeout(flushTimer);
      flushTimer = scheduler.setTimeout(function () { flush(); }, delay == null ? backoffMs : delay);
    }

    function flush() {
      if (flushing) return Promise.resolve();
      if (!isOnline()) { notify(); return Promise.resolve(); }
      flushing = true; notify();
      return list().then(function (items) {
        if (!items.length) { flushing = false; backoffMs = minBackoff; notify(); return; }
        var syncItems = items.filter(function (i) { return SYNC_OP_TYPES[i.type]; });
        var mgmtItems = items.filter(function (i) { return MGMT_ACTIONS[i.type]; });
        var chain = Promise.resolve();
        var anyTransient = false;

        if (syncItems.length) {
          chain = chain.then(function () {
            var ops = syncItems.map(function (i) { return Object.assign({ type: i.type, opId: i.opId }, i.payload); });
            return api.sync(ops).then(function (res) {
              var plan = classifySyncResults(syncItems, res);
              plan.toAttention.forEach(pushNeedsAttention);
              if (plan.toRetry.length) anyTransient = true;
              return Promise.all(plan.toRemove.map(function (i) { return remove(i.opId); }));
            });
          });
        }
        mgmtItems.forEach(function (i) {
          chain = chain.then(function () {
            return api[i.type](i.payload).then(function (res) {
              var plan = classifyMgmtResult(i, res);
              if (plan.action === 'remove') return remove(i.opId);
              if (plan.action === 'attention') { pushNeedsAttention(plan.entry); return remove(i.opId); }
              anyTransient = true;
            });
          });
        });

        return chain.then(function () {
          flushing = false;
          if (anyTransient) { backoffMs = Math.min(backoffMs * 2, maxBackoff); scheduleFlush(backoffMs); }
          else { backoffMs = minBackoff; }
          notify();
        });
      }).catch(function () {
        flushing = false; backoffMs = Math.min(backoffMs * 2, maxBackoff); scheduleFlush(backoffMs); notify();
      });
    }

    function status() {
      return list().then(function (items) {
        if (!items.length) return { state: 'synced', count: 0 };
        if (!isOnline()) return { state: 'offline', count: items.length };
        return { state: 'syncing', count: items.length };
      });
    }

    return {
      enqueue: enqueue, list: list, remove: remove, flush: flush, status: status,
      needsAttentionList: needsAttentionList, clearNeedsAttention: clearNeedsAttention,
      _backoffMs: function () { return backoffMs; }
    };
  }

  return {
    SYNC_OP_TYPES: SYNC_OP_TYPES, MGMT_ACTIONS: MGMT_ACTIONS,
    isPermanent: isPermanent, classifySyncResults: classifySyncResults, classifyMgmtResult: classifyMgmtResult,
    createQueue: createQueue
  };
});
