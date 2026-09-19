import {readdir,readFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
const roots=['app','components','lib','types','tests','scripts','prisma','comfyui','benchmarks','docs','.github'];
const rootFiles=['README.md','LICENSE','.gitignore','.env.example','package.json','package-lock.json','next.config.ts','next-env.d.ts','tsconfig.json','eslint.config.mjs','postcss.config.mjs','tailwind.config.ts'];
const ignored=p=>/\.(db.*|log|tsbuildinfo|safetensors|ckpt|pth|pt|bin|gguf|onnx|zip|7z|pem|key)$/.test(p)||/^docs\/.*-(verification|snapshot)\.json$/.test(p)||['docs/repair-proposal.json','docs/usage-history-integrity.json'].includes(p)||p.split('/').includes('models');
async function walk(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+entry.name;if(ignored(p))continue;if(entry.isSymbolicLink())throw new Error('Unexpected symlink in publication source: '+p);out.push(...(entry.isDirectory()?await walk(p):[p]));}return out;}
export async function publicationFiles(){return [...rootFiles,...(await Promise.all(roots.map(walk))).flat()].sort();}
const files=await publicationFiles(),findings=[];
const localEnv=existsSync('.env')?parseEnv(await readFile('.env','utf8')):{};
const secrets=Object.entries(localEnv).filter(([key,value])=>/KEY|TOKEN|SECRET|PASSWORD/.test(key)&&value.length>=12).map(([,v])=>v);
let texts=0;
for(const file of files){const size=(await stat(file)).size;if(size>8*1024*1024)findings.push({file,kind:'large-public-file'});
 if(!/\.(md|json|ts|tsx|mjs|prisma|css|yml|yaml)$/.test(file)&&!['LICENSE','.gitignore','.env.example'].includes(file))continue;
 const text=await readFile(file,'utf8');texts++;
 for(const [i,line] of text.split(/\r?\n/).entries()){
  if(secrets.some(s=>line.includes(s))||/\b(?:sk-[A-Za-z0-9_-]{20,}|hf_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,})/.test(line))findings.push({file,line:i+1,kind:'possible-secret'});
  if(!file.startsWith('tests/')&&/(?:[A-Z]:[\\/](?:Users|AI creative director|ComfyUI)|\/Users\/|\/home\/[a-z])/.test(line))findings.push({file,line:i+1,kind:'personal-absolute-path'});
 }
}
console.log(JSON.stringify({scope:'Publication source allowlist; not Git history',gitRepository:existsSync('.git'),files:files.length,textFiles:texts,localCredentialValuesChecked:secrets.length,findings,note:'Local .env, databases, storage, model binaries, external installs, logs and raw reference photos are excluded. Header construction and fake-secret tests are expected; never prints secret values.'},null,2));
if(findings.length)process.exitCode=1;
