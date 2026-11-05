const runUrl=()=>`https://github.com/${process.env.GITHUB_REPOSITORY||'DaveEliranAssistant/specgate'}/actions/runs/${process.env.GITHUB_RUN_ID||'0'}`;
export function buildResult(r,detailsMarkdown='',code=0){
 const base={schemaVersion:1,product:'SpecGate',version:'specgate-diff/1',verdict:'error',headline:'Product execution failed; inspect native outputs',metrics:[],findings:[],detailsMarkdown:detailsMarkdown.slice(0,100000),runUrl:runUrl()};
 if(!r||code===2)return base;
 base.verdict=r.cli.exitCode===0?'pass':r.cli.exitCode===1?'fail':'error';
 base.headline=`${r.summary.total} removal(s); removal rules only. Manual review required; API compatibility is unassessed.`;
 base.metrics=[{label:'removed paths',value:r.summary.pathRemoved},{label:'removed operations',value:r.summary.operationRemoved},{label:'manual review',value:'required'}];
 base.findings=(r.findings||[]).slice(0,100).map(f=>({change:'new',severity:f.severity||'breaking',title:f.rule,location:f.basePointer}));
 return base;
}
