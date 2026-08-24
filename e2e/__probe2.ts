import { readFileSync } from "fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, query, where, setDoc } from "firebase/firestore";

const ROOT="uid_root", ASHA="uid_asha", BHAV="uid_bhav", CHAN="uid_chan", OUT="uid_out";
let env: RulesTestEnvironment; let fails=0;
async function check(name: string, fn: () => Promise<unknown>) {
  try { await fn(); console.log(`  PASS  ${name}`); }
  catch (e) { fails++; console.log(`  FAIL  ${name} :: ${(e as Error).message.split("\n")[0]}`); }
}
const as=(u:string)=>env.authenticatedContext(u).firestore();

async function main(){
  env = await initializeTestEnvironment({ projectId:"growline-probe2",
    firestore:{ rules: readFileSync("/home/user/GrowLine/firestore.rules","utf8"), host:"127.0.0.1", port:8080 }});

  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    const base=(e:Record<string,unknown>)=>({name:"n",city:"Bengaluru",levelName:null,workspaceId:"ws_1",...e});
    await setDoc(doc(db,"users",ROOT), base({uplineId:null,uplinePath:[],shareProspects:false}));
    await setDoc(doc(db,"users",ASHA), base({uplineId:ROOT,uplinePath:[ROOT],shareProspects:true}));
    await setDoc(doc(db,"users",BHAV), base({uplineId:ROOT,uplinePath:[ROOT],shareProspects:false}));
    await setDoc(doc(db,"users",CHAN), base({uplineId:ASHA,uplinePath:[ASHA,ROOT],shareProspects:false}));
    await setDoc(doc(db,"users",OUT),  base({uplineId:null,uplinePath:[],shareProspects:false,workspaceId:"ws_2",city:"Bengaluru"}));

    // goal sheets
    await setDoc(doc(db,"goalSheets",CHAN), {why:"w",shortTermGoal:"g",blockers:[],shareNeeds:false});
    await setDoc(doc(db,"goalSheets",CHAN,"private","needs"), {needs:"school fees",needsAmount:5000});
    await setDoc(doc(db,"goalSheets",BHAV), {why:"w2"});   // no shareNeeds field at all
    await setDoc(doc(db,"goalSheets",BHAV,"private","needs"), {needs:"loan"});
    // goal conversations
    await setDoc(doc(db,"goalConversations","t1"), {coachId:CHAN,uplineId:ASHA,status:"proposed"});
    // qualifications
    await setDoc(doc(db,"qualifications","q1"), {creatorId:ROOT,audience:"all",title:"t"});
    await setDoc(doc(db,"qualifications","q2"), {creatorId:ROOT,audience:"direct",title:"t"});
    // duplication + voice
    await setDoc(doc(db,"duplicationScores",`${CHAN}__2026-08`), {userId:CHAN,score:40});
    await setDoc(doc(db,"voiceLogs",`${CHAN}__2026-08-24`), {userId:CHAN,transcript:"met Ramesh 98765"});
    // boards
    await setDoc(doc(db,"leaderboardSnapshots","p_club_bengaluru"), {kind:"podium",scopeType:"club",scopeKey:"bengaluru",entries:[{userId:OUT,name:"Other org coach",value:9}]});
    await setDoc(doc(db,"leaderboardSnapshots","r_club_bengaluru"), {kind:"roster",scopeType:"club",scopeKey:"bengaluru",entries:[],participantCount:9});
    await setDoc(doc(db,"leaderboardSnapshots","p_org_root"), {kind:"podium",scopeType:"org",scopeKey:ROOT,entries:[]});
    await setDoc(doc(db,"leaderboardSnapshots",`optOut__${CHAN}`), {kind:"optOut",userId:CHAN});
    // proofs
    await setDoc(doc(db,"proofs","pr1"), {targetId:"t1",coachId:CHAN,requestedById:ASHA,mediaUrl:"data:image/jpeg;base64,AAA"});
    // workspaces
    await setDoc(doc(db,"workspaces","ws_1"), {name:"Org A",ownerId:ROOT});
    await setDoc(doc(db,"workspaceMembers","ws_1__"+CHAN), {workspaceId:"ws_1",userId:CHAN,role:"member"});
  });

  console.log("\n-- goalSheets --");
  await check("owner reads own sheet", ()=>assertSucceeds(getDoc(doc(as(CHAN),"goalSheets",CHAN))));
  await check("direct upline reads sheet", ()=>assertSucceeds(getDoc(doc(as(ASHA),"goalSheets",CHAN))));
  await check("DENY grandparent reads sheet", ()=>assertFails(getDoc(doc(as(ROOT),"goalSheets",CHAN))));
  await check("owner reads own private needs", ()=>assertSucceeds(getDoc(doc(as(CHAN),"goalSheets",CHAN,"private","needs"))));
  await check("DENY direct upline reads private needs when shareNeeds false", ()=>assertFails(getDoc(doc(as(ASHA),"goalSheets",CHAN,"private","needs"))));
  await check("DENY direct upline reads private needs when shareNeeds ABSENT", ()=>assertFails(getDoc(doc(as(ROOT),"goalSheets",BHAV,"private","needs"))));
  await check("DENY list goalSheets collection", ()=>assertFails(getDocs(collection(as(ASHA),"goalSheets"))));

  console.log("\n-- goalConversations --");
  await check("coach reads own conversation", ()=>assertSucceeds(getDoc(doc(as(CHAN),"goalConversations","t1"))));
  await check("DENY unpinned list", ()=>assertFails(getDocs(collection(as(ASHA),"goalConversations"))));
  await check("list pinned coachId==me", ()=>assertSucceeds(getDocs(query(collection(as(CHAN),"goalConversations"),where("coachId","==",CHAN)))));

  console.log("\n-- qualifications --");
  await check("DENY unpinned list", ()=>assertFails(getDocs(collection(as(CHAN),"qualifications"))));
  await check("DENY list audience=='all' with no creator pin", ()=>assertFails(getDocs(query(collection(as(CHAN),"qualifications"),where("audience","==","all")))));
  await check("grandchild getDoc on audience=all qualification", ()=>assertSucceeds(getDoc(doc(as(CHAN),"qualifications","q1"))));
  await check("DENY grandchild getDoc on audience=direct qualification", ()=>assertFails(getDoc(doc(as(CHAN),"qualifications","q2"))));
  await check("DENY outsider getDoc", ()=>assertFails(getDoc(doc(as(OUT),"qualifications","q1"))));

  console.log("\n-- duplicationScores / voiceLogs --");
  await check("owner reads own score", ()=>assertSucceeds(getDoc(doc(as(CHAN),"duplicationScores",`${CHAN}__2026-08`))));
  await check("DENY upline reads score", ()=>assertFails(getDoc(doc(as(ASHA),"duplicationScores",`${CHAN}__2026-08`))));
  await check("DENY unpinned list duplicationScores", ()=>assertFails(getDocs(collection(as(CHAN),"duplicationScores"))));
  await check("DENY upline reads voice log", ()=>assertFails(getDoc(doc(as(ASHA),"voiceLogs",`${CHAN}__2026-08-24`))));
  await check("owner reads own voice log", ()=>assertSucceeds(getDoc(doc(as(CHAN),"voiceLogs",`${CHAN}__2026-08-24`))));

  console.log("\n-- leaderboardSnapshots --");
  await check("DENY roster read by member of scope", ()=>assertFails(getDoc(doc(as(CHAN),"leaderboardSnapshots","r_club_bengaluru"))));
  await check("club podium read by same-city coach (own org)", ()=>assertSucceeds(getDoc(doc(as(CHAN),"leaderboardSnapshots","p_club_bengaluru"))));
  await check("!! club podium read by coach in ANOTHER workspace, same city", ()=>assertSucceeds(getDoc(doc(as(OUT),"leaderboardSnapshots","p_club_bengaluru"))));
  await check("DENY outsider reads org podium", ()=>assertFails(getDoc(doc(as(OUT),"leaderboardSnapshots","p_org_root"))));
  await check("DENY unpinned list of snapshots", ()=>assertFails(getDocs(collection(as(CHAN),"leaderboardSnapshots"))));
  await check("DENY list kind==podium unpinned scope", ()=>assertFails(getDocs(query(collection(as(CHAN),"leaderboardSnapshots"),where("kind","==","podium")))));
  await check("DENY read someone else's optOut", ()=>assertFails(getDoc(doc(as(ASHA),"leaderboardSnapshots",`optOut__${CHAN}`))));

  console.log("\n-- proofs --");
  await check("coach reads own proof", ()=>assertSucceeds(getDoc(doc(as(CHAN),"proofs","pr1"))));
  await check("requester reads proof", ()=>assertSucceeds(getDoc(doc(as(ASHA),"proofs","pr1"))));
  await check("DENY grandparent reads proof", ()=>assertFails(getDoc(doc(as(ROOT),"proofs","pr1"))));
  await check("DENY unpinned proofs list", ()=>assertFails(getDocs(collection(as(ASHA),"proofs"))));

  console.log("\n-- workspaces --");
  await check("member reads own workspace", ()=>assertSucceeds(getDoc(doc(as(CHAN),"workspaces","ws_1"))));
  await check("DENY outsider reads workspace", ()=>assertFails(getDoc(doc(as(OUT),"workspaces","ws_1"))));
  await check("DENY unpinned workspaceMembers list", ()=>assertFails(getDocs(collection(as(CHAN),"workspaceMembers"))));
  await check("member lists workspaceMembers pinned", ()=>assertSucceeds(getDocs(query(collection(as(CHAN),"workspaceMembers"),where("workspaceId","==","ws_1")))));

  console.log(fails===0?"\nALL AS EXPECTED":`\n${fails} deviation(s)`);
  await env.cleanup();
}
main();
