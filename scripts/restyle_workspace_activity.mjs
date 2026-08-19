import fs from "node:fs";
const file = "FireboxAIStudio.jsx";
const source = fs.readFileSync(file, "utf8");
const lines = source.split("\n");
const index = lines.findIndex((line) => line.includes("LIVE ACTIVITY"));
if (index < 0) throw new Error("LIVE ACTIVITY renderer not found");
const replacement = `                    <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"16px 18px", background:palette.editorBg }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingBottom:10, marginBottom:12, borderBottom:\`1px solid \${palette.border}\` }}>
                        <span style={{ color:palette.textMuted, fontSize:10, fontWeight:800, letterSpacing:"0.12em" }}>AGENT ACTIVITY</span>
                        {phase === "building" && <span style={{ color:palette.accent, fontSize:10, display:"flex", alignItems:"center", gap:5 }}><Loader2 size={11} style={{ animation:"spin 1s linear infinite" }}/> Working</span>}
                      </div>
                      {liveActivity.length === 0 ? <div style={{ color:palette.textFaint, fontSize:11, lineHeight:1.6, padding:"12px 0" }}>Agent activity will appear here as Firebox works.</div> : <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                        {liveActivity.slice(-24).map(item => {
                          const iconColor = item.status === "error" ? palette.error : item.status === "done" ? palette.success : palette.accent;
                          const ActivityIcon = item.kind === "tool" ? Terminal : item.kind === "file" ? FileCode : item.kind === "preview" ? Eye : item.kind === "build" ? CheckCircle2 : item.status === "error" ? AlertTriangle : Sparkles;
                          return <div key={item.id} style={{ display:"flex", alignItems:"flex-start", gap:10, color:palette.text, fontSize:12, lineHeight:1.55 }}>
                            <span style={{ flex:"0 0 26px", width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center", color:iconColor, marginTop:1 }}><ActivityIcon size={16} strokeWidth={1.8}/></span>
                            <div style={{ minWidth:0, flex:1 }}><div style={{ color:palette.textActive, fontWeight:650 }}>{item.label}</div><div style={{ color:item.status === "error" ? palette.error : palette.textMuted, overflowWrap:"anywhere" }}>{item.text}</div></div>
                          </div>;
                        })}
                      </div>}
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:20, paddingTop:12, borderTop:\`1px solid \${palette.border}\`, color:palette.textActive, fontSize:12, fontWeight:700 }}><FireboxAgentMark size={18} animated={phase === "building" || aiThinking} state={phase === "error" ? "error" : phase === "complete" ? "complete" : "working"}/><span>Firebox Agent</span>{(phase === "building" || aiThinking) && <ThinkingDots/>}</div>
                      {agentStates.some(state => state.status !== "idle") && <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:12 }}>{AGENT_META.map(({ name, Icon, color }) => { const state = agentStates.find(item => item.name === name); if (!state || state.status === "idle") return null; const active = state.status === "working"; const done = state.status === "done"; const failed = state.status === "error"; return <div key={name} style={{ display:"flex", alignItems:"center", gap:9, color:active ? color : done ? palette.success : failed ? palette.error : palette.textMuted, fontSize:11 }}><Icon size={15}/><span style={{ color:palette.textActive, fontWeight:600 }}>{name}</span><span style={{ color:palette.textMuted }}>{active ? "Working" : done ? "Completed" : "Failed"}</span>{active && <ThinkingDots/>}</div>; })}</div>}
                      {workflowStage?.activity && <div style={{ marginTop:14, color:palette.textFaint, fontSize:11, lineHeight:1.5 }}>{workflowStage.activity}</div>}
                    </div>`;
lines[index] = replacement;
fs.writeFileSync(file, lines.join("\n"));
console.log(`Replaced Workspace activity renderer at line ${index + 1}`);
