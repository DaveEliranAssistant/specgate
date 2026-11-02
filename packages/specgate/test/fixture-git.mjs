import {execFileSync} from 'node:child_process';
export function commitFixture(root){
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 git('init','--quiet');git('add','--all');
 try {git('diff','--cached','--quiet');git('rev-parse','--verify','HEAD');return;}catch{/* Changed or initial fixture. */}
 // Test-owned temporary repositories only. Never used by application source.
 git('-c','user.name=SpecGate fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=/dev/null','commit','--quiet','--allow-empty','-m','fixture');
}
