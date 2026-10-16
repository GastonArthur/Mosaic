import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createScheduler} from '../src/scheduler.js';
function fixture(send){
 const tasks=new Map(),states=[];let id=0;
 const scheduler=createScheduler({send,changed:(...state)=>states.push(state),setTimer:(fn,ms)=>{tasks.set(++id,{fn,ms});return id;},clearTimer:key=>tasks.delete(key)});
 const tick=async()=>{const [key,task]=tasks.entries().next().value;tasks.delete(key);await task.fn();};
 return {scheduler,tasks,states,tick};
}
test('waits the interval, schedules only after completion, and pause cancels',async()=>{
 let sends=0,finish;const f=fixture(()=>{sends++;return new Promise(resolve=>finish=resolve);});
 f.scheduler.start(10);assert.equal(sends,0);assert.equal([...f.tasks.values()][0].ms,10000);
 const pending=f.tick();assert.equal(sends,1);assert.equal(f.tasks.size,0);
 f.scheduler.stop();finish();await pending;assert.equal(f.tasks.size,0);
});
test('uncertain failures stop without automatic retry',async()=>{
 const f=fixture(async()=>{throw Error('Unconfirmed');});f.scheduler.start(5);await f.tick();
 assert.equal(f.scheduler.active,false);assert.equal(f.tasks.size,0);assert.equal(f.states.at(-1)[1].message,'Unconfirmed');
});
test('does not catch up missed intervals and validates bounds',async()=>{
 const f=fixture(async()=>{});assert.throws(()=>f.scheduler.start(0));assert.throws(()=>f.scheduler.start(Infinity));
 f.scheduler.start(5);await f.tick();assert.equal(f.tasks.size,1);assert.equal([...f.tasks.values()][0].ms,5000);f.scheduler.stop();
});

test('remaining time follows the deadline and resets after each send',async()=>{
 let time=1000,tick,finish;
 const scheduler=createScheduler({now:()=>time,send:()=>new Promise(resolve=>finish=resolve),changed:()=>{},setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>{}});
 scheduler.start(10);assert.equal(scheduler.remaining,10);
 time+=3400;assert.equal(scheduler.remaining,7);
 time+=10000;assert.equal(scheduler.remaining,0);
 const pending=tick();assert.equal(scheduler.remaining,null);
 finish();await pending;assert.equal(scheduler.remaining,10);
 scheduler.stop();assert.equal(scheduler.remaining,null);
});
