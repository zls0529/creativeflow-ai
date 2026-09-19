import {spawn} from 'node:child_process';
// No shell or global service installation. Both processes inherit the same environment.
const children=[spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1'],{stdio:'inherit',windowsHide:true}),spawn(process.execPath,['--env-file=.env','--import','tsx','--conditions=react-server','scripts/worker.ts'],{stdio:'inherit',windowsHide:true})];
let closing=false;
function stop(){if(closing)return;closing=true;for(const child of children)child.kill('SIGTERM');}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
for(const child of children){child.on('error',()=>{process.exitCode=1;stop();});child.on('exit',code=>{if(code)process.exitCode=code;stop();});}
