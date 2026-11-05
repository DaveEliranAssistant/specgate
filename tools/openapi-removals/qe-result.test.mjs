import test from 'node:test';import assert from 'node:assert/strict';
const m=await import('./qe-result.mjs').catch(()=>({}));
const sample={version:'0.1.0',verdict:'FAIL',threshold:'minor',counts:{new:1,fixed:0,stillOpen:3},findings:{new:[{impact:'critical',help:'label missing',selector:'#new',path:'/accessibility'}],fixed:[],stillOpen:[]},summary:{runs:5,tests:5,flaky:1,regressions:0,stable:4},tests:[{name:'intentional race',verdict:'flaky',flakinessScore:0.6}],cli:{exitCode:1}};
sample.findings=[{rule:'PATH_REMOVED',severity:'breaking',basePointer:'/paths/~1health'}];sample.summary={pathRemoved:1,operationRemoved:0,total:1};
test('shared result preserves SpecGate verdict and native details',()=>{assert.equal(typeof m.buildResult,'function');const r=m.buildResult(sample,'native details',1);assert.equal(r.schemaVersion,1);assert.equal(r.product,'SpecGate');assert.equal(r.verdict,'fail');assert.equal(r.detailsMarkdown,'native details');assert.ok(r.metrics.length);assert.ok(r.findings.length);assert.match(r.runUrl,/^https:\/\//);});
test('tool error emits error, not pass',()=>{assert.equal(typeof m.buildResult,'function');assert.equal(m.buildResult(null,'',2).verdict,'error');});
