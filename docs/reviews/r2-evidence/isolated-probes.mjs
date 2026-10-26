/**
 * Isolated probes for source expressions read at commit
 * 2e03f8aee8bb44623b647037c58afeeebdc41c05.
 * This is NOT the project's test suite or a browser test.
 * Type annotations are omitted. Dependencies and surrounding state are fixtures.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const outputs = [];

// agent/index.ts: observe wrapper. Successful observation changes data, not status.
{
  let callbacks = 0;
  const session = {
    status: 'running', lastDelivered: null,
    observe() { this.lastDelivered = { observation_id: 'run:o1' }; return this.lastDelivered; },
  };
  const after = () => { callbacks++; };
  function observe() {
    const before = session.status;
    try { return session.observe(); }
    finally { if (session.status !== before) after(); }
  }
  const observation = observe();
  assert.equal(observation.observation_id, 'run:o1');
  assert.equal(callbacks, 0);
  outputs.push({probe:'P01', finding:'Successful observe does not notify the UI', callbacks, observation});
}

// challenge/session.ts: peekObservation branch.
{
  function peekObservation() {
    if (this.observationMode === 'restricted') {
      return this.lastDelivered ?? this.buildLockedObservation();
    }
    return this.buildObservation(this.observationIdOf(this.obsSeq));
  }
  const session = {
    observationMode:'after_move', obsSeq:1,
    lastDelivered: {observation_id:'run:o1', state:'before'},
    observationIdOf: n => `run:o${n}`,
    buildObservation: id => ({observation_id:id, state:'after'}),
  };
  const actual = peekObservation.call(session);
  assert.equal(actual.state,'after');
  assert.equal(actual.observation_id,session.lastDelivered.observation_id);
  outputs.push({probe:'P02', finding:'after_move peek returns current data under an existing id', previous:session.lastDelivered, actual});
}

// session.ts: commitMerged removes turn.event; pushEvent assigns length+1;
// then commit overrides at_ms with the original turn time.
{
  const turn = {event:{seq:2,type:'move',at_ms:10,move:'R'}};
  const events = [{seq:1,type:'start',at_ms:0}, turn.event, {seq:3,type:'view',at_ms:80}];
  const index = events.lastIndexOf(turn.event);
  if (index >= 0) events.splice(index, 1);
  const event = {seq:events.length + 1, type:'move',at_ms:100,move:'R2'};
  events.push(event);
  event.at_ms = turn.event.at_ms;
  assert.deepEqual(events.map(e=>e.seq),[1,3,3]);
  assert.ok(events[2].at_ms < events[1].at_ms);
  outputs.push({probe:'P03', finding:'Merge across a view event duplicates sequence numbers and reverses timestamps', events});
}

// session.ts: op_id cache hit compares cached normalized move with raw input.
// notation.ts explicitly canonicalizes a two-layer wide turn to Rw.
{
  const raw = '2Rw';
  const cached = {move:'Rw'};
  let outcome='deduplicated';
  if (cached.move !== raw) outcome='E_OP_ID_CONFLICT';
  assert.equal(outcome,'E_OP_ID_CONFLICT');
  outputs.push({probe:'P04', finding:'An identical alias retry conflicts with its normalized cached result',raw,cached,outcome});
}

// services/history.ts: complete executable body of medianSolvedElapsed.
function medianSolvedElapsed(records, rules, excludeRunId) {
  const values = records
    .filter((record) => record.id !== excludeRunId)
    .filter((record) => record.result.solved && record.result.status === 'ended_solved')
    .filter((record) => {
      const other = record.result.rules;
      return (
        other.challenge_id === rules.challenge_id &&
        other.cube_size === rules.cube_size &&
        other.observation_mode === rules.observation_mode &&
        other.dust_mode === rules.dust_mode &&
        other.time_limit_ms === rules.time_limit_ms &&
        other.move_limit === rules.move_limit
      );
    })
    .map((record) => record.result.solved_at_ms ?? record.result.elapsed_ms)
    .filter((ms) => Number.isFinite(ms) && ms > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
}
{
  const rules={challenge_id:'same-puzzle',cube_size:3,observation_mode:'full',dust_mode:true,time_limit_ms:null,move_limit:null};
  const result={rules,solved:true,status:'ended_solved',solved_at_ms:10000,elapsed_ms:30000};
  const median=medianSolvedElapsed([{id:'prior',result}],rules);
  assert.equal(median,10000);
  outputs.push({probe:'P05',finding:'Current total elapsed and historical median use different endpoints',current_total_elapsed_ms:result.elapsed_ms,historical_median_ms:median});
}

// challenge/session.ts: getProgress observation_allowed expression.
{
  const session={statusValue:'running', observationUnlocked:()=>true, deliveryCount:24};
  const observation_allowed =
    (session.statusValue === 'running' || session.statusValue === 'solved_pending') &&
    session.observationUnlocked();
  const canDeliverObservation = !(session.deliveryCount >= 24);
  assert.equal(observation_allowed,true);
  assert.equal(canDeliverObservation,false);
  outputs.push({probe:'P06',finding:'Progress advertises observation after the restricted budget is exhausted',observation_allowed,canDeliverObservation});
}

// challenge/session.ts: complete executable body of viewAtStep.
function viewAtStep(events, step, initial = {up:'U',front:'F'}) {
  let view = { ...initial };
  let moves = 0;
  for (const event of events) {
    if (moves >= step) break;
    if (event.type === 'move' && event.ok) {
      moves += 1;
      continue;
    }
    if (event.type === 'view' && event.view_after) view = event.view_after;
  }
  return view;
}
{
  const selectedBeforeStart={up:'U',front:'R'};
  const events=[
    {type:'view',ok:true,view_after:selectedBeforeStart},
    {type:'start',ok:true},
    {type:'move',ok:true,move:'R'},
  ];
  const actual=viewAtStep(events,0);
  assert.deepEqual(actual,{up:'U',front:'F'});
  assert.notDeepEqual(actual,selectedBeforeStart);
  outputs.push({probe:'P07',finding:'Step-zero replay loses the pre-start orientation',selectedBeforeStart,actual});
}

// agent/index.ts freezes the methods container but returns cached result by reference.
{
  const cached={move:'R',move_count:1,next_observation:{observation_id:'run:o1'}};
  const session={getActionResult:()=>cached};
  const api=Object.freeze({getLastActionResult:(opId)=>session.getActionResult(opId)});
  const returned=api.getLastActionResult('a');
  returned.move='U';
  assert.equal(cached.move,'U');
  outputs.push({probe:'P08',finding:'API object freezing does not isolate a returned cached result',api_frozen:Object.isFrozen(api),result_frozen:Object.isFrozen(returned),cached_move:cached.move});
}

const report={
  commit:'2e03f8aee8bb44623b647037c58afeeebdc41c05',
  method:'source-fragment isolated probes with fixture dependencies; not repository tests',
  runtime:process.version,
  observed_cases:outputs.length,
  all_expected_counterexamples_observed:true,
  outputs,
};
fs.writeFileSync('/mnt/data/ob-cube-review-r2/isolated-probes-results.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
