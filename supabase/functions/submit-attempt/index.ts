import { createClient } from 'npm:@supabase/supabase-js@2';
import { evaluate } from 'npm:mathjs@14.2.1';

const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type' };
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

function normalizeLatex(src:string){
  let s=String(src??'').trim().replace(/\$/g,'').replace(/,/g,'.').replace(/−/g,'-').replace(/×/g,'*').replace(/÷/g,'/');
  // SQL seedda ikki marta escape bo'lgan LaTeX buyruqlarini normallashtirish.
  while (s.includes('\\\\')) s = s.replaceAll('\\\\', '\\');
  s=s.replace(/\\left|\\right/g,'').replace(/\\cdot|\\times/g,'*').replace(/\\pi/g,'pi').replace(/°/g,'deg');
  let prev='';
  const frac=/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;
  const sqrt=/\\sqrt\s*\{([^{}]*)\}/g;
  while(prev!==s){prev=s;s=s.replace(frac,'(($1)/($2))').replace(sqrt,'sqrt($1)');}
  s=s.replace(/\^\{([^{}]+)\}/g,'^($1)').replace(/\\sqrt\s*([A-Za-z0-9.]+)/g,'sqrt($1)');
  s=s.replace(/\\[a-zA-Z]+/g,'').replace(/[{}]/g,'').replace(/\s+/g,'');
  s=s.replace(/(\d|\)|pi|deg)(?=(pi|sqrt|[A-Za-z(]))/g,'$1*');
  s=s.replace(/(pi|deg|\)|[A-Za-z])(?=\d)/g,'$1*');
  return s;
}
function safeEval(expr:string,scope:Record<string,number>={}){
  if(!expr || !/^[0-9A-Za-z_+\-*/^().]*$/.test(expr)) throw new Error('unsupported');
  return Number(evaluate(expr,scope));
}
function mathEquivalent(user:string, key:string){
  const u=normalizeLatex(user), k=normalizeLatex(key);
  if(u===k) return true;
  const variables=[...new Set((u+k).match(/[A-Za-z]+/g)||[])].filter(x=>!['sqrt','pi','deg'].includes(x));
  const samples=variables.length ? [-2.3,-0.7,0.8,2.1] : [0];
  try{
    for(const t of samples){
      const scope:Object={}; variables.forEach((v,i)=>(scope as any)[v]=t+i*.37);
      const a=safeEval(u,scope as any), b=safeEval(k,scope as any);
      if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>1e-8*Math.max(1,Math.abs(a),Math.abs(b))) return false;
    }
    return true;
  }catch{return false;}
}
function levelFor(ms:number|null){if(ms==null)return null;if(ms>=70)return'A+';if(ms>=65)return'A';if(ms>=60)return'B+';if(ms>=55)return'B';if(ms>=50)return'C+';if(ms>=46)return'C';return null;}
function logistic(x:number){return 1/(1+Math.exp(-x));}
function estimateTheta(raw:number,diffs:number[]){
  const n=diffs.length;if(!n)return null;
  const target=Math.min(n-.5,Math.max(.5,raw)); let th=Math.log(target/(n-target));
  for(let j=0;j<30;j++){let e=0,v=0;for(const b of diffs){const p=logistic(th-b);e+=p;v+=p*(1-p);}const step=(target-e)/Math.max(v,1e-6);th=Math.max(-6,Math.min(6,th+step));if(Math.abs(step)<1e-6)break;}
  return th;
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth=req.headers.get('Authorization')||'';
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:uerr}=await userClient.auth.getUser(); if(uerr||!user)return json({error:'Avtorizatsiya talab qilinadi.'},401);
    const admin=createClient(url,service);
    const body=await req.json(); const variant=Number(body.variant);
    if(!Number.isInteger(variant)||variant<1||variant>20)return json({error:'Variant noto‘g‘ri.'},400);
    const surname=String(body.student?.surname||'').trim(), firstName=String(body.student?.firstName||'').trim(), phone=String(body.student?.phone||'').trim();
    if(surname.length<2||firstName.length<2||!/^\+?\d{9,15}$/.test(phone))return json({error:'Shaxsiy ma’lumotlar noto‘g‘ri.'},400);
    const {data:keys,error:kerr}=await admin.from('answer_keys').select('*').eq('variant',variant).order('question_num'); if(kerr)throw kerr;
    if(!keys||keys.length!==55)return json({error:'Variant javob kaliti to‘liq sozlanmagan.'},500);
    const responses:any[]=[]; let itemCorrect=0,parentCorrect=0;
    for(const row of keys){
      const q=Number(row.question_num); const supplied=q<=35?String(body.answers?.[q]||''):String(body.answers?.[q]?.[row.subpart]||'');
      const ok=row.answer_type==='choice' ? supplied.trim().toUpperCase()===String(row.answer_raw).trim().toUpperCase() : (row.check_mode==='exact' ? normalizeLatex(supplied)===normalizeLatex(row.answer_raw) : mathEquivalent(supplied,row.answer_raw));
      if(ok)itemCorrect++;
      responses.push({variant,item_code:row.subpart?`${q}${row.subpart}`:`${q}`,question_num:q,subpart:row.subpart,response:supplied||null,is_correct:ok});
    }
    for(let q=1;q<=45;q++){const items=responses.filter(x=>x.question_num===q);if(items.length&&items.every(x=>x.is_correct))parentCorrect++;}

    // Variant-isolated Rasch calibration from completed historical responses.
    const {data:hist}=await admin.from('attempt_items').select('item_code,is_correct').eq('variant',variant);
    const byItem=new Map<string,{c:number,n:number}>();
    for(const x of hist||[]){const z=byItem.get(x.item_code)||{c:0,n:0};z.n++;if(x.is_correct)z.c++;byItem.set(x.item_code,z);}
    const itemCodes=responses.map(x=>x.item_code); let diffs=itemCodes.map(code=>{const z=byItem.get(code)||{c:0,n:0};const p=(z.c+1)/(z.n+2);return Math.log((1-p)/p);});
    const meanB=diffs.reduce((a,b)=>a+b,0)/diffs.length; diffs=diffs.map(b=>b-meanB);
    const theta=estimateTheta(itemCorrect,diffs);
    const previousAttempts=Math.floor((hist||[]).length/55);
    let msScore:number|null=null, raschStatus='collecting';
    if(theta!=null && previousAttempts>=10){
      // Diagnostic transformation, intentionally not claimed as the official BMBA conversion.
      msScore=Math.max(0,Math.min(75,50+10*theta));
      raschStatus=previousAttempts>=50?'stable':'provisional';
    }
    const level=levelFor(msScore);
    const duration=Math.max(0,Math.min(9000,Number(body.durationSeconds)||0));
    const {data:attempt,error:aerr}=await admin.from('attempts').insert({owner_id:user.id,variant,surname,first_name:firstName,phone,started_at:body.startedAt,submitted_at:body.submittedAt||new Date().toISOString(),duration_seconds:duration,parent_correct:parentCorrect,item_correct:itemCorrect,item_total:55,rasch_theta:theta,ms_score:msScore,level,rasch_status:raschStatus,status:'completed'}).select('id').single();
    if(aerr)throw aerr;
    const rows=responses.map(x=>({...x,attempt_id:attempt.id,owner_id:user.id})); const {error:ierr}=await admin.from('attempt_items').insert(rows); if(ierr)throw ierr;
    return json({attemptId:attempt.id,variant,parentCorrect,itemCorrect,itemTotal:55,raschTheta:theta,msScore,level,raschStatus,durationSeconds:duration});
  }catch(e){return json({error:e?.message||'Server xatosi.'},500);}
});
